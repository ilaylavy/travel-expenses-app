// ai-query Edge Function
//
// Single-call server-side implementation. The mobile app sends a question +
// tripId + recent conversation history; this function:
//   1. Authenticates the caller and verifies trip membership.
//   2. Builds dynamic trip context (members, categories, totals, places).
//   3. Asks gpt-4o-mini to classify intent and emit SELECT queries.
//   4. Validates and executes those queries against Postgres.
//   5. Asks gpt-4o-mini to summarize the result rows back as friendly prose.
//
// Privacy: every expenses query is required to filter
//   (is_private = false OR user_id = '<callerId>')
// so members never see another member's private expenses through the AI.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

import { corsHeaders } from '../_shared/cors.ts';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';
const MAX_HISTORY = 10;
const STATEMENT_TIMEOUT_MS = 5000;
const MAX_QUERIES = 3;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Intent = 'DATA_QUERY' | 'CHITCHAT' | 'CLARIFY' | 'OUT_OF_SCOPE';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  question?: unknown;
  tripId?: unknown;
  conversationHistory?: unknown;
}

interface PlannedQuery {
  sql: string;
  purpose: string;
}

interface PlannerResponse {
  intent: Intent;
  reasoning: string;
  directResponse: string;
  queries: PlannedQuery[];
  explanation: string;
}

interface QueryResult {
  purpose: string;
  sql: string;
  rows?: unknown[];
  error?: string;
}

interface TripContext {
  trip: {
    id: string;
    name: string;
    emoji: string;
    start_date: string;
    end_date: string | null;
    base_currency: string;
    home_currency: string;
    budget: string | null;
  };
  members: { name: string; role: string }[];
  categoriesUsed: string[];
  stats: {
    expense_count: number;
    total_base: string;
    total_home: string;
    first_expense_date: string | null;
    last_expense_date: string | null;
  };
  paymentMethods: string[];
  places: string[];
  flags: {
    has_refunds: boolean;
    has_excluded_expenses: boolean;
    has_spread_expenses: boolean;
    has_splits: boolean;
  };
  // Pre-formatted current balance, e.g. "Maya owes Ilay €54.75". Empty
  // string when the trip is solo or has no splits. Lets the summarizer
  // answer "what's the balance?" without re-deriving math from raw rows.
  balance_summary: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

function chatResponse(answer: string, followUps: string[], intent: string, error?: string): Response {
  const body: Record<string, unknown> = { answer, followUps, intent };
  if (error) body.error = error;
  return jsonResponse(body);
}

function sanitizeHistory(raw: unknown): ConversationMessage[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: ConversationMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
      cleaned.push({ role, content });
    }
  }
  return cleaned.slice(-MAX_HISTORY);
}

async function callOpenAIJson(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
): Promise<unknown> {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('OpenAI returned no content');
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`OpenAI returned non-JSON content: ${content.slice(0, 200)}`);
  }
}

