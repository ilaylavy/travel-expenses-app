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
  language?: unknown;
}

type Language = 'en' | 'he';

const SUPPORTED_LANGUAGES: readonly Language[] = ['en', 'he'];
const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  he: 'Hebrew',
};

function parseLanguage(raw: unknown): Language {
  if (typeof raw !== 'string') return 'en';
  const lower = raw.toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lower) ? (lower as Language) : 'en';
}

function languageInstruction(language: Language): string {
  return `\n\nLanguage: write the "answer" and "followUps" in ${LANGUAGE_NAMES[language]}. Keep currency symbols, member names, place names, category names, and dates exactly as they appear in the trip context.`;
}

interface StaticFallbacks {
  thinkingError: string;
  chitchat: string;
  outOfScope: string;
  clarify: string;
  rephrase: string;
  noAnswer: string;
}

const STATIC_FALLBACKS: Record<Language, StaticFallbacks> = {
  en: {
    thinkingError: "I'm having trouble thinking right now. Try again in a moment.",
    chitchat:
      "Hey! I can help with questions about your spending on this trip — totals, categories, comparisons, you name it.",
    outOfScope:
      "I only help with questions about your spending on this trip. Got an expense question I can dig into?",
    clarify: 'Could you give me a bit more detail on what you want to know?',
    rephrase: 'I had trouble processing that question. Could you try rephrasing it?',
    noAnswer: "I couldn't put together an answer for that. Try rephrasing?",
  },
  he: {
    thinkingError: 'יש לי קושי לחשוב כרגע. נסה שוב בעוד רגע.',
    chitchat:
      'היי! אני יכול לעזור בשאלות על ההוצאות בטיול — סיכומים, קטגוריות, השוואות, מה שתרצה.',
    outOfScope:
      'אני עוזר רק בשאלות על ההוצאות בטיול הזה. יש שאלה על הוצאות שאוכל לבדוק?',
    clarify: 'אפשר לפרט קצת יותר מה תרצה לדעת?',
    rephrase: 'הייתה לי בעיה לעבד את השאלה הזאת. אפשר לנסח אחרת?',
    noAnswer: 'לא הצלחתי לבנות תשובה לזה. אפשר לנסח אחרת?',
  },
};

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
    // True when trips.budget is set OR any active member has a non-null
    // trip_members.budget. The follow-up filter and the LLM both rely on
    // this to decide whether budget-related questions are sensible.
    has_any_budget: boolean;
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

