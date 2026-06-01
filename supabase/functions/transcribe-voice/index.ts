// transcribe-voice Edge Function.
//
// Server-side Whisper transcription for journal voice clips. The mobile
// client fire-and-forgets this after pushChanges uploads the audio and the
// voice_clips row reaches Postgres. We:
//   1. Authenticate the caller's JWT.
//   2. Verify the caller is a member of the clip's trip.
//   3. Mark transcript_status = 'processing'.
//   4. Fetch the audio from R2 with service-role SigV4 (no client URL hop).
//   5. POST to OpenAI Whisper (whisper-1, json response_format).
//   6. Write the resulting transcript + status = 'done' back to the row.
//   7. On any failure, write status = 'failed' with the truncated error so
//      the UI's "Re-transcribe" affordance has something to surface.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

import { parseRequestBody } from './validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_SECONDS = 300;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

async function checkTripMembership(
  adminClient: ReturnType<typeof createClient>,
  tripId: string,
  userId: string,
): Promise<boolean> {
  const { data: memberRow } = await adminClient
    .from('trip_members')
    .select('id')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .not('joined_at', 'is', null)
    .maybeSingle();
  if (memberRow) return true;
  // Owners might not yet have a trip_members row in older projects; check trips.
  const { data: ownerRow } = await adminClient
    .from('trips')
    .select('id')
    .eq('id', tripId)
    .eq('owner_id', userId)
    .maybeSingle();
  return !!ownerRow;
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
  const r2Bucket = Deno.env.get('R2_BUCKET_AUDIO');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (
    !supabaseUrl || !anonKey || !serviceKey ||
    !r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket ||
    !openaiKey
  ) {
    console.error('transcribe-voice: missing env vars', {
      hasUrl: !!supabaseUrl,
      hasAnon: !!anonKey,
      hasService: !!serviceKey,
      hasAccount: !!r2AccountId,
      hasAccessKey: !!r2AccessKeyId,
      hasSecret: !!r2SecretAccessKey,
      hasBucket: !!r2Bucket,
      hasOpenai: !!openaiKey,
    });
    return errorResponse('Server misconfigured', 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Missing Authorization header', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse('Invalid JSON', 400);
  }
  const body = parseRequestBody(raw);
  if (!body) return errorResponse('Invalid request', 400);

  // Authenticate the JWT.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return errorResponse('Invalid JWT', 401);

  // Look up the clip and verify trip membership.
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: clipRow, error: clipErr } = await adminClient
    .from('voice_clips')
    .select('id, trip_id, storage_path, duration_sec, transcript_status')
    .eq('id', body.voice_clip_id)
    .maybeSingle();
  if (clipErr) return errorResponse('Lookup failed', 500);
  if (!clipRow) return errorResponse('Clip not found', 404);
  if (!clipRow.storage_path) return errorResponse('Clip not yet uploaded', 409);
  if (clipRow.duration_sec > MAX_SECONDS) return errorResponse('Clip too long', 400);

  const isMember = await checkTripMembership(adminClient, clipRow.trip_id, userData.user.id);
  if (!isMember) return errorResponse('Not a trip member', 403);

  // Mark processing — idempotent. The UI shows a spinner while this is true.
  await adminClient
    .from('voice_clips')
    .update({ transcript_status: 'processing', transcript_error: null })
    .eq('id', body.voice_clip_id);

  try {
    // Fetch audio from R2 server-side. The presigned-URL hop the client uses
    // is avoided — we already have service-role keys.
    const r2 = new AwsClient({
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
      service: 's3',
      region: 'auto',
    });
    const url = `https://${r2AccountId}.r2.cloudflarestorage.com/${r2Bucket}/${clipRow.storage_path}`;
    const signed = await r2.sign(new Request(url, { method: 'GET' }));
    const audioRes = await fetch(signed);
    if (!audioRes.ok) throw new Error(`R2 fetch failed: ${audioRes.status}`);
    const audioBytes = new Uint8Array(await audioRes.arrayBuffer());

    // Post to Whisper. multipart/form-data with the audio file + model.
    const form = new FormData();
    form.append(
      'file',
      new Blob([audioBytes], { type: 'audio/mp4' }),
      `${clipRow.id}.m4a`,
    );
    form.append('model', 'whisper-1');
    form.append('response_format', 'json');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });
    if (!whisperRes.ok) {
      const text = await whisperRes.text();
      throw new Error(`Whisper failed: ${whisperRes.status} ${text.slice(0, 200)}`);
    }
    const whisperJson = (await whisperRes.json()) as { text?: string };
    const transcript = whisperJson.text ?? '';

    await adminClient
      .from('voice_clips')
      .update({ transcript, transcript_status: 'done', transcript_error: null })
      .eq('id', body.voice_clip_id);

    return jsonResponse({ status: 'done', transcript });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('transcribe-voice failed:', errMsg);
    await adminClient
      .from('voice_clips')
      .update({
        transcript_status: 'failed',
        transcript_error: errMsg.slice(0, 500),
      })
      .eq('id', body.voice_clip_id);
    // Surface 200 with status:'failed' so the client doesn't retry on its own.
    return jsonResponse({ status: 'failed', error: errMsg }, 200);
  }
});