const PLANNER_SYSTEM_TEMPLATE = `You are the planner for a travel expense AI assistant. Decide what the user wants and, when they want data, write Postgres SELECT/WITH queries against the schema below.

DATABASE SCHEMA (Postgres):

expenses (each row is one spending record logged by a user)
  - id: UUID primary key
  - trip_id: UUID (FK → trips.id) — always filter by this
  - user_id: UUID (FK → profiles.id) — who logged and paid for this expense
  - amount: decimal — in the original transaction currency. NEGATIVE for refunds.
  - currency: text — ISO currency code of the transaction (EUR, USD, ILS, etc.)
  - converted_amount: decimal — the same expense converted to the trip's home currency
  - exchange_rate: decimal — the rate used at time of entry (locked, doesn't change)
  - category_id: UUID (FK → categories.id)
  - note: text — user's description (e.g. "Tapas at La Boqueria", "Airport taxi")
  - payment_method: text — how they paid (e.g. "Credit", "Cash", "Debit", or custom values)
  - latitude: float, longitude: float — GPS coordinates where the expense happened
  - place_name: text — human-readable location (e.g. "La Boqueria, Barcelona", "Sagrada Familia")
  - expense_date: date — when the expense occurred
  - expense_time: time — time of day
  - is_refund: boolean — true = refund, amount is NEGATIVE
  - is_excluded_from_daily_metrics: boolean — excluded ONLY from daily chart and daily average. Still counts in totals, budgets, category breakdowns.
  - is_private: boolean — only visible to its author, hidden from other trip members
  - is_split: boolean — true if this expense is divided among trip members via expense_splits
  - spread_start_date: date (nullable) — if set, the expense cost is spread evenly across this date range for daily calculations
  - spread_end_date: date (nullable)
  - deleted_at: timestamptz (nullable) — soft delete. ALWAYS filter WHERE deleted_at IS NULL.

expense_splits (how a split expense is divided among trip members — only exists when expenses.is_split = true)
  - id: UUID primary key
  - expense_id: UUID (FK → expenses.id) — the parent expense
  - user_id: UUID (FK → profiles.id) — the person who owes this share
  - amount: decimal — their share in the expense's original currency
  - is_payer: boolean — true for the person who actually paid (matches expenses.user_id)
  - deleted_at: timestamptz (nullable) — ALWAYS filter WHERE deleted_at IS NULL
  - UNIQUE(expense_id, user_id)

categories (expense categories — each has an emoji and color)
  - id: UUID primary key
  - name: text — display name (e.g. "Food", "Transport", "Hotel", "Flight", "Coffee", "Shopping", "Activities", "Other")
  - emoji: text — visual icon (e.g. "🍽️", "🚗")
  - trip_id: UUID (nullable) — NULL = global default category. Non-NULL = custom category created for a specific trip.
  - is_archived: boolean — archived categories are hidden but still referenced by existing expenses

trips (each trip is a container for expenses)
  - id: UUID primary key
  - name: text — trip display name
  - emoji: text — trip icon
  - base_currency: text — the main currency used at the destination (EUR for a Europe trip)
  - home_currency: text — the user's native currency for seeing "how much did this cost me at home"
  - budget: decimal (nullable) — spending limit, in base_currency. NULL = no budget set.
  - start_date: date
  - end_date: date (nullable) — NULL means ongoing (e.g. "Home 2026")
  - deleted_at: timestamptz (nullable) — ALWAYS filter WHERE deleted_at IS NULL

profiles (user display info)
  - id: UUID primary key
  - name: text — display name (e.g. "Ilay", "Maya")

trip_members (who participates in a trip)
  - trip_id: UUID (FK → trips.id)
  - user_id: UUID (FK → profiles.id)
  - role: text — "owner" or "member"
  - joined_at: timestamptz (nullable) — NULL = invited but not accepted. Always filter joined_at IS NOT NULL.
  - UNIQUE(trip_id, user_id)

KEY RELATIONSHIPS:
  expenses.category_id → categories.id (JOIN to get category name and emoji)
  expenses.trip_id → trips.id
  expenses.user_id → profiles.id (JOIN to get who paid/logged)
  expense_splits.expense_id → expenses.id
  expense_splits.user_id → profiles.id (JOIN to get who owes)
  trip_members.trip_id → trips.id
  trip_members.user_id → profiles.id

═══════════════════════════════════════
CRITICAL QUERY RULES
═══════════════════════════════════════

── SAFETY (queries rejected if missing) ──

1. ALWAYS: WHERE deleted_at IS NULL on every table that has it (expenses, expense_splits, trips, categories).
2. ALWAYS: WHERE trip_id = '<<TRIP_ID>>' on expense queries.
3. PRIVACY: every query touching expenses MUST include (is_private = false OR user_id = '<<CALLER_ID>>'). Both literals must appear verbatim. Queries on expense_splits must JOIN through expenses with the same privacy filter.
4. ALWAYS include LIMIT (default 100, lower for "top N"). EXCEPTION: pure aggregates (SUM/COUNT/AVG/MIN/MAX with no GROUP BY) return one row — no LIMIT needed.
5. SELECT and WITH only. Never INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE.

── EXPENSES ──

6. REFUNDS: is_refund = true → amount is NEGATIVE. Exclude from totals/averages with is_refund = false UNLESS the user asks about refunds or "net spending."
7. EXCLUDED FROM DAILY: is_excluded_from_daily_metrics only affects daily-chart and daily-average queries. Do NOT filter on it for totals, budgets, or category breakdowns.
8. SPREAD: when calculating daily spend, divide amount by (spread_end_date - spread_start_date + 1). For non-daily questions, use the full amount.
9. CURRENCY: 'amount' = trip currency, 'converted_amount' = home currency. Default to base_currency. Never mix currencies in a SUM.

── SPLITS ──

10. PERSONAL & PER-MEMBER SPENDING — questions asking what one specific person spent (the caller themselves, or a named trip member):
    Sum each expense's share for the target user. For split expenses (is_split = true) the share is the target's row in expense_splits — or 0 if no row exists for them. For non-split expenses the share is e.amount IF the target paid the expense (e.user_id = target's id), else 0. The LEFT JOIN ensures missing rows contribute 0 rather than NULL. NEVER add filters that depend on the share's value or the payer flag (e.g. excluding rows where amount = 0 or is_payer is true) — those silently drop valid shares, including the case where one participant absorbs the full split.

    Use the caller pattern when the question is about the caller (any first-person phrasing). Use the per-member pattern when the question names a specific member from TRIP CONTEXT.

    Caller pattern — substitute '<<CALLER_ID>>' verbatim in BOTH branches and the privacy disjunction:
      SELECT COALESCE(SUM(
        CASE
          WHEN e.is_split THEN COALESCE(es.amount, 0)
          WHEN e.user_id = '<<CALLER_ID>>' THEN e.amount
          ELSE 0
        END
      ), 0) AS spent
      FROM expenses e
      LEFT JOIN expense_splits es
        ON es.expense_id = e.id
        AND es.user_id = '<<CALLER_ID>>'
        AND es.deleted_at IS NULL
      WHERE e.trip_id = '<<TRIP_ID>>'
        AND e.deleted_at IS NULL
        AND (e.is_private = false OR e.user_id = '<<CALLER_ID>>')
        AND e.is_refund = false

    Per-member pattern — resolve the member's id by joining profiles on the exact name from TRIP CONTEXT:
      SELECT COALESCE(SUM(
        CASE
          WHEN e.is_split THEN COALESCE(es.amount, 0)
          WHEN e.user_id = m.id THEN e.amount
          ELSE 0
        END
      ), 0) AS spent
      FROM expenses e
      JOIN profiles m ON m.name = '<member-name-from-context>'
      LEFT JOIN expense_splits es
        ON es.expense_id = e.id
        AND es.user_id = m.id
        AND es.deleted_at IS NULL
      WHERE e.trip_id = '<<TRIP_ID>>'
        AND e.deleted_at IS NULL
        AND (e.is_private = false OR e.user_id = '<<CALLER_ID>>')
        AND e.is_refund = false

    Singular phrasing about one person ("I", "me", or a single member name) → personal/per-member share. Plural or trip-scoped phrasing about the group as a whole ("we", "the trip", "in total", "altogether") → rule #11. Never substitute SUM(e.amount) for a singular question.

11. TRIP TOTAL — questions about the whole trip's cost regardless of who paid or how it was split: use SUM(e.amount) directly with no CASE or share JOIN. Each expense contributes its full amount once.
12. BALANCE / SETTLEMENT ("how much do I owe", "who owes whom", "settle up"): payer (is_payer = true) paid full amount. Each non-payer owes the payer their split amount. Net = debts one direction minus the other.
13. Non-split expenses (is_split = false) generate NO debt.

── CATEGORIES ──

14. Always JOIN categories to get name and emoji — never return raw category_id.
15. Use exact category names from TRIP CONTEXT (case-sensitive).
16. When grouping by category, include emoji: SELECT c.emoji, c.name, ...
17. Ignore archived categories unless they have expenses.

── MEMBERS ──

18. Always JOIN profiles for display names — never return raw user_id.
19. Active members only: WHERE joined_at IS NOT NULL.
20. "Who spent more" in a trip with splits: clarify total paid vs personal share if ambiguous — show both.
21. Use exact member names from TRIP CONTEXT.

── LOCATIONS ──

22. place_name = "venue, city" format. For city queries use LIKE '%Barcelona%' or split on comma.
23. "Where did I spend the most" → GROUP BY place_name or extract city.
24. Some expenses have NULL location — don't exclude them from totals unless the question is about locations/map.

── DATES ──

25. "Today" = CURRENT_DATE. "Yesterday" = CURRENT_DATE - 1. "This week" = last 7 days. "This month" = current calendar month (date_trunc).
26. Monthly grouping: TO_CHAR(expense_date, 'YYYY-MM') or date_trunc('month', expense_date).
27. "Most expensive day" → GROUP BY expense_date ORDER BY SUM(amount) DESC LIMIT 1.
28. Days elapsed = CURRENT_DATE - start_date. Days remaining = end_date - CURRENT_DATE (NULL if ongoing).

── PAYMENT METHODS ──

29. GROUP BY payment_method for "cash vs card" comparisons.
30. Use exact method values from TRIP CONTEXT — they're free text.

── BUDGET ──

31. Budget is in base_currency. Compare against SUM(amount) WHERE is_refund = false.
32. "Am I on budget" → spent vs budget AND daily rate vs (remaining budget / remaining days).
33. If budget is NULL → say "no budget set", don't invent one.

── CONVERSATION ──

34. Resolve references: "and transport?" after food → "how much did I spend on transport?"
35. "Compare that to..." → look at previous question to know what to compare against.

OUTPUT FORMAT (always valid JSON, no prose outside JSON):
{
  "intent": "DATA_QUERY" | "CHITCHAT" | "CLARIFY" | "OUT_OF_SCOPE",
  "reasoning": "one sentence",
  "directResponse": "non-empty only for CHITCHAT/CLARIFY/OUT_OF_SCOPE",
  "queries": [{ "sql": "SELECT ...", "purpose": "what this answers" }],
  "explanation": "what the combined results show (DATA_QUERY only)"
}

INTENT RULES:
- DATA_QUERY: answerable from the database → emit 1-3 SQL queries.
- CHITCHAT: greetings, thanks, casual → warm reply mentioning you help with expense questions. queries: [].
- CLARIFY: about expenses but ambiguous → ask ONE specific clarifying question. queries: [].
- OUT_OF_SCOPE: nothing to do with spending → politely explain. queries: [].
- Resolve coreference from conversation history.`;

