// lookup-profile-by-email Edge Function
// POST { email: string } -> { user_id, name, avatar_url } | { error: 'not_found' }
//
// Used by the shared-trip invite flow: the owner types a partner's email; this
// function resolves it to a profile via the service-role key. The caller must
// be authenticated. We never return the email back and never expose other
// fields from auth.users.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';

interface LookupBody {
  email?: unknown;
}

interface ProfileRow {
  user_id: string;
  name: string;
  avatar_url: string | null;
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

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 320) return null;
  // Minimal shape check — a real address has a local part, @, and a domain with a dot.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
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
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('lookup-profile-by-email: missing env vars');
    return errorResponse('Server misconfigured', 500);
  }

  // Authenticate the caller via their JWT. Any logged-in user may look up an
  // email; we do not reveal the email back, so this is acceptable.
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

  let body: LookupBody;
  try {
    body = (await req.json()) as LookupBody;
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return errorResponse('Invalid email');
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // profile_by_email() is a SECURITY DEFINER SQL function in the public schema
  // that joins auth.users and profiles. It's locked down so only the service
  // role can call it, so this edge function is the only way in.
  const { data, error } = await admin.rpc('profile_by_email', { p_email: email });

  if (error) {
    console.error('lookup-profile-by-email: rpc error', error.message);
    return errorResponse('Lookup failed', 500);
  }

  const row = Array.isArray(data) ? (data[0] as ProfileRow | undefined) : undefined;
  if (!row) {
    return jsonResponse({ error: 'not_found' }, 404);
  }

  return jsonResponse({
    user_id: row.user_id,
    name: row.name,
    avatar_url: row.avatar_url,
  });
});
