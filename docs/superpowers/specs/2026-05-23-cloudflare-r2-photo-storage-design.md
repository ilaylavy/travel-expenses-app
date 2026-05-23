# Cloudflare R2 Photo Storage — Design

**Status:** Approved, ready for implementation plan
**Author:** ilaylavy (with Claude)
**Date:** 2026-05-23

## Goal

Replace Supabase Storage with Cloudflare R2 as the backend for expense receipt photos. Motivation: R2's zero egress fees and cheaper at-rest storage as the photo set grows.

## Scope

- All photo storage moves to R2. Existing photos in the Supabase `expense-photos` bucket are migrated, then the bucket is decommissioned.
- Object-key convention is unchanged: `<tripId>/<expenseId>/<photoId>.jpg`. `expense_photos.storage_path` values remain valid.
- Receipt photos stay **private**; access is gated by trip membership exactly as today.
- Works on both native (iOS/Android via Expo) and web.
- No changes to the sync engine's responsibilities — only the implementation behind `photoService` swaps.

Out of scope: inline image transforms (Cloudflare Images), custom domain for delivery, public sharing of photos.

## Architecture

```
┌────────────┐   1. POST /functions/v1/r2-photo-url   ┌─────────────────────┐
│            │ ─────────────────────────────────────▶ │ Supabase Edge Fn:   │
│   App      │   { path, op: PUT|GET|DELETE }         │  r2-photo-url       │
│ (native +  │ ◀───────────────────────────────────── │  • verify JWT        │
│   web)     │   2. { url, expiresAt } | { ok: true } │  • verify trip member │
│            │                                         │  • mint presigned URL │
│            │   3. PUT / GET directly to R2          │    (PUT/GET) via      │
│            │ ─────────────────────────────────────▶ │    aws4fetch          │
│            │                                         │  • DELETE server-side │
└────────────┘                                         └──────────┬──────────┘
                                                                  │
                                                                  ▼
                                                        ┌─────────────────────┐
                                                        │ Cloudflare R2       │
                                                        │ bucket:             │
                                                        │  expense-photos     │
                                                        │ key:                │
                                                        │  <tripId>/<expId>/  │
                                                        │   <photoId>.jpg     │
                                                        └─────────────────────┘
```

R2 has no equivalent of Supabase RLS, so a server-side gatekeeper is required. The Edge Function is that gatekeeper — it holds the only R2 credentials, and the app never sees them. The app receives short-lived presigned URLs (or a simple `ok` for DELETE) and talks to R2 directly from there.

## Components

### `supabase/functions/r2-photo-url/index.ts` (new)

POST endpoint, JWT-authenticated.

**Request:**
```ts
{ path: string; op: 'PUT' | 'GET' | 'DELETE' }
// path: "<tripId>/<expenseId>/<photoId>.jpg"
```

**Response (PUT, GET):** `{ url: string; expiresAt: string }`
**Response (DELETE):** `{ ok: true }`

**Flow:**
1. Read `Authorization: Bearer <jwt>` → `supabase.auth.getUser()`. 401 on miss.
2. Validate path with regex `^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$`. 400 on miss.
3. Extract `tripId` (first segment). `select app_private.is_trip_member($1)` with the user's JWT (so RLS does the check). 403 on miss.
4. **PUT / GET:** build presigned URL with `aws4fetch` against `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com/<R2_BUCKET>/<path>`. `X-Amz-Expires=300` for PUT, `3600` for GET. Return `{ url, expiresAt }`.
5. **DELETE:** execute a signed S3 `DELETE` server-side via `aws4fetch`. Return `{ ok: true }`. Don't fail the caller if the object is already missing.

Reuses the JWT + trip-membership pattern from `ai-query`.

### `src/services/photoService.native.ts`

Three exported functions keep their existing signatures:
- `uploadPhotoToStorage({ tripId, expenseId, photoId, localUri })` → POST for PUT URL → `FileSystem.uploadAsync(url, localUri, { httpMethod: 'PUT', uploadType: BINARY_CONTENT, headers: { 'Content-Type': 'image/jpeg' } })`. One-shot retry on PUT `403` (URL-expired race).
- `getSignedPhotoUrl(storage_path)` → POST for GET URL. Keep the existing 50-min in-memory cache as-is (cache key is `storage_path`).
- `deletePhotoFromStorage(storage_path)` → POST with `op: 'DELETE'`. Invalidate cache entry.

The `BUCKET = 'expense-photos'` constant and `supabase.storage.*` imports are removed.

### `src/services/photoService.web.ts`

Same three swaps. Upload uses `fetch(presignedUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } })`.

### Sync engine

Unchanged. Push/pull/delete still operate on `expense_photos` rows; the storage backend is invisible to them.

### Database

No changes to application tables. `expense_photos.storage_path` values remain valid R2 keys.

After migration completes, one cleanup SQL migration:
- Drop `expense_photos_storage_select`, `..._insert`, `..._update`, `..._delete` policies on `storage.objects`.
- Delete the `expense-photos` row from `storage.buckets`.

### R2 setup (one-time, dashboard or MCP)

- Create private bucket `expense-photos` in the project's Cloudflare account.
- Create an R2 API token scoped to this single bucket, permission `Object Read & Write`. Save credentials.
- CORS config on the bucket: allow `PUT, GET` from app origins; allowed header `Content-Type`.