function buildPlannerSystem(tripId: string, callerId: string): string {
  return PLANNER_SYSTEM_TEMPLATE
    .replaceAll('<<TRIP_ID>>', tripId)
    .replaceAll('<<CALLER_ID>>', callerId);
}

function buildPlannerUser(
  question: string,
  context: TripContext,
  history: ConversationMessage[],
): string {
  const lines: string[] = [];
  lines.push('TRIP CONTEXT (JSON):');
  lines.push(JSON.stringify(context, null, 2));
  lines.push('');
  if (history.length > 0) {
    lines.push('CONVERSATION HISTORY (oldest first):');
    for (const m of history) lines.push(`${m.role}: ${m.content}`);
    lines.push('');
  }
  lines.push(`USER QUESTION: ${question}`);
  return lines.join('\n');
}

const SUMMARIZER_SYSTEM = `You are a friendly travel expense assistant helping a traveler understand their spending.

FORMATTING RULES:
- Use the correct currency symbol from trip context (€, ₪, $, £, ¥, etc.). If unsure, use the ISO code.
- Format large numbers with commas: €1,247 not €1247.
- Round to 2 decimal places for amounts, 0 for percentages.

ANSWER RULES:
- Be concise: 2-4 sentences max.
- Include percentages where meaningful ("that's 32% of your total").
- Compare to budget when relevant ("you're at 65% of your €5,000 budget with 8 days left").
- For member comparisons: show both amounts, the difference, and who's ahead.
- For category breakdowns: list top 3-4 categories with amounts and percentages.
- For daily questions: mention the specific date(s) and amounts.
- For location questions: use the place name, not coordinates.
- For balance/settlement: be specific — "Maya owes you €54.75" not "there's a difference."
- For split expenses: when showing personal spending, clarify it's the user's share if relevant ("Your share of food is €120 out of €180 total").

EMPTY / ERROR HANDLING:
- Empty results: "I don't see any [X] expenses on this trip yet" — don't say "no data found."
- Query error: "I had trouble looking that up. Try rephrasing or ask something different."
- Partially failed: answer from what worked, mention what didn't.

FOLLOW-UPS:
- Always suggest 2-3 follow-up questions.
- Make them contextual to what was just asked — not generic.
- Phrase them naturally, like a friend would ask: "What about transport?" not "Query transport category expenses."
- If the user asked about a category, suggest another category or a comparison.
- If about a member, suggest balance or the other member's spending.
- If about totals, suggest daily average or budget status.

TONE:
- Casual, friendly, slightly playful. Travel app vibes, not a bank statement.
- Use emoji sparingly — one per answer max, only if it fits naturally.

Respond as JSON only:
{ "answer": "...", "followUps": ["...", "...", "..."] }`;