const PLANNER_SYSTEM_TEMPLATE = `You are the planner for a travel expense AI assistant. Decide what the user wants and, when they want data, write a Postgres SELECT/WITH query against the analytics views below.

The views have already done the hard work: splits are exploded into per-share rows, refund signs are baked in, spread expenses are split across days, balances are netted pairwise, and budget math is pre-computed. You pick the right view, apply simple filters, and let the result rows speak for themselves.

NEVER query raw tables (expenses, expense_splits, trip_members, categories, profiles, trips). Use the views.

═══════════════════════════════════════
THE FOUR VIEWS
═══════════════════════════════════════

══ expense_analysis — one row per (expense × share owner) ══
Use for: per-expense detail, category/place/payment breakdowns, "what did X spend on Y", individual expense lookups.

  trip_id            UUID
  expense_id         UUID
  payer_id           UUID            — who actually paid
  payer_name         text
  share_owner_id     UUID            — whose share this row is
  share_owner_name   text
  is_payer_of_share  bool            — true when share_owner = payer
  full_amount        decimal         — total expense, original currency
  full_amount_home   decimal         — total expense, home currency
  user_share         decimal         — this share owner's portion, original currency
  user_share_home    decimal         — this share owner's portion, home currency
  original_currency  text
  category_id        UUID
  category_name      text
  category_emoji     text
  expense_date       date
  expense_time       time
  place_name         text (nullable)
  latitude, longitude  float (nullable)
  note               text (nullable)
  payment_method     text (nullable)
  is_refund          bool            — refund rows have NEGATIVE user_share
  is_excluded_from_daily_metrics  bool
  is_private         bool
  is_split           bool
  spread_start_date, spread_end_date  date (nullable)

Per-person spending → filter share_owner_id. Trip-wide totals → no share filter; sum user_share/user_share_home over all rows (each expense splits into shares that already sum to full_amount, so the totals are correct without double counting).

══ daily_spending — one row per (trip, share owner, day) ══
Use for: daily charts, daily averages of historical spend, "most expensive day", date-bounded questions.

  trip_id, share_owner_id, share_owner_name
  expense_date       date
  daily_amount       decimal         — original currency
  daily_amount_home  decimal         — home currency
  expense_count      int

Already excludes refunds and is_excluded_from_daily_metrics. Spread expenses are exploded across the date range (a 5-night hotel becomes 5 rows of 1/5 the share each).

══ trip_summary — one row per (trip, active member) ══
Use for: "am I on budget", "how much have I spent total", "daily average", "days elapsed/remaining". A simple SELECT, no aggregation needed.

  trip_id, trip_name, trip_emoji, start_date, end_date, base_currency, home_currency
  user_id, user_name
  per_user_budget                       (nullable, in home_currency)
  total_spent_share, total_spent_share_home    — refunds excluded
  total_paid, total_paid_home                  — what this user paid for, refunds excluded
  expense_count
  days_elapsed                          int (≥ 1)
  days_remaining                        int (null if trip has no end_date)
  daily_average_share, daily_average_share_home   — pre-computed
  budget_remaining                      (nullable; null = no budget set)
  budget_percent                        (nullable; 0–100+, where 100 = at limit)

══ balance_ledger — one row per (trip, debtor, creditor) ══
Use for: "who owes whom", "how much do I owe", "settle up", "are we even".

  trip_id
  from_user_id, from_user_name   — debtor (owes money)
  to_user_id, to_user_name       — creditor (is owed money)
  net_amount                     decimal, always positive, in home_currency
  currency                       — same as trip's home_currency

Empty rows = everyone is settled up (or the trip has no splits). NEVER do math here — the netting is already done.

═══════════════════════════════════════
RULES
═══════════════════════════════════════

1. Only query the views above. Never reference expenses, expense_splits, trip_members, categories, profiles, trips directly.
2. Always filter trip_id = '<<TRIP_ID>>'.
3. Privacy filters:
   - expense_analysis: include (is_private = false OR share_owner_id = '<<CALLER_ID>>'). Both literals must appear verbatim.
   - daily_spending: filter share_owner_id = '<<CALLER_ID>>' for personal-daily questions. For trip-wide daily, use expense_analysis with the privacy filter and GROUP BY expense_date.
   - trip_summary, balance_ledger: no privacy filter needed — the views handle it.
4. "I/me/my" → share_owner_id = '<<CALLER_ID>>' (or user_id = '<<CALLER_ID>>' for trip_summary). Named members from TRIP CONTEXT → match share_owner_name (or user_name) verbatim.
5. Trip-wide totals (no specific owner): aggregate across all rows; do NOT filter by share owner.
6. Currency: use the _home columns when summing across multiple rows. Use original-currency columns only when displaying a single expense or when the user explicitly says "in trip currency".
7. Settlement / balance / "who owes whom" / "are we even" → SELECT * FROM balance_ledger WHERE trip_id = '<<TRIP_ID>>'. NEVER recompute. Empty result = settled up.
8. Budget / "on track" / daily average / days remaining → SELECT * FROM trip_summary WHERE trip_id = '<<TRIP_ID>>' AND user_id = '<<CALLER_ID>>'. Numbers are already there.
9. Daily charts / "most expensive day" / spending on date X → use daily_spending.
10. Percentages: compute in SQL with window functions (e.g. SUM(user_share_home) * 100.0 / SUM(SUM(user_share_home)) OVER ()). Don't ask the LLM to divide.
11. Always include LIMIT 100 except for pure aggregates (one row, no GROUP BY) and single-row trip_summary lookups.
12. SELECT and WITH only. No mutations.

═══════════════════════════════════════
QUESTION → QUERY PATTERNS
═══════════════════════════════════════

"How much did I spend on Food?"
  SELECT category_emoji, category_name,
         ROUND(SUM(user_share_home)::numeric, 2) AS spent_home
  FROM expense_analysis
  WHERE trip_id = '<<TRIP_ID>>' AND share_owner_id = '<<CALLER_ID>>'
    AND category_name = 'Food' AND is_refund = false
    AND (is_private = false OR share_owner_id = '<<CALLER_ID>>')
  GROUP BY category_emoji, category_name LIMIT 100

"What's the trip total?"
  SELECT ROUND(SUM(user_share_home)::numeric, 2) AS total_home
  FROM expense_analysis
  WHERE trip_id = '<<TRIP_ID>>' AND is_refund = false
    AND (is_private = false OR share_owner_id = '<<CALLER_ID>>')

"Who owes whom?" / "Are we even?" / "How much do I owe?"
  SELECT from_user_name, to_user_name, net_amount, currency
  FROM balance_ledger WHERE trip_id = '<<TRIP_ID>>'

"Am I on budget?"
  SELECT * FROM trip_summary
  WHERE trip_id = '<<TRIP_ID>>' AND user_id = '<<CALLER_ID>>'

"What's my daily average?"
  SELECT daily_average_share_home, total_spent_share_home, days_elapsed
  FROM trip_summary WHERE trip_id = '<<TRIP_ID>>' AND user_id = '<<CALLER_ID>>'

"My most expensive day?"
  SELECT expense_date, ROUND(daily_amount_home::numeric, 2) AS amount_home, expense_count
  FROM daily_spending
  WHERE trip_id = '<<TRIP_ID>>' AND share_owner_id = '<<CALLER_ID>>'
  ORDER BY daily_amount_home DESC LIMIT 1

"Cash vs card?"
  SELECT payment_method,
         ROUND(SUM(user_share_home)::numeric, 2) AS total_home,
         COUNT(*) AS n
  FROM expense_analysis
  WHERE trip_id = '<<TRIP_ID>>' AND share_owner_id = '<<CALLER_ID>>'
    AND is_refund = false
    AND (is_private = false OR share_owner_id = '<<CALLER_ID>>')
  GROUP BY payment_method LIMIT 100

"What did Maya spend on?" (Maya appears in TRIP CONTEXT.members)
  SELECT category_emoji, category_name,
         ROUND(SUM(user_share_home)::numeric, 2) AS spent_home
  FROM expense_analysis
  WHERE trip_id = '<<TRIP_ID>>' AND share_owner_name = 'Maya'
    AND is_refund = false
    AND (is_private = false OR share_owner_id = '<<CALLER_ID>>')
  GROUP BY category_emoji, category_name
  ORDER BY spent_home DESC LIMIT 100

"How long is the trip?"
  SELECT trip_name, start_date, end_date, days_elapsed, days_remaining
  FROM trip_summary WHERE trip_id = '<<TRIP_ID>>' AND user_id = '<<CALLER_ID>>'

═══════════════════════════════════════
INTENT
═══════════════════════════════════════

Default to DATA_QUERY. Pick a non-DATA_QUERY intent only when clearly warranted.

DATA_QUERY: any expense-related word (food, transport, hotel, spend, cost, budget, paid, owe, balance, settle, even, category, cash, card, day, location, place, member name, currency, refund, average, total, days). Member comparisons. Trip metadata. Yes/no questions about state.
  - Empty result is fine: a non-existent category, settlement on a no-split trip, etc. — emit the query, the summarizer explains.
  - Some questions are answerable from TRIP CONTEXT alone (e.g. "what currency does this trip use?", "who's on this trip?", "what categories do we have?"). For those, set queries: [] — the summarizer will read TRIP CONTEXT and answer directly. Use sparingly; default to a query.

CHITCHAT: pure greetings, thanks, casual chatter. directResponse, queries: [].
CLARIFY: about expenses but truly ambiguous (rare). Ask ONE specific clarifying question. queries: [].
OUT_OF_SCOPE: completely unrelated to spending (weather, code, philosophy). queries: [].

OUTPUT (JSON only):
{
  "intent": "DATA_QUERY" | "CHITCHAT" | "CLARIFY" | "OUT_OF_SCOPE",
  "reasoning": "one sentence",
  "directResponse": "non-empty only for CHITCHAT/CLARIFY/OUT_OF_SCOPE",
  "queries": [{ "sql": "SELECT ...", "purpose": "what this answers" }],
  "explanation": "one sentence on what the combined results show (DATA_QUERY only)"
}`;

