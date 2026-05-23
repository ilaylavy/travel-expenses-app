// Migrate expense receipt photos from Supabase Storage to Cloudflare R2.
//
// One-time operation. Object keys are preserved byte-for-byte
// (<tripId>/<expenseId>/<photoId>.jpg) so expense_photos.storage_path
// values in Postgres stay valid against R2.
//
// Idempotent: re-running skips objects already present in R2 (HEAD check),
// so a partial run can be resumed.
//
// Run (from project root):
//   npm install --save-dev aws4fetch
//
//   $env:SUPABASE_URL              = "https://kbsvankmyiuaejpvqrew.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<service role key from dashboard>"
//   $env:R2_ACCOUNT_ID             = "86be6bacbcc4f990235e012c20b484bc"
//   $env:R2_ACCESS_KEY_ID          = "<R2 access key>"
//   $env:R2_SECRET_ACCESS_KEY      = "<R2 secret>"
//   $env:R2_BUCKET                 = "images-travel-expense-app"
//
//   node scripts/migrate-photos-to-r2.mjs
//
// Writes scripts/migrate-photos-to-r2.manifest.json on success so a future
// teardown (drop Supabase Storage policies + bucket row) can verify which
// objects were copied.

import { writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { AwsClient } from 'aws4fetch';

const BUCKET = 'expense-photos';
const PAGE_SIZE = 1000;
const MANIFEST_PATH = new URL('./migrate-photos-to-r2.manifest.json', import.meta.url);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const R2_ACCOUNT_ID = requireEnv('R2_ACCOUNT_ID');
const R2_ACCESS_KEY_ID = requireEnv('R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = requireEnv('R2_SECRET_ACCESS_KEY');
const R2_BUCKET = requireEnv('R2_BUCKET');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const r2 = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  service: 's3',
  region: 'auto',
});

function r2UrlFor(key) {
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;
}

// Walk the Supabase Storage bucket recursively. The list() API returns
// folders (no `metadata`) and files (with `metadata`), one level at a time.
async function listAllObjects(prefix = '') {
  const out = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.metadata) {
        out.push({
          path: fullPath,
          size: item.metadata.size ?? 0,
          contentType: item.metadata.mimetype ?? 'image/jpeg',
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

async function existsInR2(key) {
  const res = await r2.fetch(r2UrlFor(key), { method: 'HEAD' });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  const body = await res.text();
  throw new Error(`R2 HEAD ${key} unexpected status ${res.status}: ${body}`);
}

async function copyOne(obj) {
  // Download from Supabase Storage — service-role bypasses RLS so we get
  // every object regardless of trip membership.
  const { data: blob, error: dlError } = await supabase.storage
    .from(BUCKET)
    .download(obj.path);
  if (dlError) throw new Error(`download ${obj.path}: ${dlError.message}`);
  if (!blob) throw new Error(`download ${obj.path}: empty body`);

  const buf = new Uint8Array(await blob.arrayBuffer());
  const res = await r2.fetch(r2UrlFor(obj.path), {
    method: 'PUT',
    body: buf,
    headers: { 'Content-Type': obj.contentType },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`R2 PUT ${obj.path} status ${res.status}: ${body}`);
  }
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  const start = Date.now();
  console.log(`Listing objects in Supabase Storage bucket "${BUCKET}"...`);
  const objects = await listAllObjects();
  console.log(`Found ${objects.length} object(s).`);
  if (objects.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  const manifest = [];
  let copied = 0;
  let skipped = 0;
  const failed = [];

  for (let i = 0; i < objects.length; i += 1) {
    const obj = objects[i];
    const label = `[${i + 1}/${objects.length}] ${obj.path} (${fmtBytes(obj.size)})`;
    try {
      if (await existsInR2(obj.path)) {
        console.log(`${label} — already in R2, skipping`);
        manifest.push({ ...obj, status: 'skipped' });
        skipped += 1;
        continue;
      }
      await copyOne(obj);
      console.log(`${label} — copied`);
      manifest.push({ ...obj, status: 'copied' });
      copied += 1;
    } catch (err) {
      console.error(`${label} — FAILED: ${err.message}`);
      manifest.push({ ...obj, status: 'failed', error: err.message });
      failed.push({ path: obj.path, error: err.message });
    }
  }

  await writeFile(
    MANIFEST_PATH,
    JSON.stringify(
      {
        bucket: BUCKET,
        r2Bucket: R2_BUCKET,
        startedAt: new Date(start).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        total: objects.length,
        copied,
        skipped,
        failed: failed.length,
        items: manifest,
      },
      null,
      2,
    ),
  );

  console.log();
  console.log(`Done in ${Math.round((Date.now() - start) / 1000)}s.`);
  console.log(`  Copied:  ${copied}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed:  ${failed.length}`);
  console.log(`Manifest: ${MANIFEST_PATH.pathname.replace(/^\//, '')}`);

  if (failed.length > 0) process.exit(2);
}

main().catch((err) => {
  console.error('Migration aborted:', err.stack ?? err.message);
  process.exit(1);
});