function buildSummarizerUser(
  question: string,
  context: TripContext,
  history: ConversationMessage[],
  results: QueryResult[],
): string {
  const lines: string[] = [];
  lines.push('TRIP CONTEXT (JSON):');
  lines.push(JSON.stringify(context, null, 2));
  lines.push('');
  if (history.length > 0) {
    lines.push('CONVERSATION HISTORY (oldest first):');
    for (const m of history) lines.push(`${m.role}: ${m.content}`);
    lines.push('');
  }
  lines.push(`USER QUESTION: ${question}`);
  lines.push('');
  lines.push('QUERY RESULTS:');
  lines.push(JSON.stringify(results, null, 2));
  return lines.join('\n');
}

const FORBIDDEN_TOKEN_RE = /\b(insert|update|delete|drop|alter|create|truncate|attach|detach|pragma|vacuum|grant|revoke|copy|merge)\b/i;
const EXPENSES_REF_RE = /\bexpenses\b/i;
// Note: \bexpenses\b does NOT match within `expense_splits` because `_` is a
// word character, so the trailing word boundary fails. Use a separate regex
// for split queries — without it, a SELECT FROM expense_splits would skip
// the privacy/caller checks entirely.
const EXPENSE_SPLITS_REF_RE = /\bexpense_splits\b/i;
const AGGREGATE_FN_RE = /\b(sum|count|avg|min|max)\s*\(/i;
const GROUP_BY_RE = /\bgroup\s+by\b/i;
const DEFAULT_LIMIT = 500;

function ensureLimit(sql: string): string {
  if (/\blimit\b/i.test(sql)) return sql;
  const isPureAggregate = AGGREGATE_FN_RE.test(sql) && !GROUP_BY_RE.test(sql);
  if (isPureAggregate) return sql;
  return sql.replace(/;?\s*$/, '') + ` LIMIT ${DEFAULT_LIMIT}`;
}

// The planner is told to embed the caller's UUID verbatim in the privacy
// disjunction `is_private = false OR user_id = '<caller>'`. It occasionally
// mangles the literal (truncated chars, wrong digit). Rewrite the UUID slot
// that follows `is_private = false OR ... user_id =` so a planner typo does
// not bounce a query that is otherwise correct. Other user_id comparisons
// (e.g. comparing two members) are left untouched.
function ensurePrivacyCallerId(sql: string, callerId: string): string {
  return sql.replace(
    /(is_private\s*=\s*false\s+OR\s+(?:\w+\.)?user_id\s*=\s*')([^']+)(')/gi,
    (_match, prefix, _uuid, suffix) => `${prefix}${callerId}${suffix}`,
  );
}

function validateSql(sql: string, tripId: string, callerId: string): string | null {
  const trimmed = sql.trim();
  if (trimmed.length === 0) return 'empty SQL';
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith('select') && !lower.startsWith('with')) {
    return 'must start with SELECT or WITH';
  }
  if (FORBIDDEN_TOKEN_RE.test(lower)) {
    return 'contains forbidden mutating keyword';
  }
  if (!sql.includes(tripId)) {
    return 'must include the trip id literal';
  }
  if (!/deleted_at\s+is\s+null/i.test(sql)) {
    return 'must include deleted_at IS NULL';
  }
  if (EXPENSES_REF_RE.test(sql)) {
    if (!/is_private\s*=\s*false/i.test(sql)) {
      return 'expenses query must filter is_private = false';
    }
    if (!sql.includes(callerId)) {
      return 'expenses query must include caller user_id literal';
    }
  }
  if (EXPENSE_SPLITS_REF_RE.test(sql)) {
    // The planner is told to JOIN expense_splits through expenses with the
    // privacy filter applied at the parent. These checks enforce that shape.
    if (!/is_private\s*=\s*false/i.test(sql)) {
      return 'expense_splits query must filter is_private = false on the joined expenses';
    }
    if (!sql.includes(callerId)) {
      return 'expense_splits query must include caller user_id literal';
    }
    // Both expenses and expense_splits have deleted_at; require the filter
    // to appear at least twice so the planner doesn't filter only one table.
    const deletedAtMatches = sql.match(/deleted_at\s+is\s+null/gi) ?? [];
    if (deletedAtMatches.length < 2) {
      return 'expense_splits query must filter deleted_at IS NULL on both expense_splits and expenses';
    }
  }
  return null;
}

