// r2-media-url Edge Function (served at the legacy r2-photo-url route until
// Phase 5 retires the alias).
//
// Gatekeeper for Cloudflare R2 media storage. Mobile and web call this with a
// JWT, an object key, an operation, and a media kind. We:
//   1. Authenticate the caller.
//   2. Validate the path shape for the given kind.
//   3. Verify trip membership (the trip_id is always the first path segment).
//   4. For PUT/GET, return a short-lived presigned R2 URL; for DELETE, do the
//      delete server-side.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

import {
  bucketEnvForKind,
  contentTypeForKind,
  parseKind,
  parseOp,
  parsePath,
} from './validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const PUT_TTL_SECONDS = 300;
const GET_TTL_SECONDS = 3600;

interface RequestBody {
  kind?: unknown;
  path?: unknown;
  op?: unknown;
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r2AccountId = Deno.env.get('R2_ACCOUNT_ID');
  const r2AccessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const r2SecretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  if (
    !supabaseUrl || !anonKey || !serviceKey ||
    !r2AccountId || !r2AccessKeyId || !r2SecretAccessKey
  ) {
    console.error('r2-media-url: missing env vars');
    return errorResponse('Server misconfigured', 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Missing Authorization header', 401);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  // Back-compat: clients deployed before this change send no `kind`. Treat
  // them as the original expense-photo path shape.
  const kindInput = body.kind ?? 'expense-photo';
  const kind = parseKind(kindInput);
  if (!kind) return errorResponse('Invalid kind', 400);

  const op = parseOp(body.op);
  if (!op) return errorResponse('Invalid op', 400);
  if (typeof body.path !== 'string') return errorResponse('path must be a string', 400);

  const parsed = parsePath(body.path, kind);
  if (!parsed) return errorResponse('Invalid path for kind', 400);

  const bucketEnvName = bucketEnvForKind(kind);
  const bucket = Deno.env.get(bucketEnvName);
  if (!bucket) {
    console.error(`r2-media-url: missing env var ${bucketEnvName}`);
    return errorResponse('Server misconfigured', 500);
  }

  // Authenticate the JWT and check trip membership.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return errorResponse('Invalid JWT', 401);

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: memberRow, error: memberErr } = await adminClient
    .from('trip_members')
    .select('id')
    .eq('trip_id', parsed.tripId)
    .eq('user_id', userData.user.id)
    .not('joined_at', 'is', null)
    .maybeSingle();
  if (memberErr) return errorResponse('Membership check failed', 500);
  // The owner might not have a trip_members row in early projects; check trips too.
  if (!memberRow) {
    const { data: ownerRow } = await adminClient
      .from('trips')
      .select('id')
      .eq('id', parsed.tripId)
      .eq('owner_id', userData.user.id)
      .maybeSingle();
    if (!ownerRow) return errorResponse('Not a trip member', 403);
  }

  const r2 = new AwsClient({
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const url = `https://${r2AccountId}.r2.cloudflarestorage.com/${bucket}/${body.path}`;

  if (op === 'DELETE') {
    const signed = await r2.sign(new Request(url, { method: 'DELETE' }));
    const res = await fetch(signed);
    if (res.status >= 200 && res.status < 300) return jsonResponse({ ok: true });
    if (res.status === 404) return jsonResponse({ ok: true });
    return errorResponse(`R2 delete failed: ${res.status}`, 502);
  }

  const ttl = op === 'PUT' ? PUT_TTL_SECONDS : GET_TTL_SECONDS;
  const signRequest = new Request(`${url}?X-Amz-Expires=${ttl}`, {
    method: op,
    headers: op === 'PUT' ? { 'Content-Type': contentTypeForKind(kind) } : undefined,
  });
  const signed = await r2.sign(signRequest, { aws: { signQuery: true } });
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  return jsonResponse({ url: signed.url, expiresAt });
});
