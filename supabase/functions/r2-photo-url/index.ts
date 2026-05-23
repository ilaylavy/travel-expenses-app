// r2-photo-url Edge Function
//
// Gatekeeper for Cloudflare R2 photo storage. The mobile and web apps call
// this function with a JWT, an object path, and an operation. We:
//   1. Authenticate the caller.
//   2. Verify trip membership (the trip_id is the first path segment).
//   3. For PUT/GET, return a short-lived presigned R2 URL the client can use
//      directly. For DELETE, perform the deletion server-side.
//
// The app never sees R2 credentials. Presigned URLs are scoped to a single
// object and expire in minutes (PUT) or an hour (GET).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Object key convention: <tripId>/<expenseId>/<photoId>.jpg — three UUIDs.
const PATH_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jpg$/i;

const PUT_TTL_SECONDS = 300; // 5 min — long enough for any single upload attempt
const GET_TTL_SECONDS = 3600; // 1 hr — matches the existing signed-URL cache

type Op = 'PUT' | 'GET' | 'DELETE';

interface RequestBody {
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r2AccountId = Deno.env.get('R2_ACCOUNT_ID');
  const r2AccessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const r2SecretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  const r2Bucket = Deno.env.get('R2_BUCKET_IMAGE');

  if (
    !supabaseUrl ||
    !anonKey ||
    !serviceKey ||
    !r2AccountId ||
    !r2AccessKeyId ||
    !r2SecretAccessKey ||
    !r2Bucket
  ) {
    console.error('r2-photo-url: missing env vars', {
      hasUrl: !!supabaseUrl,
      hasAnon: !!anonKey,
      hasService: !!serviceKey,
      hasAccount: !!r2AccountId,
      hasAccessKey: !!r2AccessKeyId,
      hasSecret: !!r2SecretAccessKey,
      hasBucket: !!r2Bucket,
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

  const path = typeof body.path === 'string' ? body.path.trim() : '';
  const opRaw = typeof body.op === 'string' ? body.op.toUpperCase() : '';
  if (opRaw !== 'PUT' && opRaw !== 'GET' && opRaw !== 'DELETE') {
    return errorResponse('Invalid op (must be PUT, GET, or DELETE)');
  }
  const op = opRaw as Op;

  const match = path.match(PATH_RE);
  if (!match) {
    return errorResponse('Invalid path shape');
  }
  const tripId = match[1];
  if (!UUID_RE.test(tripId)) {
    return errorResponse('Invalid tripId in path');
  }

  // Membership gate — pending invites (joined_at IS NULL) are not members.
  // Matches the pattern used by ai-query: admin client + explicit user_id
  // filter rather than relying on RLS, since SECURITY DEFINER helpers like
  // app_private.is_trip_member aren't exposed through PostgREST.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const { data: membership, error: memberError } = await admin
    .from('trip_members')
    .select('user_id, joined_at')
    .eq('trip_id', tripId)
    .eq('user_id', callerId)
    .not('joined_at', 'is', null)
    .maybeSingle();

  if (memberError) {
    console.error('r2-photo-url: membership check error', memberError.message);
    return errorResponse('Lookup failed', 500);
  }
  if (!membership) {
    return errorResponse('Forbidden', 403);
  }

  const r2Url = `https://${r2AccountId}.r2.cloudflarestorage.com/${r2Bucket}/${path}`;
  const aws = new AwsClient({
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
    service: 's3',
    region: 'auto',
  });

  try {
    if (op === 'DELETE') {
      const res = await aws.fetch(r2Url, { method: 'DELETE' });
      // S3 DELETE returns 204 on success. R2 returns 204 even when the object
      // is missing, but we tolerate 404 too just in case so cleanup is
      // idempotent from the caller's perspective.
      if (!res.ok && res.status !== 404) {
        const errText = await res.text();
        console.error('r2-photo-url: DELETE failed', res.status, errText);
        return errorResponse('Delete failed', 502);
      }
      return jsonResponse({ ok: true });
    }

    // PUT/GET: presign with query-string signing. Setting X-Amz-Expires before
    // signing tells SigV4 how long the URL is valid for.
    const ttl = op === 'PUT' ? PUT_TTL_SECONDS : GET_TTL_SECONDS;
    const target = new URL(r2Url);
    target.searchParams.set('X-Amz-Expires', String(ttl));
    const signed = await aws.sign(target.toString(), {
      method: op,
      aws: { signQuery: true },
    });
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    return jsonResponse({ url: signed.url, expiresAt });
  } catch (err) {
    console.error(
      'r2-photo-url: signing/delete error',
      err instanceof Error ? err.message : err,
    );
    return errorResponse('Server error', 500);
  }
});