function buildPlannerSystem(tripId: string, callerId: string): string {
  return PLANNER_SYSTEM_TEMPLATE
    .replaceAll('<<TRIP_ID>>', tripId)
    .replaceAll('<<CALLER_ID>>', callerId);
}

function buildSummarizerSystem(language: Language): string {
  return SUMMARIZER_SYSTEM + languageInstruction(language);
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

const SUMMARIZER_SYSTEM = `You are a friendly travel expense assistant. You receive query results from pre-computed analytics views and report them to the user. The numbers you receive are already correct — DO NOT recompute them.

ANSWER:
- 2-4 sentences, casual and friendly.
- Use the correct currency symbol from trip context (€, ₪, $, £, ¥). Format with commas: €1,247, not €1247.
- 2 decimals for amounts, 0 decimals for percentages.
- Quote pre-computed values verbatim from the result rows:
  · Settlement: "Maya owes you €54.75" — straight from balance_ledger.net_amount.
  · Budget: "You're at 65% of your €5,000 budget — €1,750 left, 8 days remaining" — straight from trip_summary.
  · Daily average: "Your daily average is €87.50" — from trip_summary.daily_average_share_home.
  · Comparisons: state both numbers and the difference.
  · Category breakdowns: list top 3-4 categories with amount and percentage from the result rows.

NEVER COMPUTE:
- No mental math: don't sum across rows, don't divide for percentages, don't average. The SQL did all of that.
- If a number isn't in the result rows, don't make one up.

EMPTY RESULTS:
- Empty balance_ledger: "Everyone's settled up on this trip — nothing to settle." If the trip has no splits per TRIP CONTEXT, say "No split expenses yet, so there's nothing to settle."
- Empty category/payment/place result: "I don't see any [X] expenses logged yet on this trip."
- Other empty: "I don't see any expenses matching that yet."
- If results are empty AND the question is answerable from TRIP CONTEXT (e.g. "what currency?", "who's on the trip?", "what categories do we use?"), answer directly from context.

ERRORS:
- Query error: "I had trouble looking that up. Try rephrasing or ask something different."
- Partial failure: answer from what worked, briefly note what didn't.

TONE: casual, friendly, slightly playful — travel app, not bank statement. Emoji max 1 per answer, only if it fits naturally.

FOLLOW-UPS (2-3): phrased like a friend would ask ("What about transport?", not "Query transport category"). Filter by trip shape from TRIP CONTEXT.flags:
  · skip budget questions when has_any_budget = false;
  · skip "who spent more" / member comparisons when members.length < 2;
  · skip balance / settlement / "who owes whom" when has_splits = false.

Respond as JSON only:
{ "answer": "...", "followUps": ["...", "..."] }`;

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
const AGGREGATE_FN_RE = /\b(sum|count|avg|min|max)\s*\(/i;
const GROUP_BY_RE = /\bgroup\s+by\b/i;
const DEFAULT_LIMIT = 100;

// Raw tables the planner must NOT query — the analytics views handle privacy,
// soft-delete, splits, and currency conversion already. Reject any reference
// so we get a fast, intelligible error instead of e.g. a privacy leak through
// the raw expenses table or a bug from missing the deleted_at filter.
// Word boundaries (\b) deliberately do NOT match `expense_analysis` because
// the trailing `_` is a word character (good — views still pass through).
const RAW_TABLE_RES: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'expenses',       re: /\bexpenses\b/i },
  { name: 'expense_splits', re: /\bexpense_splits\b/i },
  { name: 'trip_members',   re: /\btrip_members\b/i },
  { name: 'profiles',       re: /\bprofiles\b/i },
];

