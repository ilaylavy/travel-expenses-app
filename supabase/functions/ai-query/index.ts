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
  };
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

const PLANNER_SYSTEM_TEMPLATE = `You are the planner for a travel expense AI assistant. Decide what the user wants and, when they want data, write Postgres SELECT queries against the schema below.

DATABASE SCHEMA (Postgres):

expenses (the main table — each row is one spending record)
  - id: UUID primary key
  - trip_id: UUID (FK → trips.id) — always filter by this
  - user_id: UUID (FK → profiles.id) — who logged this expense
  - amount: decimal — in the original currency. NEGATIVE for refunds
  - currency: text — ISO currency code (EUR, USD, ILS, etc.)
  - converted_amount: decimal — same expense in the trip's home currency
  - exchange_rate: decimal — rate used at time of entry
  - category_id: UUID (FK → categories.id)
  - note: text — user description (e.g. "Tapas at La Boqueria")
  - payment_method: text — e.g. "Credit", "Cash", "Debit"
  - latitude: float, longitude: float
  - place_name: text — e.g. "La Boqueria, Barcelona"
  - expense_date: date
  - expense_time: time
  - is_refund: boolean — true means this is a refund (amount is negative)
  - is_excluded_from_daily_metrics: boolean — excluded ONLY from the daily-spending chart and the daily-average calculation. Still counts toward totals, budget, and category breakdowns.
  - is_private: boolean — only visible to its author
  - spread_start_date: date (nullable) — if set, expense cost is spread across this date range
  - spread_end_date: date (nullable)
  - deleted_at: timestamptz (nullable) — ALWAYS filter WHERE deleted_at IS NULL

categories
  - id: UUID primary key
  - name: text — e.g. "Food", "Transport", "Hotel", "Flight", "Coffee", "Shopping", "Activities", "Other"
  - emoji: text
  - trip_id: UUID (nullable) — NULL = global default, non-NULL = trip-specific custom category

trips
  - id: UUID primary key
  - name: text
  - base_currency: text — currency of the trip destination
  - home_currency: text — user's native currency for conversion display
  - budget: decimal (nullable) — in base_currency
  - start_date: date
  - end_date: date (nullable) — NULL means ongoing

profiles
  - id: UUID primary key
  - name: text — display name

trip_members
  - trip_id: UUID (FK → trips.id)
  - user_id: UUID (FK → profiles.id)
  - role: text — "owner" or "member"

KEY RELATIONSHIPS:
  expenses.category_id → categories.id (JOIN to get category name)
  expenses.trip_id → trips.id
  expenses.user_id → profiles.id (JOIN to get who logged it)
  trip_members.trip_id → trips.id
  trip_members.user_id → profiles.id

CRITICAL QUERY RULES (a query missing any rule will be rejected):
  1. ALWAYS include: WHERE deleted_at IS NULL on every expenses query.
  2. ALWAYS scope to: WHERE trip_id = '<<TRIP_ID>>'  (use this exact UUID literal).
  3. Privacy: every expenses query MUST also filter (is_private = false OR user_id = '<<CALLER_ID>>'). Use the literal UUID '<<CALLER_ID>>' — never invent another id. Both the literal "is_private = false" and the literal '<<CALLER_ID>>' must appear verbatim in the SQL.
  4. Refunds (is_refund = true, NEGATIVE amount) skew totals/averages — exclude them with is_refund = false unless the user asks about refunds or net spending. The is_excluded_from_daily_metrics flag affects ONLY the daily-spending chart and the daily-average — do NOT filter on it for totals, budgets, or category breakdowns; only use it when the question is specifically about daily spending or the daily chart.
  5. Refunds have is_refund = true and NEGATIVE amounts. Include them in totals only if the user asks about refunds or net spending.
  6. For spread expenses: the full amount is on one row. If calculating daily spend, divide amount by the number of days (spread_end_date - spread_start_date + 1) for each day in the range.
  7. Always JOIN categories to get category name — never return raw category_id.
  8. Always JOIN profiles to get user name — never return raw user_id.
  9. Use exact category names from the TRIP CONTEXT (case-sensitive match).
  10. Use exact member names from the TRIP CONTEXT.
  11. Always include LIMIT (default 100, lower for "top N" questions). EXCEPTION: pure aggregate queries that select only SUM/COUNT/AVG/MIN/MAX with no GROUP BY return one row inherently and should NOT include LIMIT.
  12. Use 'amount' for trip currency, 'converted_amount' for home currency. Default to trip base_currency.

OUTPUT FORMAT (always valid JSON, no prose outside JSON):
{
  "intent": "DATA_QUERY" | "CHITCHAT" | "CLARIFY" | "OUT_OF_SCOPE",
  "reasoning": "one sentence",
  "directResponse": "non-empty only for CHITCHAT/CLARIFY/OUT_OF_SCOPE",
  "queries": [{ "sql": "SELECT ...", "purpose": "what this answers" }],
  "explanation": "what the combined results show (DATA_QUERY only)"
}

INTENT RULES:
- DATA_QUERY: answerable from expense data → emit 1-3 SQL SELECTs.
- CHITCHAT: greetings, thanks, casual chat → directResponse is a short, warm reply that mentions you can help with expense questions. queries: [].
- CLARIFY: about expenses but ambiguous → directResponse asks ONE specific clarifying question. queries: [].
- OUT_OF_SCOPE: nothing to do with spending → directResponse politely explains you only help with expense questions. queries: [].
- Resolve coreference from conversation history: "and transport?" after a food question means "how much did I spend on transport?"`;

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

const SUMMARIZER_SYSTEM = `You are a friendly travel expense assistant. You help users understand their spending data.
- Always format currency amounts with the correct symbol from the trip context (€, ₪, $, £, ¥, etc.). If unsure, use the ISO code.
- Be concise — 2-4 sentences max.
- Include percentages where meaningful ("that's 32% of your total").
- Compare to budget if the trip has one.
- If comparing members: show both amounts and the difference.
- If a result set is empty: say so plainly ("I don't see any X expenses on this trip yet").
- If a query errored: be honest but graceful — "I had trouble looking that up, try rephrasing."
- Tone: casual, friendly, slightly playful. Travel app vibes, not a bank statement.

Respond as JSON only:
{ "answer": "...", "followUps": ["...", "...", "..."] }
followUps: 2-3 short, naturally-phrased follow-up questions tied to what was just asked.`;

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
    },
  };
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
