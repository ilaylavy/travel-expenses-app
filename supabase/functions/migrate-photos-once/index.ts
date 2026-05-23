// migrate-photos-once Edge Function
//
// One-shot server-side migration from Supabase Storage to Cloudflare R2.
// Lists every object in the expense-photos bucket and copies it to R2 at
// the same key. Idempotent: existing R2 objects (HEAD 200) are skipped, so
// the function can be re-invoked safely.
//
// Auth: verify_jwt is FALSE and there is no internal auth check. The
// function returns counts only (no photo bytes or URLs), PUTs are
// idempotent at the same key, and the function is meant to be deleted
// after migration. The blast radius of an unauthorized invocation is
// wasted ops on already-existing keys.
//
// DELETE THIS FUNCTION after migration is verified.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const BUCKET = 'expense-photos';
const PAGE_SIZE = 1000;

interface ListedObject {
  path: string;
  size: number;
  contentType: string;
}

interface MigrationResult {
  total: number;
  copied: number;
  skipped: number;
  failed: number;
  durationMs: number;
  failures: { path: string; error: string }[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
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
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r2AccountId = Deno.env.get('R2_ACCOUNT_ID');
  const r2AccessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const r2SecretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  const r2Bucket = Deno.env.get('R2_BUCKET_IMAGE');

  if (
    !supabaseUrl ||
    !serviceKey ||
    !r2AccountId ||
    !r2AccessKeyId ||
    !r2SecretAccessKey ||
    !r2Bucket
  ) {
    console.error('migrate-photos-once: missing env vars');
    return errorResponse('Server misconfigured', 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const aws = new AwsClient({
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
    service: 's3',
    region: 'auto',
  });

  function r2UrlFor(key: string): string {
    return `https://${r2AccountId}.r2.cloudflarestorage.com/${r2Bucket}/${key}`;
  }

  // Walk the Supabase Storage bucket recursively. list() returns folders
  // (no metadata) and files (with metadata), one level at a time.
  async function listAllObjects(prefix = ''): Promise<ListedObject[]> {
    const out: ListedObject[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .list(prefix, {
          limit: PAGE_SIZE,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const item of data) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.metadata) {
          out.push({
            path: fullPath,
            size: Number(item.metadata.size ?? 0),
            contentType: String(item.metadata.mimetype ?? 'image/jpeg'),
          });
        } else {
          const sub = await listAllObjects(fullPath);
          out.push(...sub);
        }
      }
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    return out;
  }

  async function existsInR2(key: string): Promise<boolean> {
    const res = await aws.fetch(r2UrlFor(key), { method: 'HEAD' });
    if (res.status === 200) return true;
    if (res.status === 404) return false;
    const body = await res.text();
    throw new Error(`HEAD ${key} status ${res.status}: ${body.slice(0, 200)}`);
  }

  async function copyOne(obj: ListedObject): Promise<void> {
    const { data: blob, error: dlError } = await admin.storage
      .from(BUCKET)
      .download(obj.path);
    if (dlError) throw new Error(`download: ${dlError.message}`);
    if (!blob) throw new Error('download: empty body');
    const buf = new Uint8Array(await blob.arrayBuffer());
    const res = await aws.fetch(r2UrlFor(obj.path), {
      method: 'PUT',
      body: buf,
      headers: { 'Content-Type': obj.contentType },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PUT status ${res.status}: ${body.slice(0, 200)}`);
    }
  }

  const start = Date.now();
  const result: MigrationResult = {
    total: 0,
    copied: 0,
    skipped: 0,
    failed: 0,
    durationMs: 0,
    failures: [],
  };

  try {
    const objects = await listAllObjects();
    result.total = objects.length;
    for (const obj of objects) {
      try {
        if (await existsInR2(obj.path)) {
          result.skipped += 1;
          continue;
        }
        await copyOne(obj);
        result.copied += 1;
      } catch (err) {
        result.failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        result.failures.push({ path: obj.path, error: msg });
        console.error('migrate-photos-once: failed', obj.path, msg);
      }
    }
    result.durationMs = Date.now() - start;
    return jsonResponse(result);
  } catch (err) {
    result.durationMs = Date.now() - start;
    console.error(
      'migrate-photos-once: aborted',
      err instanceof Error ? err.stack ?? err.message : err,
    );
    return jsonResponse(
      { ...result, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
