// ai-query Edge Function
// Two-step proxy to OpenAI for natural-language expense queries.
//
// Step 1 (step: 'generate_sql'): client sends the user's question + the local
// SQLite schema + trip context. We ask the LLM to return a single SELECT query.
// Client then runs that query locally and calls back with results.
//
// Step 2 (step: 'summarize_results'): client sends results + original question.
// We ask the LLM to produce a natural-language answer.
//
// Financial data never leaves the device — only schema and aggregated results.

import { corsHeaders } from '../_shared/cors.ts';

interface TripContext {
  tripName: string;
  startDate: string;
  endDate: string | null;
  currency: string;
  members: string[];
}

interface AiQueryRequest {
  question: string;
  schema: string;
  tripContext: TripContext;
  step: 'generate_sql' | 'summarize_results';
  sqlResults?: unknown;
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

async function callOpenAI(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
): Promise<string> {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, messages, temperature }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenAI returned no content');
  }
  return content;
}

function stripSqlFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:sql)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()
    .replace(/;\s*$/, '');
}

function isSafeSelect(sql: string): boolean {
  const normalized = sql.trim().toLowerCase();
  if (!normalized.startsWith('select') && !normalized.startsWith('with')) return false;
  const forbidden = [
    /\binsert\b/,
    /\bupdate\b/,
    /\bdelete\b/,
    /\bdrop\b/,
    /\balter\b/,
    /\bcreate\b/,
    /\btruncate\b/,
    /\battach\b/,
    /\bdetach\b/,
    /\bpragma\b/,
    /\bvacuum\b/,
    /\breplace\b/,
  ];
  return !forbidden.some((re) => re.test(normalized));
}

function buildGenerateSqlMessages(req: AiQueryRequest) {
  const system =
    'You are a SQL query generator for a travel expense app. ' +
    'Given the following SQLite schema and trip context, generate a SQLite query ' +
    "that answers the user's question. Return ONLY the SQL query, no explanation, " +
    'no markdown fences. The query MUST be a single SELECT (or WITH ... SELECT) — ' +
    'no mutations, no PRAGMA, no ATTACH. Soft-deleted rows have deleted_at NOT NULL; ' +
    'filter them out unless the user explicitly asks for deleted items.';
  const user = [
    `Schema:\n${req.schema}`,
    `Trip context: ${JSON.stringify(req.tripContext)}`,
    `Question: ${req.question}`,
  ].join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function buildSummarizeMessages(req: AiQueryRequest) {
  const system =
    'You are a helpful travel expense assistant. Given the user question and the ' +
    'query results, provide a concise, friendly answer. Include specific numbers. ' +
    'Keep it to 2-3 sentences. If the results are empty, say so plainly.';
  const user = [
    `User question: ${req.question}`,
    `Trip context: ${JSON.stringify(req.tripContext)}`,
    `Query results (JSON): ${JSON.stringify(req.sqlResults ?? [])}`,
  ].join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return errorResponse('OPENAI_API_KEY not configured', 500);
  }

  let body: AiQueryRequest;
  try {
    body = (await req.json()) as AiQueryRequest;
  } catch {
    return errorResponse('Invalid JSON body');
  }

  if (!body?.question || !body?.tripContext || !body?.step) {
    return errorResponse('Missing required fields: question, tripContext, step');
  }

  try {
    if (body.step === 'generate_sql') {
      if (!body.schema) return errorResponse('Missing schema for generate_sql');
      const raw = await callOpenAI(apiKey, buildGenerateSqlMessages(body), 0);
      const sql = stripSqlFences(raw);
      if (!isSafeSelect(sql)) {
        return errorResponse('Generated SQL failed safety check', 400);
      }
      return jsonResponse({ sql });
    }
    if (body.step === 'summarize_results') {
      const summary = await callOpenAI(apiKey, buildSummarizeMessages(body), 0.3);
      return jsonResponse({ summary: summary.trim() });
    }
    return errorResponse(`Unknown step: ${body.step}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('ai-query error:', message);
    return errorResponse('AI request failed', 502);
  }
});