async function buildTripContext(
  admin: SupabaseClient,
  sql: ReturnType<typeof postgres>,
  tripId: string,
  callerId: string,
): Promise<TripContext | null> {
  const { data: trip, error: tripError } = await admin
    .from('trips')
    .select('id, name, emoji, start_date, end_date, base_currency, home_currency, budget, deleted_at')
    .eq('id', tripId)
    .is('deleted_at', null)
    .maybeSingle();

  if (tripError) {
    console.error('ai-query: trip fetch error', tripError.message);
    return null;
  }
  if (!trip) return null;

  const { data: memberRows, error: memberError } = await admin
    .from('trip_members')
    .select('role, joined_at, profiles!inner(name)')
    .eq('trip_id', tripId)
    .not('joined_at', 'is', null);

  if (memberError) {
    console.error('ai-query: members fetch error', memberError.message);
    return null;
  }

  const members = (memberRows ?? [])
    .map((row: { role: string; profiles: { name: string } | { name: string }[] | null }) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return { name: profile?.name ?? 'Unknown', role: row.role };
    });

  // Aggregate stats — privacy-filtered.
  const statsRows = await sql`
    select
      count(*)::int                                                                            as expense_count,
      coalesce(sum(amount) filter (where is_refund = false), 0)::text                          as total_base,
      coalesce(sum(converted_amount) filter (where is_refund = false), 0)::text                 as total_home,
      min(expense_date)::text                                                                  as first_expense_date,
      max(expense_date)::text                                                                  as last_expense_date,
      bool_or(is_refund)                                                                       as has_refunds,
      bool_or(is_excluded_from_daily_metrics)                                                  as has_excluded_expenses,
      bool_or(spread_start_date is not null)                                                   as has_spread_expenses
    from public.expenses
    where trip_id = ${tripId}
      and deleted_at is null
      and (is_private = false or user_id = ${callerId})
  `;
  const stats = statsRows[0] ?? {};

  const categoryRows = await sql`
    select distinct c.name
    from public.expenses e
    join public.categories c on c.id = e.category_id
    where e.trip_id = ${tripId}
      and e.deleted_at is null
      and (e.is_private = false or e.user_id = ${callerId})
    order by c.name
    limit 50
  `;
  const paymentRows = await sql`
    select distinct payment_method
    from public.expenses
    where trip_id = ${tripId}
      and deleted_at is null
      and (is_private = false or user_id = ${callerId})
      and payment_method is not null
    limit 20
  `;
  const placeRows = await sql`
    select distinct place_name
    from public.expenses
    where trip_id = ${tripId}
      and deleted_at is null
      and (is_private = false or user_id = ${callerId})
      and place_name is not null
    limit 50
  `;

  // Detect whether this trip has any split expenses, then (when shared and
  // splits exist) pre-compute who owes whom so the summarizer can quote it
  // without re-deriving the math.
  const splitsRows = await sql`
    select exists(
      select 1 from public.expenses
      where trip_id = ${tripId}
        and deleted_at is null
        and is_split = true
    ) as has_splits
  `;
  const hasSplits = splitsRows[0]?.has_splits ?? false;

  let balanceSummary = '';
  if (members.length > 1 && hasSplits) {
    const balanceRows = await sql`
      select
        payer_profile.name as payer_name,
        debtor_profile.name as debtor_name,
        sum(es_debtor.amount)::text as total_owed
      from public.expense_splits es_payer
      join public.expense_splits es_debtor
        on es_debtor.expense_id = es_payer.expense_id
        and es_debtor.is_payer = false
        and es_debtor.deleted_at is null
      join public.expenses e
        on e.id = es_payer.expense_id
        and e.deleted_at is null
        and (e.is_private = false or e.user_id = ${callerId})
      join public.profiles payer_profile on payer_profile.id = es_payer.user_id
      join public.profiles debtor_profile on debtor_profile.id = es_debtor.user_id
      where es_payer.is_payer = true
        and es_payer.deleted_at is null
        and e.trip_id = ${tripId}
      group by payer_profile.name, debtor_profile.name
    `;
    balanceSummary = formatBalanceSummary(
      balanceRows as Array<{ payer_name: string; debtor_name: string; total_owed: string }>,
      trip.base_currency,
    );
  }

  return {
    trip: {
      id: trip.id,
      name: trip.name,
      emoji: trip.emoji,
      start_date: trip.start_date,
      end_date: trip.end_date,
      base_currency: trip.base_currency,
      home_currency: trip.home_currency,
      budget: trip.budget,
    },
    members,
    categoriesUsed: categoryRows.map((r: { name: string }) => r.name),
    stats: {
      expense_count: stats.expense_count ?? 0,
      total_base: stats.total_base ?? '0',
      total_home: stats.total_home ?? '0',
      first_expense_date: stats.first_expense_date ?? null,
      last_expense_date: stats.last_expense_date ?? null,
    },
    paymentMethods: paymentRows.map((r: { payment_method: string }) => r.payment_method),
    places: placeRows.map((r: { place_name: string }) => r.place_name),
    flags: {
      has_refunds: stats.has_refunds ?? false,
      has_excluded_expenses: stats.has_excluded_expenses ?? false,
      has_spread_expenses: stats.has_spread_expenses ?? false,
      has_splits: hasSplits,
    },
    balance_summary: balanceSummary,
  };
}