function ensureLimit(sql: string): string {
  if (/\blimit\b/i.test(sql)) return sql;
  const isPureAggregate = AGGREGATE_FN_RE.test(sql) && !GROUP_BY_RE.test(sql);
  if (isPureAggregate) return sql;
  return sql.replace(/;?\s*$/, '') + ` LIMIT ${DEFAULT_LIMIT}`;
}

function validateSql(sql: string, tripId: string): string | null {
  const trimmed = sql.trim();
  if (trimmed.length === 0) return 'empty SQL';
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith('select') && !lower.startsWith('with')) {
    return 'must start with SELECT or WITH';
  }
  if (FORBIDDEN_TOKEN_RE.test(lower)) {
    return 'contains forbidden mutating keyword';
  }
  // Trip id must appear as a literal so the planner cannot accidentally query
  // across trips. We don't try to repair it — a missing/typo'd UUID is more
  // likely a planner bug than a transcription slip.
  if (!sql.includes(tripId)) {
    return 'must include the trip id literal';
  }
  for (const { name, re } of RAW_TABLE_RES) {
    if (re.test(sql)) {
      return `query references raw table "${name}" — use the analytics views (expense_analysis, daily_spending, trip_summary, balance_ledger) instead`;
    }
  }
  // LIMIT is auto-appended by ensureLimit() before this runs, so the only way
  // to be missing it here is a pure aggregate (intentional).
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
    .select('role, joined_at, budget, profiles!inner(name)')
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

  // Budget shape — true if the trip has an overall budget OR any active member
  // has set a personal budget. Used to gate budget-related follow-ups.
  const hasAnyBudget =
    (trip.budget !== null && trip.budget !== undefined) ||
    (memberRows ?? []).some((m: { budget: number | string | null }) => m.budget !== null && m.budget !== undefined);

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
      has_any_budget: hasAnyBudget,
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