### Secrets (Supabase Edge Function env)

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET` (`expense-photos`)

No client-visible secrets — the app only ever sees presigned URLs scoped to a single object.

## Data flow

### Upload

```
ExpenseEntry → capturePhoto / pickPhotosFromLibrary
            → processAndPersistPhoto (resize, persist to docs dir)
            → db insert into expense_photos + sync_queue entry
            ↓ (sync push picks it up)
photoService.uploadPhotoToStorage(...)
  1. POST r2-photo-url { path, op: 'PUT' }   ← { url, expiresAt }
  2. PUT url with file body, Content-Type: image/jpeg
  3. mark sync_queue entry done
```

The sync queue's existing exponential-backoff retry covers transient failures. The 5-minute presigned-URL TTL is long enough for any single attempt; each retry fetches a fresh URL.

### Read

```
component mounts with storage_path
  → photoService.getSignedPhotoUrl(storage_path)
     1. cache hit (≤50 min old) → return cached url
     2. POST r2-photo-url { path, op: 'GET' }   ← { url, expiresAt }
     3. cache + return
  → <Image source={{ uri }} />
```

UX is identical to today: the function shape and the in-memory cache persist verbatim.

### Delete

```
component → mark expense_photos.deleted_at + sync_queue entry
photoService.deletePhotoFromStorage(storage_path)
  → POST r2-photo-url { path, op: 'DELETE' }   ← { ok: true }
```

Server-side DELETE instead of a presigned DELETE — one round-trip instead of two, and the fire-and-forget semantics of the existing call site already match.

## Error handling

| Failure | Behavior |
|---|---|
| `401` (JWT expired) | supabase-js auto-refreshes; sync push retries on next tick |
| `403` (not a trip member) | Log; surface "Permission denied" only if user-initiated; sync push abandons that queue entry after N retries |
| `400` (bad path shape) | Log; abandon — indicates a bug, not transient |
| Presigned PUT 5xx | Sync queue retries; gets a fresh URL each attempt |
| Presigned PUT 403 (URL expired between fetch & PUT) | One-shot retry inside `uploadPhotoToStorage` (fetch a new URL once) before letting the sync queue handle it |
| Network failure during URL fetch | Same as any offline write — local file stays, sync queue retries when connectivity returns |
| Edge Function cold start | First request after idle adds ~500ms; acceptable; user sees the same "uploading" state as today |
| R2 server-side DELETE fails | Don't block the soft-delete in the DB. Log and leave the object — orphan cleanup is a separate periodic concern |

User-facing rule (per CLAUDE.md): never expose raw errors. Network/permission failures are silent; the sync queue is the retry harness.

## Migration plan

1. **Pre-flight.** Provision R2 bucket, configure CORS, create scoped API token, set Supabase Function secrets. Deploy `r2-photo-url` Edge Function. App build still uses Supabase Storage. Verify the function works against one manually placed test object.
2. **Migration script** `scripts/migrate-photos-to-r2.ts` (run locally with admin creds):
   - List all objects in the Supabase `expense-photos` bucket via service-role key.
   - For each: download bytes, PUT to R2 at the same key.
   - Verify with HEAD on R2 (size match).
   - Write a manifest JSON of migrated keys for audit.
3. **Cutover.** Run script to 100% completion. Ship the app build that swaps `photoService` to R2. New uploads now land in R2 directly.
4. **Soak (1 week).** App in production reading/writing R2. Periodic spot-check via MCP that recent uploads exist in R2 and recent reads succeed. No app-side errors.
5. **Teardown migration.** SQL migration drops the four `expense_photos_storage_*` policies on `storage.objects` and removes the `expense-photos` row from `storage.buckets`. Leave the Supabase bucket non-empty as a passive fallback for one more week before this step if desired.

For larger photo volumes than this app currently has, replace step 2's local script with a one-off Edge Function using the service-role key so bytes don't transit through a laptop.

## Testing

- **Edge Function (Deno test):**
  - 401 on missing/invalid JWT
  - 400 on bad path shape
  - 403 on non-member
  - PUT and GET return well-formed presigned URLs for the expected key
  - DELETE removes (with mocked R2)
- **`photoService` (Jest, mocked fetch):**
  - Upload fetches URL then PUTs
  - `getSignedPhotoUrl` cache hit ≤50 min; refresh on expiry
  - Delete calls function once and invalidates the cache entry
  - One-shot retry on PUT `403` (URL-expired race)
- **Manual e2e:** capture → see in R2 (via MCP) → display → delete on native; repeat on web; non-member account → 403.

## Risks

- **R2 outage** breaks photo upload/read. Sync queue will retry uploads; reads degrade to local-copy fallback for newly opened photos with no signed URL yet. Acceptable.
- **Edge Function cold starts** add latency to the first photo action after idle (~500ms). Existing UX already shows uploading state; acceptable.
- **Presigned URL leak** is bounded — single-object scope, ≤1 hr lifetime, no listing rights. Same blast radius as today's Supabase signed URLs.
- **Migration partial-failure** is recoverable: re-run the script; PUT is idempotent at the same key.

## Open questions

None blocking. Cloudflare account + R2 bucket need to be provisioned by the user (or via the now-installed Workers Bindings MCP) before pre-flight.