// Net the directed (payer, debtor) pairs returned by the balance query and
// render the surviving non-zero debts as a single human-readable sentence.
// e.g. "Maya owes Ilay €54.75" or "All members are settled up". Joining
// multi-pair results with " · " keeps the sentence quotable by the LLM.
const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  ILS: '₪',
  JPY: '¥',
  CHF: 'CHF ',
  CAD: 'CA$',
  AUD: 'A$',
};

function formatBalanceSummary(
  rows: Array<{ payer_name: string; debtor_name: string; total_owed: string }>,
  currency: string,
): string {
  // pair key = sorted(name1, name2). Track signed net from the alphabetically-
  // first name to the second (positive = first owes second).
  const pairs = new Map<string, { a: string; b: string; net: number }>();
  for (const row of rows) {
    const owed = Number(row.total_owed);
    if (!Number.isFinite(owed) || owed === 0) continue;
    const a = row.debtor_name < row.payer_name ? row.debtor_name : row.payer_name;
    const b = row.debtor_name < row.payer_name ? row.payer_name : row.debtor_name;
    const key = `${a}|${b}`;
    const sign = row.debtor_name === a ? 1 : -1;
    const existing = pairs.get(key) ?? { a, b, net: 0 };
    existing.net += sign * owed;
    pairs.set(key, existing);
  }

  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const lines: string[] = [];
  for (const { a, b, net } of pairs.values()) {
    const rounded = Math.round(net * 100) / 100;
    if (Math.abs(rounded) < 0.01) continue;
    const debtor = rounded > 0 ? a : b;
    const payer = rounded > 0 ? b : a;
    const amount = Math.abs(rounded).toFixed(2);
    lines.push(`${debtor} owes ${payer} ${symbol}${amount}`);
  }
  if (lines.length === 0) return 'All members are settled up';
  return lines.join(' · ');
}