// Trip-shape-aware fallback follow-ups. Used when the LLM doesn't supply
// follow-ups (validator failure, planner empty queries, summarizer error).
// Each candidate carries the trip-shape predicate that must hold for it to
// appear; we pick the first three that match. This mirrors the guidance the
// summarizer follows when it generates its own follow-ups, so behavior stays
// consistent whether the user gets LLM follow-ups or fallback ones.
interface FollowUpCandidate {
  question: string;
  requiresBudget?: boolean;
  requiresMultipleMembers?: boolean;
  requiresSplits?: boolean;
}

const FOLLOWUP_POOL: Record<Language, FollowUpCandidate[]> = {
  en: [
    { question: 'How much have I spent so far?' },
    { question: 'What category am I spending the most on?' },
    { question: 'How am I doing against my budget?', requiresBudget: true },
    { question: 'Who owes whom?', requiresSplits: true },
    { question: 'Who spent more on this trip?', requiresMultipleMembers: true },
    { question: 'What is my daily average?' },
    { question: 'What was my most expensive day?' },
  ],
  he: [
    { question: 'כמה הוצאתי עד עכשיו?' },
    { question: 'באיזו קטגוריה אני מוציא הכי הרבה?' },
    { question: 'איך אני עומד מול התקציב?', requiresBudget: true },
    { question: 'מי חייב למי?', requiresSplits: true },
    { question: 'מי הוציא יותר בטיול הזה?', requiresMultipleMembers: true },
    { question: 'מה הממוצע היומי שלי?' },
    { question: 'מה היה היום הכי יקר?' },
  ],
};

