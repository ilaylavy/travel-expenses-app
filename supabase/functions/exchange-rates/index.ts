// exchange-rates Edge Function
// GET /functions/v1/exchange-rates?base=EUR&targets=USD,ILS,GBP
//
// Fetches latest rates from exchangerate.host and returns a JSON map.
// Also upserts rates into public.exchange_rates for offline availability.

import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ExchangeRateHostResponse {
  success?: boolean;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
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

async function persistRates(
  base: string,
  date: string,
  rates: Record<string, number>,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return;

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const rows = Object.entries(rates).map(([target, rate]) => ({
    base_currency: base,
    target_currency: target,
    rate,
    fetched_date: date,
  }));

  if (rows.length === 0) return;

  const { error } = await client
    .from('exchange_rates')
    .upsert(rows, { onConflict: 'base_currency,target_currency,fetched_date' });
  if (error) {
    console.error('exchange-rates upsert error:', error.message);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  const url = new URL(req.url);
  const base = (url.searchParams.get('base') ?? 'USD').toUpperCase();
  const targetsParam = url.searchParams.get('targets');
  const targets = targetsParam
    ? targetsParam
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
    : [];

  const apiUrl = new URL('https://api.exchangerate.host/latest');
  apiUrl.searchParams.set('base', base);
  if (targets.length > 0) apiUrl.searchParams.set('symbols', targets.join(','));
  const accessKey = Deno.env.get('EXCHANGE_RATE_API_KEY');
  if (accessKey) apiUrl.searchParams.set('access_key', accessKey);

  try {
    const upstream = await fetch(apiUrl.toString());
    if (!upstream.ok) {
      return errorResponse(`Upstream error: ${upstream.status}`, 502);
    }
    const data = (await upstream.json()) as ExchangeRateHostResponse;
    if (!data?.rates) {
      return errorResponse('No rates returned from upstream', 502);
    }
    const date = data.date ?? new Date().toISOString().slice(0, 10);

    // Fire-and-forget cache upsert — don't fail the response if this errors.
    persistRates(base, date, data.rates).catch((e) =>
      console.error('persistRates failed:', e),
    );

    return jsonResponse({
      base,
      date,
      rates: data.rates,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('exchange-rates error:', message);
    return errorResponse('Failed to fetch rates', 502);
  }
});