async function runQueries(
  sql: ReturnType<typeof postgres>,
  queries: PlannedQuery[],
): Promise<QueryResult[]> {
  const results: QueryResult[] = [];
  for (const q of queries) {
    try {
      const rows = await sql.begin(async (tx: ReturnType<typeof postgres>) => {
        await tx.unsafe(`set local statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);
        await tx.unsafe(`set local idle_in_transaction_session_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);
        await tx.unsafe(`set local default_transaction_read_only = on`);
        return await tx.unsafe(q.sql);
      });
      results.push({ purpose: q.purpose, sql: q.sql, rows: rows as unknown[] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      console.error('ai-query: SQL execution failed', message, q.sql);
      results.push({ purpose: q.purpose, sql: q.sql, error: message });
    }
  }
  return results;
}

function genericFollowUps(): string[] {
  return [
    'How much have I spent so far?',
    'What category am I spending the most on?',
    'How am I doing against my budget?',
  ];
}

function clampStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .slice(0, max);
}

function parsePlannerResponse(raw: unknown): PlannerResponse {
  const obj = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const intentRaw = typeof obj.intent === 'string' ? obj.intent.toUpperCase() : '';
  const intent: Intent = (['DATA_QUERY', 'CHITCHAT', 'CLARIFY', 'OUT_OF_SCOPE'] as const)
    .find((i) => i === intentRaw) ?? 'CLARIFY';

  const queriesRaw = Array.isArray(obj.queries) ? obj.queries : [];
  const queries: PlannedQuery[] = [];
  for (const q of queriesRaw.slice(0, MAX_QUERIES)) {
    if (!q || typeof q !== 'object') continue;
    const sql = (q as { sql?: unknown }).sql;
    const purpose = (q as { purpose?: unknown }).purpose;
    if (typeof sql === 'string' && sql.trim().length > 0) {
      queries.push({
        sql: sql.trim(),
        purpose: typeof purpose === 'string' ? purpose : '',
      });
    }
  }

  return {
    intent,
    reasoning: typeof obj.reasoning === 'string' ? obj.reasoning : '',
    directResponse: typeof obj.directResponse === 'string' ? obj.directResponse : '',
    queries,
    explanation: typeof obj.explanation === 'string' ? obj.explanation : '',
  };
}

interface SummarizerResponse {
  answer: string;
  followUps: string[];
}

function parseSummarizerResponse(raw: unknown): SummarizerResponse {
  const obj = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const answer = typeof obj.answer === 'string' ? obj.answer : '';
  const followUps = clampStringArray(obj.followUps, 3);
  return { answer, followUps };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');

  if (!supabaseUrl || !anonKey || !serviceKey || !dbUrl || !openaiKey) {
    console.error('ai-query: missing env vars', {
      hasUrl: !!supabaseUrl,
      hasAnon: !!anonKey,
      hasService: !!serviceKey,
      hasDbUrl: !!dbUrl,
      hasOpenAi: !!openaiKey,
    });
    return errorResponse('Server misconfigured', 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return errorResponse('Unauthorized', 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return errorResponse('Unauthorized', 401);
  }
  const callerId = userData.user.id;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const tripId = typeof body.tripId === 'string' ? body.tripId.trim() : '';
  if (!question) return errorResponse('Missing question');
  if (!tripId || !UUID_RE.test(tripId)) return errorResponse('Missing or invalid tripId');
  const history = sanitizeHistory(body.conversationHistory);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Membership gate — pending invites (joined_at IS NULL) are not members.
  const { data: membership, error: memberError } = await admin
    .from('trip_members')
    .select('user_id, joined_at')
    .eq('trip_id', tripId)
    .eq('user_id', callerId)
    .not('joined_at', 'is', null)
    .maybeSingle();

  if (memberError) {
    console.error('ai-query: membership check error', memberError.message);
    return errorResponse('Lookup failed', 500);
  }
  if (!membership) {
    return jsonResponse({ error: 'Trip not found' }, 404);
  }

  const sql = postgres(dbUrl, {
    prepare: false,
    max: 4,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    const context = await buildTripContext(admin, sql, tripId, callerId);
    if (!context) {
      return jsonResponse({ error: 'Trip not found' }, 404);
    }

    // Diagnostic log: the user question is the most useful single field for
    // tracing answer quality. Trip + caller ids let us correlate against the
    // database state. Keep this short — no PII beyond the question itself.
    console.log('ai-query: question', JSON.stringify({
      tripId,
      callerId,
      question,
      historyLen: history.length,
    }));

    let planner: PlannerResponse;
    try {
      const raw = await callOpenAIJson(
        openaiKey,
        buildPlannerSystem(tripId, callerId),
        buildPlannerUser(question, context, history),
        0,
      );
      planner = parsePlannerResponse(raw);
    } catch (err) {
      console.error('ai-query: planner call failed', err instanceof Error ? err.message : err);
      return chatResponse(
        "I'm having trouble thinking right now. Try again in a moment.",
        [],
        'error',
      );
    }

    // Diagnostic log: planner output. SQL is included because it's the most
    // common source of "wrong answer" bugs and we want it in logs even when
    // the query succeeds (the failure paths already log it).
    console.log('ai-query: planner', JSON.stringify({
      intent: planner.intent,
      reasoning: planner.reasoning,
      queries: planner.queries.map((q) => ({ purpose: q.purpose, sql: q.sql })),
    }));

    if (planner.intent !== 'DATA_QUERY') {
      const fallback =
        planner.intent === 'CHITCHAT'
          ? "Hey! I can help with questions about your spending on this trip — totals, categories, comparisons, you name it."
          : planner.intent === 'OUT_OF_SCOPE'
            ? "I only help with questions about your spending on this trip. Got an expense question I can dig into?"
            : 'Could you give me a bit more detail on what you want to know?';
      const answer = planner.directResponse.trim().length > 0 ? planner.directResponse : fallback;
      return chatResponse(answer, genericFollowUps(), planner.intent);
    }

    if (planner.queries.length === 0) {
      return chatResponse(
        "I had trouble processing that question. Could you try rephrasing it?",
        genericFollowUps(),
        'DATA_QUERY',
        'planner returned no queries',
      );
    }

    for (const q of planner.queries) {
      q.sql = ensurePrivacyCallerId(q.sql, callerId);
      q.sql = ensureLimit(q.sql);
      const failure = validateSql(q.sql, tripId, callerId);
      if (failure) {
        console.error('ai-query: validator rejected SQL', failure, q.sql);
        return chatResponse(
          "I had trouble processing that question. Could you try rephrasing it?",
          genericFollowUps(),
          'DATA_QUERY',
          `SQL validation failed: ${failure}`,
        );
      }
    }

    const results = await runQueries(sql, planner.queries);

    let summary: SummarizerResponse;
    try {
      const raw = await callOpenAIJson(
        openaiKey,
        SUMMARIZER_SYSTEM,
        buildSummarizerUser(question, context, history, results),
        0.3,
      );
      summary = parseSummarizerResponse(raw);
    } catch (err) {
      console.error('ai-query: summarizer call failed', err instanceof Error ? err.message : err);
      return chatResponse(
        "I'm having trouble thinking right now. Try again in a moment.",
        [],
        'error',
      );
    }

    const followUps = summary.followUps.length > 0 ? summary.followUps : genericFollowUps();
    const answer = summary.answer.trim().length > 0
      ? summary.answer
      : "I couldn't put together an answer for that. Try rephrasing?";

    // Diagnostic log: the user-visible answer plus the row counts that
    // produced it. This pairs with the planner log to make it easy to see
    // whether a wrong answer came from bad SQL, empty rows, or summarizer drift.
    console.log('ai-query: answer', JSON.stringify({
      answer,
      rowCounts: results.map((r) => ({
        purpose: r.purpose,
        rowCount: r.rows?.length ?? 0,
        error: r.error ?? null,
      })),
    }));

    return chatResponse(answer, followUps, 'DATA_QUERY');
  } catch (err) {
    console.error('ai-query: unhandled error', err instanceof Error ? err.stack ?? err.message : err);
    return chatResponse(
      "I'm having trouble thinking right now. Try again in a moment.",
      [],
      'error',
    );
  } finally {
    try {
      await sql.end({ timeout: 1 });
    } catch {
      // ignore close errors
    }
  }
});