function contextualFollowUps(language: Language, context: TripContext | null): string[] {
  const pool = FOLLOWUP_POOL[language];
  // Without context (rare error path), fall back to the unfiltered first three.
  if (!context) return pool.slice(0, 3).map((c) => c.question);
  const hasBudget = context.flags.has_any_budget;
  const multipleMembers = context.members.length > 1;
  const hasSplits = context.flags.has_splits;
  const filtered = pool.filter((c) => {
    if (c.requiresBudget && !hasBudget) return false;
    if (c.requiresMultipleMembers && !multipleMembers) return false;
    if (c.requiresSplits && !hasSplits) return false;
    return true;
  });
  return filtered.slice(0, 3).map((c) => c.question);
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
  const language = parseLanguage(body.language);
  const fallbacks = STATIC_FALLBACKS[language];

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
      language,
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
      return chatResponse(fallbacks.thinkingError, [], 'error');
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
      // Always use the localized static reply rather than planner.directResponse,
      // since the planner has no language instruction and tends to mirror the
      // question's language (e.g. Hebrew greeting in an English app).
      const answer =
        planner.intent === 'CHITCHAT'
          ? fallbacks.chitchat
          : planner.intent === 'OUT_OF_SCOPE'
            ? fallbacks.outOfScope
            : fallbacks.clarify;
      return chatResponse(answer, contextualFollowUps(language, context), planner.intent);
    }

    // No-SQL path: when the planner picks DATA_QUERY but emits queries: [],
    // it judged the question answerable from TRIP CONTEXT alone (e.g. "what
    // currency?", "who's on this trip?"). The validation loop is a no-op,
    // runQueries returns [], and the summarizer is told to read context.
    for (const q of planner.queries) {
      q.sql = ensureLimit(q.sql);
      const failure = validateSql(q.sql, tripId);
      if (failure) {
        console.error('ai-query: validator rejected SQL', failure, q.sql);
        return chatResponse(
          fallbacks.rephrase,
          contextualFollowUps(language, context),
          'error',
          `SQL validation failed: ${failure}`,
        );
      }
    }

    const results = await runQueries(sql, planner.queries);

    let summary: SummarizerResponse;
    try {
      const raw = await callOpenAIJson(
        openaiKey,
        buildSummarizerSystem(language),
        buildSummarizerUser(question, context, history, results),
        0.3,
      );
      summary = parseSummarizerResponse(raw);
    } catch (err) {
      console.error('ai-query: summarizer call failed', err instanceof Error ? err.message : err);
      return chatResponse(fallbacks.thinkingError, [], 'error');
    }

    const followUps = summary.followUps.length > 0
      ? summary.followUps
      : contextualFollowUps(language, context);
    // Empty summarizer answer = a failure mode (the LLM either had nothing to
    // say or returned malformed JSON). Surface as 'error' so the app shows the
    // Try-Again button rather than a dead-end "couldn't put together an answer".
    const summarizerOk = summary.answer.trim().length > 0;
    const answer = summarizerOk ? summary.answer : fallbacks.noAnswer;
    const intent = summarizerOk ? 'DATA_QUERY' : 'error';

    // Diagnostic log: the user-visible answer plus the row counts that
    // produced it. This pairs with the planner log to make it easy to see
    // whether a wrong answer came from bad SQL, empty rows, or summarizer drift.
    console.log('ai-query: answer', JSON.stringify({
      answer,
      intent,
      rowCounts: results.map((r) => ({
        purpose: r.purpose,
        rowCount: r.rows?.length ?? 0,
        error: r.error ?? null,
      })),
    }));

    return chatResponse(answer, followUps, intent);
  } catch (err) {
    console.error('ai-query: unhandled error', err instanceof Error ? err.stack ?? err.message : err);
    return chatResponse(fallbacks.thinkingError, [], 'error');
  } finally {
    try {
      await sql.end({ timeout: 1 });
    } catch {
      // ignore close errors
    }
  }
});
