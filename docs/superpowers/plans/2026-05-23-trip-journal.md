# Trip Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Journal layer to the trip view — a 5th tab with a per-day timeline of photos (multi-photo entries), voice clips (with server-side Whisper transcription), and existing expenses, all editable. Day-level summary card + chapter view of all days.

**Architecture:** Four new tables (`journal_photo_entries`, `journal_photos`, `voice_clips`, `journal_days`) reuse the existing offline-first sync engine (sync_queue → push → Realtime → pull). Photos and voice store on Cloudflare R2 via the existing presigned-URL pattern (Edge Function gates by JWT + trip membership). Voice transcription runs server-side after upload via a new `transcribe-voice` Edge Function calling OpenAI Whisper. UI is a new `app/(main)/trip/[id]/(tabs)/journal.tsx` route with sub-views for Today (timeline) and All-days (chapter cards).

**Tech Stack:**
- React Native + Expo SDK 52+ · TypeScript strict · expo-sqlite · expo-av (recording) · expo-image-picker · expo-haptics
- Supabase (Postgres + Realtime + Edge Functions) · Cloudflare R2 (object storage) · OpenAI Whisper
- Existing: Zustand stores, i18next + react-i18next (en/he), `useTheme()`, custom NumPad

**Reference docs (read before starting):**
- `docs/superpowers/specs/2026-05-23-trip-journal-design.md` — the source spec for this plan
- `docs/superpowers/specs/2026-05-23-cloudflare-r2-photo-storage-design.md` — R2 patterns this plan extends
- `CLAUDE.md` — coding conventions, i18n parity rule, design system, FAB/RTL mirroring

---

## File Structure

**New files (created by this plan):**
```
supabase/
├── functions/
│   ├── r2-media-url/                              # renamed from r2-photo-url
│   │   ├── index.ts                               # extends with `kind` discriminator
│   │   ├── validation.ts                          # per-kind regex + bucket lookup
│   │   └── validation.test.ts                     # deno test for new validators
│   ├── r2-photo-url/                              # KEPT as backwards-compat alias
│   │   └── index.ts                               # thin proxy to r2-media-url
│   └── transcribe-voice/                          # new
│       ├── index.ts
│       └── validation.ts
└── migrations/
    └── 20260523180000_trip_journal.sql            # all 4 tables, RLS, indexes

src/
├── types/
│   ├── journal.ts                                 # JournalPhotoEntry, JournalPhoto, JournalDay, TimelineItem
│   └── voice.ts                                   # VoiceClip, TranscriptStatus
├── db/queries/
│   ├── journalPhotoEntries.native.ts + .web.ts
│   ├── journalPhotos.native.ts + .web.ts          # file children of entries
│   ├── voiceClips.native.ts + .web.ts
│   └── journalDays.native.ts + .web.ts
├── services/
│   ├── voiceClipService.native.ts + .web.ts       # record + upload + cache signed URL
│   └── photoService.native.ts                     # MODIFIED — extend with journal-photo upload
├── utils/
│   ├── journalTimeline.ts                         # merge photos+voice+expenses sorted by time
│   ├── journalTimeline.test.ts
│   ├── exifTime.ts                                # parse EXIF DateTimeOriginal
│   ├── exifTime.test.ts
│   └── tripDateClamp.ts                           # clamp imported photo dates to trip range
└── components/
    └── journal/
        ├── DaySummaryCard.tsx                     # hero + day index + counts + location
        ├── TodayTimeline.tsx                      # FlatList of TimelineItemRow
        ├── ChapterView.tsx                        # FlatList of DayCard
        ├── DayCard.tsx                            # one card per day
        ├── JournalFab.tsx                         # FAB + action sheet
        ├── VoiceRecordSheet.tsx                   # modal recorder
        ├── TranscriptEditor.tsx                   # full-screen transcript edit
        ├── DayNav.tsx                             # < day-label > navigator
        └── timeline/
            ├── PhotoEntryRow.tsx
            ├── VoiceClipRow.tsx
            ├── ExpenseTimelineRow.tsx
            └── PhotoGrid.tsx                      # 2×2 thumbnail grid with +N

app/(main)/trip/[id]/(tabs)/
├── journal.tsx                                    # the new screen (route)
└── _layout.tsx                                    # MODIFIED — add Journal tab
```

**Modified files:**
- `src/db/schema.ts` — add `V8_STATEMENTS`
- `src/db/migrations.ts` — register v8
- `src/types/sync.ts` — extend `SyncTable` and `PullTable`
- `src/sync/typeCoercion.ts` — add `BOOL_FIELDS_BY_TABLE` entries
- `src/sync/conflictResolver.native.ts` — apply funcs for 4 new tables
- `src/sync/pullChanges.native.ts` — add tables to `PULL_ORDER`
- `src/sync/pushChanges.native.ts` — add tables to `TABLE_ORDER` + voice/photo upload hooks
- `src/db/queries/contract.ts` — 4 new interfaces
- `src/i18n/locales/en.json` — add `journal` namespace
- `src/i18n/locales/he.json` — add `journal` namespace with Hebrew translations
- `supabase/functions/ai-query/index.ts` — extend trip-context with captions + transcripts

---

## Conventions for this plan

- **TDD:** write the failing test first, run to confirm fail, implement, run to confirm pass, commit.
- **i18n at write time:** every user-facing string lands in both `en.json` AND `he.json` simultaneously (per user memory `feedback_i18n_hebrew_parity.md`). Hebrew is included in each i18n task, not deferred.
- **Commit per task** unless the task says otherwise. Use `/commit-commands:commit` (the executor's git commit hook handles formatting).
- **Native + Web split:** every new query file ships as `.native.ts` + `.web.ts` with a shared contract entry in `src/db/queries/contract.ts`.
- **No `any` types** without a justifying comment.
- **No hardcoded English** in components — go through `useTranslation`.
- **MCP usage:** after applying SQL changes, verify with the Supabase MCP (`mcp__plugin_supabase_supabase__list_tables`, `execute_sql`) rather than spinning up scripts.

---

## Phase 0 — Generalize the R2 Edge Function

Adds a `kind` discriminator to `r2-photo-url` so it can mint URLs for journal photos (new path shape) and voice clips (different bucket). The function is renamed to `r2-media-url`. The old `r2-photo-url` route stays as a thin alias for one release so already-deployed clients keep working.

### Task 0.1: Add audio bucket to Cloudflare R2 and register secret

**Files:** none (infrastructure only)

- [ ] **Step 1: Create R2 bucket via the Cloudflare MCP**

Call:
```
mcp__cloudflare-bindings__r2_bucket_create
  { name: "audio-travel-expense-app", jurisdiction: "eu" }
```

Expected: `{ created: true }`. If the bucket already exists, that's fine.

- [ ] **Step 2: Configure CORS on the new bucket**

Cloudflare dashboard → R2 → `audio-travel-expense-app` → Settings → CORS:
```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

- [ ] **Step 3: Re-issue the R2 API token to cover both buckets**

In the Cloudflare dashboard: R2 → Manage R2 API Tokens → edit the existing `travel-expenses-app` token → scope `Object Read & Write` to **both** `images-travel-expense-app` and `audio-travel-expense-app`. Keep the same access key id and secret if possible; if not, save the new ones for the next step.

- [ ] **Step 4: Set the new Supabase secret**

```bash
npx supabase secrets set R2_BUCKET_AUDIO=audio-travel-expense-app
```

If the access key / secret had to be regenerated in step 3, also:
```bash
npx supabase secrets set R2_ACCESS_KEY_ID=<new>
npx supabase secrets set R2_SECRET_ACCESS_KEY=<new>
```

- [ ] **Step 5: Verify**

```bash
npx supabase secrets list | grep -E "R2_"
```

Expected output includes `R2_BUCKET_AUDIO`. No commit (this is infrastructure).

---

### Task 0.2: Extend validation.ts with kind discriminator (TDD)

**Files:**
- Modify: `supabase/functions/r2-photo-url/validation.ts`
- Modify: `supabase/functions/r2-photo-url/validation.test.ts`

We extend the existing file in place; the rename to `r2-media-url` happens in Task 0.4 (after tests pass).

- [ ] **Step 1: Write failing tests for the kind discriminator**

Open `supabase/functions/r2-photo-url/validation.test.ts` and APPEND these tests (keep all existing tests):

```ts
Deno.test('parseKind: accepts the three known kinds', () => {
  assertEquals(parseKind('expense-photo'), 'expense-photo');
  assertEquals(parseKind('journal-photo'), 'journal-photo');
  assertEquals(parseKind('voice-clip'), 'voice-clip');
});

Deno.test('parseKind: rejects unknown values', () => {
  assertEquals(parseKind(''), null);
  assertEquals(parseKind('photo'), null);
  assertEquals(parseKind(undefined), null);
  assertEquals(parseKind(123), null);
});

Deno.test('parsePath(expense-photo): accepts three-UUID jpg path', () => {
  const r = parsePath(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
    'expense-photo',
  );
  assertEquals(r, {
    tripId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    objectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  });
});

Deno.test('parsePath(journal-photo): accepts trip/journal/photo path', () => {
  const r = parsePath(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/journal/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
    'journal-photo',
  );
  assertEquals(r, {
    tripId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    objectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  });
});

Deno.test('parsePath(journal-photo): rejects three-UUID shape', () => {
  const r = parsePath(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
    'journal-photo',
  );
  assertEquals(r, null);
});

Deno.test('parsePath(voice-clip): accepts trip/clip.m4a path', () => {
  const r = parsePath(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc.m4a',
    'voice-clip',
  );
  assertEquals(r, {
    tripId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    objectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  });
});

Deno.test('parsePath(voice-clip): rejects .jpg extension', () => {
  const r = parsePath(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
    'voice-clip',
  );
  assertEquals(r, null);
});

Deno.test('bucketEnvForKind: maps kinds to env var names', () => {
  assertEquals(bucketEnvForKind('expense-photo'), 'R2_BUCKET_IMAGE');
  assertEquals(bucketEnvForKind('journal-photo'), 'R2_BUCKET_IMAGE');
  assertEquals(bucketEnvForKind('voice-clip'), 'R2_BUCKET_AUDIO');
});

Deno.test('contentTypeForKind: maps to MIME types', () => {
  assertEquals(contentTypeForKind('expense-photo'), 'image/jpeg');
  assertEquals(contentTypeForKind('journal-photo'), 'image/jpeg');
  assertEquals(contentTypeForKind('voice-clip'), 'audio/mp4');
});
```

The existing imports line at the top of the test file already pulls from `./validation.ts`; append `parseKind`, `bucketEnvForKind`, `contentTypeForKind` to that import.

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd supabase/functions/r2-photo-url
deno test validation.test.ts
```

Expected: FAIL. Errors mention `parseKind is not defined` etc.

- [ ] **Step 3: Rewrite validation.ts to support kind**

REPLACE the entire contents of `supabase/functions/r2-photo-url/validation.ts` with:

```ts
// Pure request-shape validation for the r2-media-url Edge Function.
// Extracted so it can be exercised by deno test without booting Deno.serve.

export type Op = 'PUT' | 'GET' | 'DELETE';
export type Kind = 'expense-photo' | 'journal-photo' | 'voice-clip';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// Per-kind path regex. The first capture group is always tripId (so the
// trip-membership check stays uniform). The last capture is the object id —
// either a photo id or a voice-clip id, depending on kind.
const PATH_RE_BY_KIND: Record<Kind, RegExp> = {
  'expense-photo': new RegExp(`^(${UUID})\\/${UUID}\\/(${UUID})\\.jpg$`, 'i'),
  'journal-photo': new RegExp(`^(${UUID})\\/journal\\/(${UUID})\\.jpg$`, 'i'),
  'voice-clip': new RegExp(`^(${UUID})\\/(${UUID})\\.m4a$`, 'i'),
};

// Back-compat alias used by the legacy three-UUID JPG path of `r2-photo-url`.
export const PATH_RE = PATH_RE_BY_KIND['expense-photo'];

export interface ParsedPath {
  tripId: string;
  objectId: string;
}

export function parsePath(path: string, kind: Kind): ParsedPath | null {
  const m = path.match(PATH_RE_BY_KIND[kind]);
  if (!m) return null;
  return { tripId: m[1], objectId: m[2] };
}

export function parseOp(raw: unknown): Op | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.toUpperCase();
  if (upper === 'PUT' || upper === 'GET' || upper === 'DELETE') return upper;
  return null;
}

const KNOWN_KINDS: readonly Kind[] = ['expense-photo', 'journal-photo', 'voice-clip'];

export function parseKind(raw: unknown): Kind | null {
  if (typeof raw !== 'string') return null;
  return (KNOWN_KINDS as readonly string[]).includes(raw) ? (raw as Kind) : null;
}

export function bucketEnvForKind(kind: Kind): 'R2_BUCKET_IMAGE' | 'R2_BUCKET_AUDIO' {
  return kind === 'voice-clip' ? 'R2_BUCKET_AUDIO' : 'R2_BUCKET_IMAGE';
}

export function contentTypeForKind(kind: Kind): string {
  return kind === 'voice-clip' ? 'audio/mp4' : 'image/jpeg';
}
```

- [ ] **Step 4: Update the existing tests that called the old `parsePath(path)` signature**

In the same test file, find the existing `parsePath(...)` calls (the ones from the original test suite, no `kind` arg) and pass `'expense-photo'` as the second argument. Also rename their assertion fields: `expenseId` → `objectId` is now combined into one (the regex no longer captures the middle expenseId UUID since it's redundant). Where the original tests checked the full triple `{ tripId, expenseId, photoId }`, change them to assert `{ tripId, objectId }`.

Concretely, the existing test bodies should become:

```ts
Deno.test('parsePath: valid trip/expense/photo UUIDs', () => {
  const parsed = parsePath(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
    'expense-photo',
  );
  assertEquals(parsed, {
    tripId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    objectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  });
});

Deno.test('parsePath: case-insensitive on hex', () => {
  const parsed = parsePath(
    'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
    'expense-photo',
  );
  assertEquals(parsed?.tripId, 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA');
});

Deno.test('parsePath: rejects shapes without three UUIDs', () => {
  assertEquals(parsePath('test/foo.jpg', 'expense-photo'), null);
  assertEquals(parsePath('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/foo.jpg', 'expense-photo'), null);
  assertEquals(parsePath('one/two/three.jpg', 'expense-photo'), null);
  assertEquals(parsePath('', 'expense-photo'), null);
});

Deno.test('parsePath: rejects path traversal and non-jpg extensions', () => {
  assertEquals(
    parsePath(
      '../../etc/passwd/cccccccc-cccc-4ccc-8ccc-cccccccccccc/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
      'expense-photo',
    ),
    null,
  );
  assertEquals(
    parsePath(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png',
      'expense-photo',
    ),
    null,
  );
});
```

- [ ] **Step 5: Run all tests, confirm green**

```bash
cd supabase/functions/r2-photo-url
deno test validation.test.ts
```

Expected: ALL tests pass.

- [ ] **Step 6: Commit**

Use the `/commit-commands:commit` skill with the message:

```
Extend r2-photo-url validator with kind discriminator

Adds parseKind, kind-aware parsePath, bucketEnvForKind, and contentTypeForKind
so the same Edge Function can serve expense photos, journal photos, and voice
clips. Object key conventions per kind:
  - expense-photo: <tripId>/<expenseId>/<photoId>.jpg
  - journal-photo: <tripId>/journal/<photoId>.jpg
  - voice-clip:    <tripId>/<clipId>.m4a
```

---

### Task 0.3: Rewrite the Edge Function handler to use kind

**Files:**
- Modify: `supabase/functions/r2-photo-url/index.ts`

- [ ] **Step 1: Replace the body of index.ts**

REPLACE the entire contents of `supabase/functions/r2-photo-url/index.ts` with:

```ts
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
  type Kind,
  type Op,
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
```

- [ ] **Step 2: Deploy and smoke-test**

```bash
npx supabase functions deploy r2-photo-url --project-ref <project-ref>
```

Then from a logged-in client (or `curl` with a real JWT), test all three kinds:
```bash
# expense-photo (existing flow)
curl -X POST "https://<project>.functions.supabase.co/r2-photo-url" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"kind":"expense-photo","op":"GET","path":"<tripUUID>/<expenseUUID>/<photoUUID>.jpg"}'

# journal-photo
curl -X POST "https://<project>.functions.supabase.co/r2-photo-url" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"kind":"journal-photo","op":"GET","path":"<tripUUID>/journal/<photoUUID>.jpg"}'

# voice-clip
curl -X POST "https://<project>.functions.supabase.co/r2-photo-url" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"kind":"voice-clip","op":"GET","path":"<tripUUID>/<clipUUID>.m4a"}'

# back-compat: no kind field, still works for expense paths
curl -X POST "https://<project>.functions.supabase.co/r2-photo-url" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"op":"GET","path":"<tripUUID>/<expenseUUID>/<photoUUID>.jpg"}'
```

Expected: all four return `{"url":"https://...","expiresAt":"..."}` (200) for a trip you're a member of; `{"error":"Not a trip member"}` (403) for one you aren't.

- [ ] **Step 3: Commit the handler change**

`/commit-commands:commit` with message:

```
Extend r2-photo-url Edge Function to handle kind discriminator

Routes path validation, bucket selection, and Content-Type per kind. Defaults
to expense-photo when kind is absent, so existing clients keep working until
they update.
```

---

### Task 0.4: Rename function directory to r2-media-url and add alias

This is a directory rename plus a one-file alias. The alias keeps the old route alive so already-deployed Edge Function clients (and the not-yet-updated photoService) keep working until Phase 5.

**Files:**
- Move: `supabase/functions/r2-photo-url/` → `supabase/functions/r2-media-url/`
- Create: `supabase/functions/r2-photo-url/index.ts` (alias proxy)

- [ ] **Step 1: Move the directory**

```bash
git mv supabase/functions/r2-photo-url supabase/functions/r2-media-url
```

- [ ] **Step 2: Re-create r2-photo-url as a thin alias**

Create `supabase/functions/r2-photo-url/index.ts`:

```ts
// Back-compat alias: forwards to r2-media-url, defaulting kind to
// 'expense-photo' for callers that predate the kind discriminator.
// Retire this file in Phase 5 once every shipped client targets r2-media-url.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}
  if (body.kind == null) body.kind = 'expense-photo';

  const proxy = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await proxy.functions.invoke('r2-media-url', { body });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 3: Deploy both functions**

```bash
npx supabase functions deploy r2-media-url --project-ref <project-ref>
npx supabase functions deploy r2-photo-url --project-ref <project-ref>
```

- [ ] **Step 4: Verify alias works**

Repeat one of the curl calls from Task 0.3 step 2 against both `r2-media-url` and `r2-photo-url`. Both should return the same shape of response.

- [ ] **Step 5: Update photoService to call r2-media-url with explicit kind**

Modify `src/services/photoService.native.ts`. Find the two call sites and update:

Find the `requestPresignedR2Url` function (around line 87) and replace its body so it passes `kind: 'expense-photo'` and calls the new function name:

```ts
async function requestPresignedR2Url(
  path: string,
  op: 'PUT' | 'GET',
): Promise<PresignedResponse> {
  const { data, error } = await supabase.functions.invoke<PresignedResponse>(
    'r2-media-url',
    { body: { kind: 'expense-photo', path, op } },
  );
  if (error) throw error;
  if (!data?.url) throw new Error('r2-media-url: empty response');
  return data;
}
```

Then find the DELETE call near the end of the file (the `deletePhotoFromStorage` function) and update:

```ts
export async function deletePhotoFromStorage(
  storagePath: string | null | undefined,
): Promise<void> {
  if (!storagePath) return;
  signedCache.delete(storagePath);
  const { error } = await supabase.functions.invoke('r2-media-url', {
    body: { kind: 'expense-photo', path: storagePath, op: 'DELETE' },
  });
  if (error) throw error;
}
```

- [ ] **Step 6: Same edits in `src/services/photoService.web.ts`**

Repeat the equivalent change in the web variant. The web file has the same two call sites in the same shape.

- [ ] **Step 7: Type-check and commit**

```bash
npx tsc --noEmit
```

Expected: no new errors.

`/commit-commands:commit` with message:

```
Rename r2-photo-url Edge Function to r2-media-url

Old name kept as a back-compat alias for already-deployed clients. The
existing photoService is updated to call r2-media-url directly with the
expense-photo kind. Alias retires in Phase 5.
```

---

## Phase 1 — Data layer

Adds the four new tables (remote + local), types, query files, sync engine wiring, and the journal-photo upload extension to `photoService`. No UI yet — every change here is testable via SQL/MCP and unit tests.

### Task 1.1: Postgres migration — 4 tables, indexes, RLS

**Files:**
- Create: `supabase/migrations/20260523180000_trip_journal.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260523180000_trip_journal.sql`:

```sql
-- Trip Journal tables.
-- Adds the per-day timeline layer: photo entries (1..N file children),
-- voice clips with server-side Whisper transcription, and per-day metadata
-- (cover override + manual location override).

----------------------------------------------------------------------
-- journal_photo_entries — one row per gallery pick.
----------------------------------------------------------------------
create table if not exists public.journal_photo_entries (
    id            uuid primary key default gen_random_uuid(),
    trip_id       uuid not null references public.trips(id) on delete cascade,
    user_id       uuid not null references public.profiles(id),
    occurred_at   timestamptz not null,
    caption       text,
    is_private    boolean not null default false,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    deleted_at    timestamptz
);

create index if not exists idx_journal_photo_entries_trip_date
    on public.journal_photo_entries (trip_id, occurred_at)
    where deleted_at is null;

create index if not exists idx_journal_photo_entries_user
    on public.journal_photo_entries (user_id)
    where deleted_at is null;

----------------------------------------------------------------------
-- journal_photos — file children of an entry. No soft-delete: parent
-- cascade is the only way to remove.
----------------------------------------------------------------------
create table if not exists public.journal_photos (
    id              uuid primary key default gen_random_uuid(),
    entry_id        uuid not null references public.journal_photo_entries(id) on delete cascade,
    storage_path    text not null,
    local_uri       text,
    sort_order      integer not null default 0,
    exif_taken_at   timestamptz,
    created_at      timestamptz not null default now()
);

create index if not exists idx_journal_photos_entry
    on public.journal_photos (entry_id);

----------------------------------------------------------------------
-- voice_clips — single audio file per row, with Whisper transcript state.
----------------------------------------------------------------------
create table if not exists public.voice_clips (
    id                uuid primary key default gen_random_uuid(),
    trip_id           uuid not null references public.trips(id) on delete cascade,
    user_id           uuid not null references public.profiles(id),
    occurred_at       timestamptz not null,
    storage_path      text not null default '',
    local_uri         text,
    duration_sec      integer not null check (duration_sec between 1 and 300),
    transcript        text,
    transcript_status text not null default 'pending'
                       check (transcript_status in ('pending','processing','done','failed')),
    transcript_error  text,
    is_private        boolean not null default false,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    deleted_at        timestamptz
);

create index if not exists idx_voice_clips_trip_date
    on public.voice_clips (trip_id, occurred_at)
    where deleted_at is null;

create index if not exists idx_voice_clips_user
    on public.voice_clips (user_id)
    where deleted_at is null;

----------------------------------------------------------------------
-- journal_days — per-day metadata. Row exists only when the user has
-- overridden cover or set a location.
----------------------------------------------------------------------
create table if not exists public.journal_days (
    id                    uuid primary key default gen_random_uuid(),
    trip_id               uuid not null references public.trips(id) on delete cascade,
    day_date              date not null,
    location              text,
    cover_photo_entry_id  uuid references public.journal_photo_entries(id) on delete set null,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    deleted_at            timestamptz,
    unique (trip_id, day_date)
);

create index if not exists idx_journal_days_trip_date
    on public.journal_days (trip_id, day_date)
    where deleted_at is null;

----------------------------------------------------------------------
-- updated_at triggers (reuse existing app_private.touch_updated_at)
----------------------------------------------------------------------
create or replace trigger journal_photo_entries_touch_updated
    before update on public.journal_photo_entries
    for each row execute function app_private.touch_updated_at();

create or replace trigger voice_clips_touch_updated
    before update on public.voice_clips
    for each row execute function app_private.touch_updated_at();

create or replace trigger journal_days_touch_updated
    before update on public.journal_days
    for each row execute function app_private.touch_updated_at();

----------------------------------------------------------------------
-- Row Level Security — trip membership for everything.
----------------------------------------------------------------------
alter table public.journal_photo_entries enable row level security;

create policy "journal_photo_entries_select"
    on public.journal_photo_entries for select
    to authenticated
    using (app_private.is_trip_member(trip_id));
create policy "journal_photo_entries_insert"
    on public.journal_photo_entries for insert
    to authenticated
    with check (app_private.is_trip_member(trip_id) and user_id = auth.uid());
create policy "journal_photo_entries_update"
    on public.journal_photo_entries for update
    to authenticated
    using (app_private.is_trip_member(trip_id))
    with check (app_private.is_trip_member(trip_id));
create policy "journal_photo_entries_delete"
    on public.journal_photo_entries for delete
    to authenticated
    using (app_private.is_trip_member(trip_id));

-- journal_photos inherits security from its parent entry; we still need
-- explicit policies on the table.
alter table public.journal_photos enable row level security;

create policy "journal_photos_select"
    on public.journal_photos for select
    to authenticated
    using (entry_id in (select id from public.journal_photo_entries
                         where app_private.is_trip_member(trip_id)));
create policy "journal_photos_insert"
    on public.journal_photos for insert
    to authenticated
    with check (entry_id in (select id from public.journal_photo_entries
                              where app_private.is_trip_member(trip_id)
                                and user_id = auth.uid()));
create policy "journal_photos_update"
    on public.journal_photos for update
    to authenticated
    using (entry_id in (select id from public.journal_photo_entries
                         where app_private.is_trip_member(trip_id)));
create policy "journal_photos_delete"
    on public.journal_photos for delete
    to authenticated
    using (entry_id in (select id from public.journal_photo_entries
                         where app_private.is_trip_member(trip_id)));

alter table public.voice_clips enable row level security;

create policy "voice_clips_select"
    on public.voice_clips for select
    to authenticated
    using (app_private.is_trip_member(trip_id));
create policy "voice_clips_insert"
    on public.voice_clips for insert
    to authenticated
    with check (app_private.is_trip_member(trip_id) and user_id = auth.uid());
create policy "voice_clips_update"
    on public.voice_clips for update
    to authenticated
    using (app_private.is_trip_member(trip_id))
    with check (app_private.is_trip_member(trip_id));
create policy "voice_clips_delete"
    on public.voice_clips for delete
    to authenticated
    using (app_private.is_trip_member(trip_id));

alter table public.journal_days enable row level security;

create policy "journal_days_select"
    on public.journal_days for select
    to authenticated
    using (app_private.is_trip_member(trip_id));
create policy "journal_days_insert"
    on public.journal_days for insert
    to authenticated
    with check (app_private.is_trip_member(trip_id));
create policy "journal_days_update"
    on public.journal_days for update
    to authenticated
    using (app_private.is_trip_member(trip_id))
    with check (app_private.is_trip_member(trip_id));
create policy "journal_days_delete"
    on public.journal_days for delete
    to authenticated
    using (app_private.is_trip_member(trip_id));

----------------------------------------------------------------------
-- Realtime publication
----------------------------------------------------------------------
alter publication supabase_realtime add table public.journal_photo_entries;
alter publication supabase_realtime add table public.journal_photos;
alter publication supabase_realtime add table public.voice_clips;
alter publication supabase_realtime add table public.journal_days;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected: `Applying migration 20260523180000_trip_journal.sql...` and no errors.

- [ ] **Step 3: Verify via Supabase MCP**

```
mcp__plugin_supabase_supabase__list_tables { schemas: ["public"] }
```

Expected: response includes `journal_photo_entries`, `journal_photos`, `voice_clips`, `journal_days`.

Then check advisors:
```
mcp__plugin_supabase_supabase__get_advisors { type: "security" }
mcp__plugin_supabase_supabase__get_advisors { type: "performance" }
```

Expected: no new ERROR-level findings for the four new tables. WARN-level performance findings (missing indexes) are acceptable if they're outside our hot-path queries; otherwise add an index in a follow-up edit before committing.

- [ ] **Step 4: Commit**

`/commit-commands:commit` with message:

```
Add trip_journal Postgres schema

Four new tables for the per-day Journal layer: journal_photo_entries
(timeline rows), journal_photos (file children), voice_clips (audio +
transcript state), journal_days (per-day metadata). Trip-membership RLS
plus updated_at triggers, indexes on the hot read paths, and realtime
publication.
```

---

### Task 1.2: Local SQLite schema mirror (V8)

**Files:**
- Modify: `src/db/schema.ts` (append `V8_STATEMENTS` and extend `ALL_TABLES`)
- Modify: `src/db/migrations.ts` (register v8)

- [ ] **Step 1: Append V8_STATEMENTS to schema.ts**

Open `src/db/schema.ts` and insert this block right after `V7_STATEMENTS` (the block ending `] as const;`):

```ts
// V8: trip journal — photo entries with file children, voice clips with
// transcript state, and per-day metadata. Mirrors the Postgres tables added
// in migration 20260523180000_trip_journal.sql.
export const V8_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS journal_photo_entries (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    caption TEXT,
    is_private INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`,
  'CREATE INDEX IF NOT EXISTS idx_journal_photo_entries_trip_date ON journal_photo_entries(trip_id, occurred_at);',
  'CREATE INDEX IF NOT EXISTS idx_journal_photo_entries_user ON journal_photo_entries(user_id);',

  `CREATE TABLE IF NOT EXISTS journal_photos (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL REFERENCES journal_photo_entries(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    local_uri TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    exif_taken_at TEXT,
    created_at TEXT NOT NULL
  );`,
  'CREATE INDEX IF NOT EXISTS idx_journal_photos_entry ON journal_photos(entry_id);',

  `CREATE TABLE IF NOT EXISTS voice_clips (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    storage_path TEXT NOT NULL DEFAULT '',
    local_uri TEXT,
    duration_sec INTEGER NOT NULL CHECK (duration_sec BETWEEN 1 AND 300),
    transcript TEXT,
    transcript_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (transcript_status IN ('pending','processing','done','failed')),
    transcript_error TEXT,
    is_private INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`,
  'CREATE INDEX IF NOT EXISTS idx_voice_clips_trip_date ON voice_clips(trip_id, occurred_at);',
  'CREATE INDEX IF NOT EXISTS idx_voice_clips_user ON voice_clips(user_id);',

  `CREATE TABLE IF NOT EXISTS journal_days (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_date TEXT NOT NULL,
    location TEXT,
    cover_photo_entry_id TEXT REFERENCES journal_photo_entries(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    UNIQUE (trip_id, day_date)
  );`,
  'CREATE INDEX IF NOT EXISTS idx_journal_days_trip_date ON journal_days(trip_id, day_date);',
] as const;
```

Then extend `ALL_TABLES` at the bottom of the file:

```ts
export const ALL_TABLES = [
  'profiles',
  'trips',
  'trip_members',
  'categories',
  'expenses',
  'expense_splits',
  'expense_photos',
  'exchange_rates',
  'settlement_payments',
  'journal_photo_entries',
  'journal_photos',
  'voice_clips',
  'journal_days',
  'sync_queue',
  'sync_metadata',
] as const;
```

- [ ] **Step 2: Register the v8 migration**

Open `src/db/migrations.ts`. Add the import at the top:

```ts
import {
  V1_STATEMENTS,
  V3_STATEMENTS,
  V4_STATEMENTS,
  V5_STATEMENTS,
  V6_STATEMENTS,
  V7_STATEMENTS,
  V8_STATEMENTS,
} from './schema';
```

Then append a new entry to the `MIGRATIONS` array, just before the closing `] as const;`:

```ts
  {
    version: 8,
    name: 'trip_journal',
    run: async (db) => {
      for (const stmt of V8_STATEMENTS) {
        await db.execAsync(stmt);
      }
    },
  },
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Manual smoke (the app's startup runs migrations automatically)**

Boot the app on a simulator/device that's already on v7 to confirm the migration runs cleanly:
```bash
npx expo start --android
```

Watch the Metro logs for "Migration v8 (trip_journal) completed" (or equivalent — there's no explicit log today, but a successful boot to the trip list means migration succeeded). If you see "Migration v8 failed", check the error in the rejection.

- [ ] **Step 5: Commit**

`/commit-commands:commit`:

```
Mirror trip journal tables in local SQLite (v8 migration)

Adds journal_photo_entries, journal_photos, voice_clips, journal_days to
the local schema with the same column shape as Postgres (booleans as
INTEGER 0/1, timestamps as ISO-8601 TEXT).
```

---

### Task 1.3: TypeScript types for journal & voice

**Files:**
- Create: `src/types/journal.ts`
- Create: `src/types/voice.ts`

- [ ] **Step 1: Write the journal types file**

Create `src/types/journal.ts`:

```ts
// Trip Journal entity + row types.
// Row types mirror the local SQLite shape (booleans as 0/1, timestamps as
// ISO-8601 strings). Entity types are the camelCase domain shape used by
// React components and stores.

export interface JournalPhotoEntryRow {
  id: string;
  trip_id: string;
  user_id: string;
  occurred_at: string;          // ISO-8601 with timezone
  caption: string | null;
  is_private: number;           // 0 or 1
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface JournalPhotoEntry {
  id: string;
  tripId: string;
  userId: string;
  occurredAt: string;
  caption: string | null;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface JournalPhotoRow {
  id: string;
  entry_id: string;
  storage_path: string;
  local_uri: string | null;
  sort_order: number;
  exif_taken_at: string | null;
  created_at: string;
}

export interface JournalPhoto {
  id: string;
  entryId: string;
  storagePath: string;
  localUri: string | null;
  sortOrder: number;
  exifTakenAt: string | null;
  createdAt: string;
}

// Photo entry with its file children attached — what the UI actually
// renders in the timeline.
export interface JournalPhotoEntryWithPhotos extends JournalPhotoEntry {
  photos: JournalPhoto[];
}

export interface JournalDayRow {
  id: string;
  trip_id: string;
  day_date: string;                            // YYYY-MM-DD
  location: string | null;
  cover_photo_entry_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface JournalDay {
  id: string;
  tripId: string;
  dayDate: string;
  location: string | null;
  coverPhotoEntryId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// Aggregate row for the chapter (All-days) view. Computed across multiple
// tables — see queries/journalDays.
export interface DaySummary {
  dayDate: string;
  dayIndex: number;                  // 1-based day-in-trip
  photoCount: number;
  voiceCount: number;
  expenseCount: number;
  totalConvertedAmount: number;      // in trip.home_currency
  coverStoragePath: string | null;
  effectiveLocation: string | null;
}
```

- [ ] **Step 2: Write the voice types file**

Create `src/types/voice.ts`:

```ts
// Voice clip entity + row types. Transcription is handled server-side by
// the transcribe-voice Edge Function; the client only reads & edits the
// resulting transcript.

export type TranscriptStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface VoiceClipRow {
  id: string;
  trip_id: string;
  user_id: string;
  occurred_at: string;          // ISO-8601 with timezone
  storage_path: string;         // '' until uploaded
  local_uri: string | null;
  duration_sec: number;         // 1–300
  transcript: string | null;
  transcript_status: TranscriptStatus;
  transcript_error: string | null;
  is_private: number;           // 0 or 1
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface VoiceClip {
  id: string;
  tripId: string;
  userId: string;
  occurredAt: string;
  storagePath: string;
  localUri: string | null;
  durationSec: number;
  transcript: string | null;
  transcriptStatus: TranscriptStatus;
  transcriptError: string | null;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

`/commit-commands:commit`:

```
Add TypeScript types for Trip Journal entities

Mirrors the new SQLite tables: JournalPhotoEntry/Photo/Day (with row vs
camelCase variants) and VoiceClip with TranscriptStatus union. Adds
JournalPhotoEntryWithPhotos (the timeline render unit) and DaySummary (the
chapter-view aggregate row).
```

---

### Task 1.4: Extend sync types and type coercion table

**Files:**
- Modify: `src/types/sync.ts`
- Modify: `src/sync/typeCoercion.ts`

- [ ] **Step 1: Extend SyncTable**

Open `src/types/sync.ts`. Replace the existing `SyncTable` definition with:

```ts
export type SyncTable =
  | 'profiles'
  | 'trips'
  | 'trip_members'
  | 'expenses'
  | 'expense_splits'
  | 'expense_photos'
  | 'categories'
  | 'settlement_payments'
  | 'journal_photo_entries'
  | 'journal_photos'
  | 'voice_clips'
  | 'journal_days';
```

`PullTable` is `= SyncTable`, so it picks up the new entries automatically.

- [ ] **Step 2: Extend BOOL_FIELDS_BY_TABLE**

Open `src/sync/typeCoercion.ts`. Replace the `BOOL_FIELDS_BY_TABLE` constant:

```ts
export const BOOL_FIELDS_BY_TABLE: Record<SyncTable, readonly string[]> = {
  profiles: [],
  trips: [],
  trip_members: [],
  categories: ['is_archived'],
  expenses: ['is_refund', 'is_excluded_from_daily_metrics', 'is_private', 'is_split'],
  expense_splits: ['is_payer'],
  expense_photos: [],
  settlement_payments: [],
  journal_photo_entries: ['is_private'],
  journal_photos: [],
  voice_clips: ['is_private'],
  journal_days: [],
};
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors in conflictResolver / pullChanges / pushChanges complaining about new SyncTable values that aren't handled yet. That's expected — Tasks 1.6 and 1.7 fix them.

- [ ] **Step 4: Commit**

`/commit-commands:commit`:

```
Register journal/voice tables in SyncTable + bool field map

Sync-engine helpers know the four new tables exist. Apply funcs and
TABLE_ORDER updates follow.
```

---

### Task 1.5: Sync engine — push & pull ordering

**Files:**
- Modify: `src/sync/pushChanges.native.ts`
- Modify: `src/sync/pullChanges.native.ts`

- [ ] **Step 1: Add tables to TABLE_ORDER in pushChanges.native.ts**

Open `src/sync/pushChanges.native.ts`. Replace the `TABLE_ORDER` constant:

```ts
// Dependency order: tables whose rows are referenced by FKs push first.
const TABLE_ORDER: SyncTable[] = [
  'profiles',
  'trips',
  'trip_members',
  'categories',
  'expenses',
  'expense_splits',
  'expense_photos',
  'settlement_payments',
  'journal_photo_entries',     // parent of journal_photos
  'journal_photos',
  'voice_clips',
  'journal_days',              // references journal_photo_entries(cover) — must push after
];
```

- [ ] **Step 2: Add tables to PULL_ORDER in pullChanges.native.ts**

Open `src/sync/pullChanges.native.ts`. Replace the `PULL_ORDER` constant:

```ts
const PULL_ORDER: PullTable[] = [
  'profiles',
  'trips',
  'trip_members',
  'categories',
  'expenses',
  'expense_splits',
  'expense_photos',
  'settlement_payments',
  'journal_photo_entries',
  'journal_photos',
  'voice_clips',
  'journal_days',
];
```

Also extend the `cursorColumn` helper so `journal_photos` uses `created_at` (it has no `updated_at` column — same as `expense_photos`):

```ts
function cursorColumn(table: PullTable): 'updated_at' | 'created_at' {
  if (table === 'expense_photos' || table === 'journal_photos') return 'created_at';
  return 'updated_at';
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: still errors in `applyRemote` / `getLocalUpdatedAt` because the apply funcs for the new tables don't exist. That's the next task.

- [ ] **Step 4: Commit**

`/commit-commands:commit`:

```
Add journal/voice tables to sync push and pull ordering

Push order respects FK dependencies (entries before photos, cover_photo_entry_id
links from days back to entries). Pull cursor uses created_at for journal_photos
(no updated_at column) and updated_at for everything else.
```

---

### Task 1.6: Conflict resolver — apply funcs for the 4 new tables

**Files:**
- Modify: `src/sync/conflictResolver.native.ts`

- [ ] **Step 1: Add the apply functions**

Open `src/sync/conflictResolver.native.ts`. Add these four functions right before the `applyRemote` switch (search for the existing `async function applyTrip(...)` — group the new ones below the existing helpers):

```ts
async function applyJournalPhotoEntry(db: SQLiteDatabase, r: Remote): Promise<void> {
  await db.runAsync(
    `INSERT INTO journal_photo_entries
       (id, trip_id, user_id, occurred_at, caption, is_private,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       trip_id = excluded.trip_id,
       user_id = excluded.user_id,
       occurred_at = excluded.occurred_at,
       caption = excluded.caption,
       is_private = excluded.is_private,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at;`,
    [
      asString(r.id),
      asString(r.trip_id),
      asString(r.user_id),
      asString(r.occurred_at),
      asString(r.caption),
      asBoolInt(r.is_private),
      asString(r.created_at) ?? new Date().toISOString(),
      asString(r.updated_at) ?? new Date().toISOString(),
      asString(r.deleted_at),
    ],
  );
}

async function applyJournalPhoto(db: SQLiteDatabase, r: Remote): Promise<void> {
  // No soft delete — children cascade with parent. Use INSERT OR REPLACE
  // because there's no updated_at to compare and no children to cascade.
  await db.runAsync(
    `INSERT OR REPLACE INTO journal_photos
       (id, entry_id, storage_path, local_uri, sort_order, exif_taken_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [
      asString(r.id),
      asString(r.entry_id),
      asString(r.storage_path) ?? '',
      asString(r.local_uri),
      asNumber(r.sort_order) ?? 0,
      asString(r.exif_taken_at),
      asString(r.created_at) ?? new Date().toISOString(),
    ],
  );
}

async function applyVoiceClip(db: SQLiteDatabase, r: Remote): Promise<void> {
  await db.runAsync(
    `INSERT INTO voice_clips
       (id, trip_id, user_id, occurred_at, storage_path, local_uri, duration_sec,
        transcript, transcript_status, transcript_error, is_private,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       trip_id = excluded.trip_id,
       user_id = excluded.user_id,
       occurred_at = excluded.occurred_at,
       storage_path = excluded.storage_path,
       transcript = excluded.transcript,
       transcript_status = excluded.transcript_status,
       transcript_error = excluded.transcript_error,
       is_private = excluded.is_private,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at;`,
    [
      asString(r.id),
      asString(r.trip_id),
      asString(r.user_id),
      asString(r.occurred_at),
      asString(r.storage_path) ?? '',
      asString(r.local_uri),
      asNumber(r.duration_sec) ?? 1,
      asString(r.transcript),
      asString(r.transcript_status) ?? 'pending',
      asString(r.transcript_error),
      asBoolInt(r.is_private),
      asString(r.created_at) ?? new Date().toISOString(),
      asString(r.updated_at) ?? new Date().toISOString(),
      asString(r.deleted_at),
    ],
  );
}

async function applyJournalDay(db: SQLiteDatabase, r: Remote): Promise<void> {
  await db.runAsync(
    `INSERT INTO journal_days
       (id, trip_id, day_date, location, cover_photo_entry_id,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       location = excluded.location,
       cover_photo_entry_id = excluded.cover_photo_entry_id,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at;`,
    [
      asString(r.id),
      asString(r.trip_id),
      asString(r.day_date),
      asString(r.location),
      asString(r.cover_photo_entry_id),
      asString(r.created_at) ?? new Date().toISOString(),
      asString(r.updated_at) ?? new Date().toISOString(),
      asString(r.deleted_at),
    ],
  );
}
```

- [ ] **Step 2: Wire them into the `applyRemote` switch**

Find the existing `applyRemote` function (large switch over `table`). Add cases for the four new tables:

```ts
    case 'journal_photo_entries': {
      const local = await getLocalUpdatedAt(db, table, asString(r.id) ?? '');
      if (!shouldApplyRemote(local, asString(r.updated_at))) return false;
      await applyJournalPhotoEntry(db, r);
      return true;
    }
    case 'journal_photos':
      // No updated_at; pull cursor uses created_at. Always apply.
      await applyJournalPhoto(db, r);
      return true;
    case 'voice_clips': {
      const local = await getLocalUpdatedAt(db, table, asString(r.id) ?? '');
      if (!shouldApplyRemote(local, asString(r.updated_at))) return false;
      await applyVoiceClip(db, r);
      return true;
    }
    case 'journal_days': {
      const local = await getLocalUpdatedAt(db, table, asString(r.id) ?? '');
      if (!shouldApplyRemote(local, asString(r.updated_at))) return false;
      await applyJournalDay(db, r);
      return true;
    }
```

- [ ] **Step 3: Extend `getLocalUpdatedAt` for journal_photos (no updated_at column)**

Find the existing `getLocalUpdatedAt` function. Add this branch (alongside the existing `expense_photos` branch):

```ts
  if (table === 'journal_photos') {
    const row = await db.getFirstAsync<{ created_at: string }>(
      'SELECT created_at FROM journal_photos WHERE id = ?;',
      [id],
    );
    return row?.created_at ?? null;
  }
```

- [ ] **Step 4: Extend `refreshStores` if it touches any per-table refresh hook**

In the same file, locate `refreshStores`. If it dispatches per-table refresh actions (e.g. via `useExpenseStore.refresh()`), add no-op-safe entries for the new tables — the journal screen will subscribe to changes via its own hook, so no central refresh is required yet. If the function is just a single Zustand `useAllStores().refresh()` call, leave it alone.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Run the existing conflictResolver tests to ensure no regression**

```bash
npx jest src/sync/conflictResolver.test.ts
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

`/commit-commands:commit`:

```
Apply funcs for journal_photo_entries/photos, voice_clips, journal_days

UPSERT pattern for parents (so ON DELETE CASCADE doesn't wipe children);
INSERT OR REPLACE for journal_photos which has no updated_at and no
children of its own. getLocalUpdatedAt handles the journal_photos
no-updated_at case alongside expense_photos.
```

---

### Task 1.7: Query contracts and native implementations

This task adds the four new contract interfaces and the native + web query files. We write each entity's create-and-read path now; reorder/update/delete follow in their own tasks.

**Files:**
- Modify: `src/db/queries/contract.ts`
- Create: `src/db/queries/journalPhotoEntries.native.ts` + `.web.ts`
- Create: `src/db/queries/journalPhotos.native.ts` + `.web.ts`
- Create: `src/db/queries/voiceClips.native.ts` + `.web.ts`
- Create: `src/db/queries/journalDays.native.ts` + `.web.ts`

#### 1.7a — Contracts

- [ ] **Step 1: Add contract interfaces**

Open `src/db/queries/contract.ts`. Add these imports near the top:

```ts
import type {
  DaySummary,
  JournalDay,
  JournalPhoto,
  JournalPhotoEntry,
  JournalPhotoEntryWithPhotos,
} from '@/types/journal';
import type { VoiceClip } from '@/types/voice';
```

Append the new interfaces at the bottom of the file:

```ts
// -----------------------------------------------------------------------------
// journal_photo_entries (+ children)
// -----------------------------------------------------------------------------
export interface JournalPhotoEntriesQueries {
  listEntriesForDay: (
    tripId: string,
    dayDateISO: string,
    currentUserId: string,
  ) => Promise<JournalPhotoEntryWithPhotos[]>;
  createEntry: (input: {
    tripId: string;
    userId: string;
    occurredAt: string;
    caption: string | null;
    isPrivate: boolean;
    photos: Array<{
      localUri: string;
      sortOrder: number;
      exifTakenAt: string | null;
    }>;
  }) => Promise<JournalPhotoEntryWithPhotos>;
  updateEntryCaption: (entryId: string, caption: string | null) => Promise<void>;
  updateEntryOccurredAt: (entryId: string, occurredAtISO: string) => Promise<void>;
  updateEntryPrivacy: (entryId: string, isPrivate: boolean) => Promise<void>;
  softDeleteEntry: (entryId: string) => Promise<void>;
  countPhotosForTripDay: (tripId: string, dayDateISO: string, currentUserId: string) => Promise<number>;
  firstPhotoStoragePathForDay: (
    tripId: string,
    dayDateISO: string,
    currentUserId: string,
  ) => Promise<string | null>;
}

// -----------------------------------------------------------------------------
// voice_clips
// -----------------------------------------------------------------------------
export interface VoiceClipsQueries {
  listClipsForDay: (
    tripId: string,
    dayDateISO: string,
    currentUserId: string,
  ) => Promise<VoiceClip[]>;
  createClip: (input: {
    tripId: string;
    userId: string;
    occurredAt: string;
    localUri: string;
    durationSec: number;
    isPrivate: boolean;
  }) => Promise<VoiceClip>;
  updateClipTranscript: (clipId: string, transcript: string | null) => Promise<void>;
  updateClipOccurredAt: (clipId: string, occurredAtISO: string) => Promise<void>;
  updateClipPrivacy: (clipId: string, isPrivate: boolean) => Promise<void>;
  softDeleteClip: (clipId: string) => Promise<void>;
  countClipsForTripDay: (tripId: string, dayDateISO: string, currentUserId: string) => Promise<number>;
}

// -----------------------------------------------------------------------------
// journal_days (lazy per-day metadata)
// -----------------------------------------------------------------------------
export interface JournalDaysQueries {
  getDayMetadata: (tripId: string, dayDateISO: string) => Promise<JournalDay | null>;
  setLocation: (tripId: string, dayDateISO: string, location: string | null) => Promise<JournalDay>;
  setCoverPhotoEntry: (
    tripId: string,
    dayDateISO: string,
    entryId: string | null,
  ) => Promise<JournalDay>;
  // Aggregate read for the chapter (All-days) view.
  listDaySummaries: (tripId: string, currentUserId: string) => Promise<DaySummary[]>;
}
```

- [ ] **Step 2: Type-check (will still fail until implementations exist)**

```bash
npx tsc --noEmit
```

Expected: errors only in the not-yet-created `.native.ts` / `.web.ts` files. Move on — they get created next.

#### 1.7b — journalPhotoEntries.native.ts

- [ ] **Step 3: Create the native query file**

Create `src/db/queries/journalPhotoEntries.native.ts`:

```ts
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import type {
  JournalPhoto,
  JournalPhotoEntry,
  JournalPhotoEntryRow,
  JournalPhotoEntryWithPhotos,
  JournalPhotoRow,
} from '@/types/journal';

import type { JournalPhotoEntriesQueries } from './contract';
import { enqueueSync } from './syncQueue';

function rowToEntry(r: JournalPhotoEntryRow): JournalPhotoEntry {
  return {
    id: r.id,
    tripId: r.trip_id,
    userId: r.user_id,
    occurredAt: r.occurred_at,
    caption: r.caption,
    isPrivate: r.is_private === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

function rowToPhoto(r: JournalPhotoRow): JournalPhoto {
  return {
    id: r.id,
    entryId: r.entry_id,
    storagePath: r.storage_path,
    localUri: r.local_uri,
    sortOrder: r.sort_order,
    exifTakenAt: r.exif_taken_at,
    createdAt: r.created_at,
  };
}

export function entryToPayload(e: JournalPhotoEntry): Record<string, unknown> {
  return {
    id: e.id,
    trip_id: e.tripId,
    user_id: e.userId,
    occurred_at: e.occurredAt,
    caption: e.caption,
    is_private: e.isPrivate ? 1 : 0,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    deleted_at: e.deletedAt,
  };
}

export function photoToPayload(p: JournalPhoto): Record<string, unknown> {
  return {
    id: p.id,
    entry_id: p.entryId,
    storage_path: p.storagePath,
    local_uri: p.localUri,
    sort_order: p.sortOrder,
    exif_taken_at: p.exifTakenAt,
    created_at: p.createdAt,
  };
}

// Used by the sync engine's photo-upload step.
export async function getPhotoById(
  db: SQLiteDatabase,
  id: string,
): Promise<JournalPhoto | null> {
  const row = await db.getFirstAsync<JournalPhotoRow>(
    'SELECT * FROM journal_photos WHERE id = ?;',
    [id],
  );
  return row ? rowToPhoto(row) : null;
}

export async function setPhotoStoragePath(
  db: SQLiteDatabase,
  id: string,
  storagePath: string,
): Promise<void> {
  await db.runAsync(
    'UPDATE journal_photos SET storage_path = ? WHERE id = ?;',
    [storagePath, id],
  );
}

// Day-boundary helper: an ISO timestamp falls into a day if its local-date
// portion equals the given dayDateISO (YYYY-MM-DD). The SQLite expression
// SUBSTR(occurred_at, 1, 10) returns the date portion — works because we
// store ISO-8601 with timezone, and the user's local-timezone day is what
// matters for grouping.
export async function listEntriesForDay(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<JournalPhotoEntryWithPhotos[]> {
  const db = await getDatabase();
  const entries = await db.getAllAsync<JournalPhotoEntryRow>(
    `SELECT * FROM journal_photo_entries
      WHERE trip_id = ?
        AND SUBSTR(occurred_at, 1, 10) = ?
        AND deleted_at IS NULL
        AND (is_private = 0 OR user_id = ?)
      ORDER BY occurred_at ASC;`,
    [tripId, dayDateISO, currentUserId],
  );
  if (entries.length === 0) return [];
  const entryIds = entries.map((e) => e.id);
  const placeholders = entryIds.map(() => '?').join(',');
  const photos = await db.getAllAsync<JournalPhotoRow>(
    `SELECT * FROM journal_photos
      WHERE entry_id IN (${placeholders})
      ORDER BY entry_id ASC, sort_order ASC;`,
    entryIds,
  );
  const photosByEntry = new Map<string, JournalPhoto[]>();
  for (const p of photos) {
    const list = photosByEntry.get(p.entry_id) ?? [];
    list.push(rowToPhoto(p));
    photosByEntry.set(p.entry_id, list);
  }
  return entries.map((e) => ({
    ...rowToEntry(e),
    photos: photosByEntry.get(e.id) ?? [],
  }));
}

export async function createEntry(input: {
  tripId: string;
  userId: string;
  occurredAt: string;
  caption: string | null;
  isPrivate: boolean;
  photos: Array<{
    localUri: string;
    sortOrder: number;
    exifTakenAt: string | null;
  }>;
}): Promise<JournalPhotoEntryWithPhotos> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const entryId = Crypto.randomUUID();
  const entry: JournalPhotoEntry = {
    id: entryId,
    tripId: input.tripId,
    userId: input.userId,
    occurredAt: input.occurredAt,
    caption: input.caption,
    isPrivate: input.isPrivate,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const photos: JournalPhoto[] = input.photos.map((p) => ({
    id: Crypto.randomUUID(),
    entryId,
    storagePath: '',                 // filled after R2 upload
    localUri: p.localUri,
    sortOrder: p.sortOrder,
    exifTakenAt: p.exifTakenAt,
    createdAt: now,
  }));

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO journal_photo_entries
         (id, trip_id, user_id, occurred_at, caption, is_private,
          created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
      [
        entry.id, entry.tripId, entry.userId, entry.occurredAt,
        entry.caption, entry.isPrivate ? 1 : 0,
        entry.createdAt, entry.updatedAt,
      ],
    );
    await enqueueSync(db, 'journal_photo_entries', entry.id, 'create', entryToPayload(entry));

    for (const p of photos) {
      await db.runAsync(
        `INSERT INTO journal_photos
           (id, entry_id, storage_path, local_uri, sort_order, exif_taken_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [p.id, p.entryId, p.storagePath, p.localUri, p.sortOrder, p.exifTakenAt, p.createdAt],
      );
      await enqueueSync(db, 'journal_photos', p.id, 'create', photoToPayload(p));
    }
  });

  return { ...entry, photos };
}

export async function updateEntryCaption(
  entryId: string,
  caption: string | null,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE journal_photo_entries SET caption = ?, updated_at = ? WHERE id = ?;',
      [caption, updatedAt, entryId],
    );
    await enqueueSync(db, 'journal_photo_entries', entryId, 'update', {
      id: entryId,
      caption,
      updated_at: updatedAt,
    });
  });
}

export async function updateEntryOccurredAt(
  entryId: string,
  occurredAtISO: string,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE journal_photo_entries SET occurred_at = ?, updated_at = ? WHERE id = ?;',
      [occurredAtISO, updatedAt, entryId],
    );
    await enqueueSync(db, 'journal_photo_entries', entryId, 'update', {
      id: entryId,
      occurred_at: occurredAtISO,
      updated_at: updatedAt,
    });
  });
}

export async function updateEntryPrivacy(
  entryId: string,
  isPrivate: boolean,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE journal_photo_entries SET is_private = ?, updated_at = ? WHERE id = ?;',
      [isPrivate ? 1 : 0, updatedAt, entryId],
    );
    await enqueueSync(db, 'journal_photo_entries', entryId, 'update', {
      id: entryId,
      is_private: isPrivate ? 1 : 0,
      updated_at: updatedAt,
    });
  });
}

export async function softDeleteEntry(entryId: string): Promise<void> {
  const db = await getDatabase();
  const ts = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE journal_photo_entries SET deleted_at = ?, updated_at = ? WHERE id = ?;',
      [ts, ts, entryId],
    );
    await enqueueSync(db, 'journal_photo_entries', entryId, 'delete', {
      id: entryId,
      deleted_at: ts,
      updated_at: ts,
    });
  });
}

export async function countPhotosForTripDay(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM journal_photo_entries
      WHERE trip_id = ?
        AND SUBSTR(occurred_at, 1, 10) = ?
        AND deleted_at IS NULL
        AND (is_private = 0 OR user_id = ?);`,
    [tripId, dayDateISO, currentUserId],
  );
  return row?.c ?? 0;
}

export async function firstPhotoStoragePathForDay(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ storage_path: string }>(
    `SELECT jp.storage_path
       FROM journal_photo_entries jpe
       JOIN journal_photos jp ON jp.entry_id = jpe.id
      WHERE jpe.trip_id = ?
        AND SUBSTR(jpe.occurred_at, 1, 10) = ?
        AND jpe.deleted_at IS NULL
        AND (jpe.is_private = 0 OR jpe.user_id = ?)
      ORDER BY jpe.occurred_at ASC, jp.sort_order ASC
      LIMIT 1;`,
    [tripId, dayDateISO, currentUserId],
  );
  return row?.storage_path ?? null;
}

const _check: JournalPhotoEntriesQueries = {
  listEntriesForDay,
  createEntry,
  updateEntryCaption,
  updateEntryOccurredAt,
  updateEntryPrivacy,
  softDeleteEntry,
  countPhotosForTripDay,
  firstPhotoStoragePathForDay,
};
void _check;
```

- [ ] **Step 4: Create the web stub**

Create `src/db/queries/journalPhotoEntries.web.ts`:

```ts
// Web variant — talks to Postgres directly (no local SQLite). Most read
// functions issue a Supabase query; mutations go through the same client
// (sync_queue is native-only).

import * as Crypto from 'expo-crypto';

import { supabase } from '@/services/supabase';
import type {
  JournalPhoto,
  JournalPhotoEntry,
  JournalPhotoEntryWithPhotos,
} from '@/types/journal';

import type { JournalPhotoEntriesQueries } from './contract';

function rowToEntry(r: Record<string, unknown>): JournalPhotoEntry {
  return {
    id: String(r.id),
    tripId: String(r.trip_id),
    userId: String(r.user_id),
    occurredAt: String(r.occurred_at),
    caption: r.caption == null ? null : String(r.caption),
    isPrivate: Boolean(r.is_private),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: r.deleted_at == null ? null : String(r.deleted_at),
  };
}

function rowToPhoto(r: Record<string, unknown>): JournalPhoto {
  return {
    id: String(r.id),
    entryId: String(r.entry_id),
    storagePath: String(r.storage_path ?? ''),
    localUri: null,
    sortOrder: Number(r.sort_order ?? 0),
    exifTakenAt: r.exif_taken_at == null ? null : String(r.exif_taken_at),
    createdAt: String(r.created_at),
  };
}

export async function listEntriesForDay(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<JournalPhotoEntryWithPhotos[]> {
  // Postgres-side: occurred_at::date = $dayDate AND (NOT is_private OR user_id = me)
  const start = `${dayDateISO}T00:00:00Z`;
  const end = `${dayDateISO}T23:59:59.999Z`;
  const { data: entries, error } = await supabase
    .from('journal_photo_entries')
    .select('*, journal_photos(*)')
    .eq('trip_id', tripId)
    .gte('occurred_at', start)
    .lte('occurred_at', end)
    .is('deleted_at', null)
    .or(`is_private.eq.false,user_id.eq.${currentUserId}`)
    .order('occurred_at', { ascending: true });
  if (error) throw error;
  return (entries ?? []).map((row) => {
    const photos = ((row as { journal_photos?: Record<string, unknown>[] }).journal_photos ?? [])
      .map(rowToPhoto)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return { ...rowToEntry(row), photos };
  });
}

export async function createEntry(input: {
  tripId: string;
  userId: string;
  occurredAt: string;
  caption: string | null;
  isPrivate: boolean;
  photos: Array<{
    localUri: string;
    sortOrder: number;
    exifTakenAt: string | null;
  }>;
}): Promise<JournalPhotoEntryWithPhotos> {
  const entryId = Crypto.randomUUID();
  const now = new Date().toISOString();
  const { data: entry, error } = await supabase
    .from('journal_photo_entries')
    .insert({
      id: entryId,
      trip_id: input.tripId,
      user_id: input.userId,
      occurred_at: input.occurredAt,
      caption: input.caption,
      is_private: input.isPrivate,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (error) throw error;
  // On web we have no local file to upload; if the caller passed photo refs
  // they must already be uploadable URLs — but realistically the journal
  // capture flow on web is out of scope today. Return an empty photos list.
  return { ...rowToEntry(entry), photos: [] };
}

export async function updateEntryCaption(
  entryId: string,
  caption: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('journal_photo_entries')
    .update({ caption })
    .eq('id', entryId);
  if (error) throw error;
}

export async function updateEntryOccurredAt(
  entryId: string,
  occurredAtISO: string,
): Promise<void> {
  const { error } = await supabase
    .from('journal_photo_entries')
    .update({ occurred_at: occurredAtISO })
    .eq('id', entryId);
  if (error) throw error;
}

export async function updateEntryPrivacy(entryId: string, isPrivate: boolean): Promise<void> {
  const { error } = await supabase
    .from('journal_photo_entries')
    .update({ is_private: isPrivate })
    .eq('id', entryId);
  if (error) throw error;
}

export async function softDeleteEntry(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('journal_photo_entries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', entryId);
  if (error) throw error;
}

export async function countPhotosForTripDay(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<number> {
  const start = `${dayDateISO}T00:00:00Z`;
  const end = `${dayDateISO}T23:59:59.999Z`;
  const { count, error } = await supabase
    .from('journal_photo_entries')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .gte('occurred_at', start)
    .lte('occurred_at', end)
    .is('deleted_at', null)
    .or(`is_private.eq.false,user_id.eq.${currentUserId}`);
  if (error) throw error;
  return count ?? 0;
}

export async function firstPhotoStoragePathForDay(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<string | null> {
  const list = await listEntriesForDay(tripId, dayDateISO, currentUserId);
  for (const entry of list) {
    if (entry.photos.length > 0) return entry.photos[0].storagePath;
  }
  return null;
}

const _check: JournalPhotoEntriesQueries = {
  listEntriesForDay,
  createEntry,
  updateEntryCaption,
  updateEntryOccurredAt,
  updateEntryPrivacy,
  softDeleteEntry,
  countPhotosForTripDay,
  firstPhotoStoragePathForDay,
};
void _check;
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors limited to the still-missing `voiceClips.*.ts`, `journalDays.*.ts`, and `journalPhotos.*.ts` files (the next 3 sub-tasks). Photo entries should compile cleanly.

- [ ] **Step 6: Commit**

`/commit-commands:commit`:

```
journalPhotoEntries query module (native + web)

Day-scoped read with photo children, create (entry + N photos in one tx
with sync_queue entries), caption/occurred_at/privacy updates, soft delete.
Includes helpers used by the sync engine (getPhotoById, setPhotoStoragePath)
and the chapter-view aggregate (countPhotosForTripDay,
firstPhotoStoragePathForDay).
```

#### 1.7c — journalPhotos child queries

Photo file children get a tiny module — most logic lives in `journalPhotoEntries.ts`.

- [ ] **Step 7: Create `src/db/queries/journalPhotos.native.ts`**

```ts
// Children of journal_photo_entries. Used by the sync engine's upload step.

import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import type { JournalPhoto, JournalPhotoRow } from '@/types/journal';

function rowToPhoto(r: JournalPhotoRow): JournalPhoto {
  return {
    id: r.id,
    entryId: r.entry_id,
    storagePath: r.storage_path,
    localUri: r.local_uri,
    sortOrder: r.sort_order,
    exifTakenAt: r.exif_taken_at,
    createdAt: r.created_at,
  };
}

export async function getPhotoById(
  db: SQLiteDatabase,
  id: string,
): Promise<JournalPhoto | null> {
  const row = await db.getFirstAsync<JournalPhotoRow>(
    'SELECT * FROM journal_photos WHERE id = ?;',
    [id],
  );
  return row ? rowToPhoto(row) : null;
}

export async function setPhotoStoragePath(
  db: SQLiteDatabase,
  id: string,
  storagePath: string,
): Promise<void> {
  await db.runAsync(
    'UPDATE journal_photos SET storage_path = ? WHERE id = ?;',
    [storagePath, id],
  );
}

export async function listPhotosForEntry(entryId: string): Promise<JournalPhoto[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<JournalPhotoRow>(
    'SELECT * FROM journal_photos WHERE entry_id = ? ORDER BY sort_order ASC;',
    [entryId],
  );
  return rows.map(rowToPhoto);
}

// Used when a photo entry is soft-deleted: get every R2 key + local file
// path so the upstream caller can request server-side R2 deletes and best-
// effort local cleanup.
export async function listPhotoArtifactsForEntry(
  entryId: string,
): Promise<Array<{ id: string; storagePath: string; localUri: string | null }>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    storage_path: string;
    local_uri: string | null;
  }>(
    'SELECT id, storage_path, local_uri FROM journal_photos WHERE entry_id = ?;',
    [entryId],
  );
  return rows.map((r) => ({ id: r.id, storagePath: r.storage_path, localUri: r.local_uri }));
}
```

- [ ] **Step 8: Create `src/db/queries/journalPhotos.web.ts`**

```ts
// Web variant — passthrough to Supabase for the read helpers used by web UI.
// The sync-engine-only helpers (getPhotoById, setPhotoStoragePath) are
// native-only — they take a SQLiteDatabase, which doesn't exist on web.

import { supabase } from '@/services/supabase';
import type { JournalPhoto } from '@/types/journal';

function rowToPhoto(r: Record<string, unknown>): JournalPhoto {
  return {
    id: String(r.id),
    entryId: String(r.entry_id),
    storagePath: String(r.storage_path ?? ''),
    localUri: null,
    sortOrder: Number(r.sort_order ?? 0),
    exifTakenAt: r.exif_taken_at == null ? null : String(r.exif_taken_at),
    createdAt: String(r.created_at),
  };
}

export async function listPhotosForEntry(entryId: string): Promise<JournalPhoto[]> {
  const { data, error } = await supabase
    .from('journal_photos')
    .select('*')
    .eq('entry_id', entryId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToPhoto);
}

export async function listPhotoArtifactsForEntry(
  entryId: string,
): Promise<Array<{ id: string; storagePath: string; localUri: string | null }>> {
  const { data, error } = await supabase
    .from('journal_photos')
    .select('id, storage_path')
    .eq('entry_id', entryId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String((r as Record<string, unknown>).id),
    storagePath: String((r as Record<string, unknown>).storage_path ?? ''),
    localUri: null,
  }));
}
```

- [ ] **Step 9: Commit**

`/commit-commands:commit`:

```
journalPhotos child query module (native + web)

Tiny helper module for the photo file children. Native exports
getPhotoById/setPhotoStoragePath for the sync engine's upload step;
both variants export listPhotosForEntry and listPhotoArtifactsForEntry
(used when soft-deleting a parent entry to clean up R2 objects).
```

#### 1.7d — voiceClips query module

- [ ] **Step 10: Create `src/db/queries/voiceClips.native.ts`**

```ts
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import type { VoiceClip, VoiceClipRow } from '@/types/voice';

import type { VoiceClipsQueries } from './contract';
import { enqueueSync } from './syncQueue';

function rowToClip(r: VoiceClipRow): VoiceClip {
  return {
    id: r.id,
    tripId: r.trip_id,
    userId: r.user_id,
    occurredAt: r.occurred_at,
    storagePath: r.storage_path,
    localUri: r.local_uri,
    durationSec: r.duration_sec,
    transcript: r.transcript,
    transcriptStatus: r.transcript_status,
    transcriptError: r.transcript_error,
    isPrivate: r.is_private === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

export function clipToPayload(c: VoiceClip): Record<string, unknown> {
  return {
    id: c.id,
    trip_id: c.tripId,
    user_id: c.userId,
    occurred_at: c.occurredAt,
    storage_path: c.storagePath,
    local_uri: c.localUri,
    duration_sec: c.durationSec,
    transcript: c.transcript,
    transcript_status: c.transcriptStatus,
    transcript_error: c.transcriptError,
    is_private: c.isPrivate ? 1 : 0,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt,
  };
}

export async function getClipById(
  db: SQLiteDatabase,
  id: string,
): Promise<VoiceClip | null> {
  const row = await db.getFirstAsync<VoiceClipRow>(
    'SELECT * FROM voice_clips WHERE id = ?;',
    [id],
  );
  return row ? rowToClip(row) : null;
}

export async function setClipStoragePath(
  db: SQLiteDatabase,
  id: string,
  storagePath: string,
): Promise<void> {
  await db.runAsync(
    'UPDATE voice_clips SET storage_path = ? WHERE id = ?;',
    [storagePath, id],
  );
}

export async function listClipsForDay(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<VoiceClip[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<VoiceClipRow>(
    `SELECT * FROM voice_clips
      WHERE trip_id = ?
        AND SUBSTR(occurred_at, 1, 10) = ?
        AND deleted_at IS NULL
        AND (is_private = 0 OR user_id = ?)
      ORDER BY occurred_at ASC;`,
    [tripId, dayDateISO, currentUserId],
  );
  return rows.map(rowToClip);
}

export async function createClip(input: {
  tripId: string;
  userId: string;
  occurredAt: string;
  localUri: string;
  durationSec: number;
  isPrivate: boolean;
}): Promise<VoiceClip> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const clip: VoiceClip = {
    id: Crypto.randomUUID(),
    tripId: input.tripId,
    userId: input.userId,
    occurredAt: input.occurredAt,
    storagePath: '',
    localUri: input.localUri,
    durationSec: input.durationSec,
    transcript: null,
    transcriptStatus: 'pending',
    transcriptError: null,
    isPrivate: input.isPrivate,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO voice_clips
         (id, trip_id, user_id, occurred_at, storage_path, local_uri,
          duration_sec, transcript, transcript_status, transcript_error,
          is_private, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'pending', NULL, ?, ?, ?, NULL);`,
      [
        clip.id, clip.tripId, clip.userId, clip.occurredAt,
        clip.storagePath, clip.localUri, clip.durationSec,
        clip.isPrivate ? 1 : 0, clip.createdAt, clip.updatedAt,
      ],
    );
    await enqueueSync(db, 'voice_clips', clip.id, 'create', clipToPayload(clip));
  });
  return clip;
}

export async function updateClipTranscript(
  clipId: string,
  transcript: string | null,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE voice_clips SET transcript = ?, updated_at = ? WHERE id = ?;',
      [transcript, updatedAt, clipId],
    );
    await enqueueSync(db, 'voice_clips', clipId, 'update', {
      id: clipId,
      transcript,
      updated_at: updatedAt,
    });
  });
}

export async function updateClipOccurredAt(
  clipId: string,
  occurredAtISO: string,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE voice_clips SET occurred_at = ?, updated_at = ? WHERE id = ?;',
      [occurredAtISO, updatedAt, clipId],
    );
    await enqueueSync(db, 'voice_clips', clipId, 'update', {
      id: clipId,
      occurred_at: occurredAtISO,
      updated_at: updatedAt,
    });
  });
}

export async function updateClipPrivacy(
  clipId: string,
  isPrivate: boolean,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE voice_clips SET is_private = ?, updated_at = ? WHERE id = ?;',
      [isPrivate ? 1 : 0, updatedAt, clipId],
    );
    await enqueueSync(db, 'voice_clips', clipId, 'update', {
      id: clipId,
      is_private: isPrivate ? 1 : 0,
      updated_at: updatedAt,
    });
  });
}

export async function softDeleteClip(clipId: string): Promise<void> {
  const db = await getDatabase();
  const ts = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE voice_clips SET deleted_at = ?, updated_at = ? WHERE id = ?;',
      [ts, ts, clipId],
    );
    await enqueueSync(db, 'voice_clips', clipId, 'delete', {
      id: clipId,
      deleted_at: ts,
      updated_at: ts,
    });
  });
}

export async function countClipsForTripDay(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM voice_clips
      WHERE trip_id = ?
        AND SUBSTR(occurred_at, 1, 10) = ?
        AND deleted_at IS NULL
        AND (is_private = 0 OR user_id = ?);`,
    [tripId, dayDateISO, currentUserId],
  );
  return row?.c ?? 0;
}

const _check: VoiceClipsQueries = {
  listClipsForDay,
  createClip,
  updateClipTranscript,
  updateClipOccurredAt,
  updateClipPrivacy,
  softDeleteClip,
  countClipsForTripDay,
};
void _check;
```

- [ ] **Step 11: Create `src/db/queries/voiceClips.web.ts`**

```ts
import * as Crypto from 'expo-crypto';

import { supabase } from '@/services/supabase';
import type { TranscriptStatus, VoiceClip } from '@/types/voice';

import type { VoiceClipsQueries } from './contract';

function rowToClip(r: Record<string, unknown>): VoiceClip {
  return {
    id: String(r.id),
    tripId: String(r.trip_id),
    userId: String(r.user_id),
    occurredAt: String(r.occurred_at),
    storagePath: String(r.storage_path ?? ''),
    localUri: null,
    durationSec: Number(r.duration_sec ?? 0),
    transcript: r.transcript == null ? null : String(r.transcript),
    transcriptStatus: (r.transcript_status ?? 'pending') as TranscriptStatus,
    transcriptError: r.transcript_error == null ? null : String(r.transcript_error),
    isPrivate: Boolean(r.is_private),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: r.deleted_at == null ? null : String(r.deleted_at),
  };
}

export async function listClipsForDay(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<VoiceClip[]> {
  const start = `${dayDateISO}T00:00:00Z`;
  const end = `${dayDateISO}T23:59:59.999Z`;
  const { data, error } = await supabase
    .from('voice_clips')
    .select('*')
    .eq('trip_id', tripId)
    .gte('occurred_at', start)
    .lte('occurred_at', end)
    .is('deleted_at', null)
    .or(`is_private.eq.false,user_id.eq.${currentUserId}`)
    .order('occurred_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToClip);
}

export async function createClip(input: {
  tripId: string;
  userId: string;
  occurredAt: string;
  localUri: string;
  durationSec: number;
  isPrivate: boolean;
}): Promise<VoiceClip> {
  const id = Crypto.randomUUID();
  const { data, error } = await supabase
    .from('voice_clips')
    .insert({
      id,
      trip_id: input.tripId,
      user_id: input.userId,
      occurred_at: input.occurredAt,
      storage_path: '',
      duration_sec: input.durationSec,
      is_private: input.isPrivate,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToClip(data);
}

export async function updateClipTranscript(
  clipId: string,
  transcript: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('voice_clips')
    .update({ transcript })
    .eq('id', clipId);
  if (error) throw error;
}

export async function updateClipOccurredAt(
  clipId: string,
  occurredAtISO: string,
): Promise<void> {
  const { error } = await supabase
    .from('voice_clips')
    .update({ occurred_at: occurredAtISO })
    .eq('id', clipId);
  if (error) throw error;
}

export async function updateClipPrivacy(
  clipId: string,
  isPrivate: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('voice_clips')
    .update({ is_private: isPrivate })
    .eq('id', clipId);
  if (error) throw error;
}

export async function softDeleteClip(clipId: string): Promise<void> {
  const { error } = await supabase
    .from('voice_clips')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', clipId);
  if (error) throw error;
}

export async function countClipsForTripDay(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<number> {
  const start = `${dayDateISO}T00:00:00Z`;
  const end = `${dayDateISO}T23:59:59.999Z`;
  const { count, error } = await supabase
    .from('voice_clips')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .gte('occurred_at', start)
    .lte('occurred_at', end)
    .is('deleted_at', null)
    .or(`is_private.eq.false,user_id.eq.${currentUserId}`);
  if (error) throw error;
  return count ?? 0;
}

const _check: VoiceClipsQueries = {
  listClipsForDay,
  createClip,
  updateClipTranscript,
  updateClipOccurredAt,
  updateClipPrivacy,
  softDeleteClip,
  countClipsForTripDay,
};
void _check;
```

- [ ] **Step 12: Commit**

`/commit-commands:commit`:

```
voiceClips query module (native + web)

CRUD + day-scoped read with the same is_private filter pattern as expenses.
Native variant transactional + sync_queue; web variant talks to Postgres
directly. createClip initializes transcript_status='pending'; the
transcribe-voice Edge Function flips it to 'done' once Whisper returns.
```

#### 1.7e — journalDays query module

- [ ] **Step 13: Create `src/db/queries/journalDays.native.ts`**

```ts
import * as Crypto from 'expo-crypto';

import { getDatabase } from '@/db/database';
import type {
  DaySummary,
  JournalDay,
  JournalDayRow,
} from '@/types/journal';

import type { JournalDaysQueries } from './contract';
import { enqueueSync } from './syncQueue';

function rowToDay(r: JournalDayRow): JournalDay {
  return {
    id: r.id,
    tripId: r.trip_id,
    dayDate: r.day_date,
    location: r.location,
    coverPhotoEntryId: r.cover_photo_entry_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

export function dayToPayload(d: JournalDay): Record<string, unknown> {
  return {
    id: d.id,
    trip_id: d.tripId,
    day_date: d.dayDate,
    location: d.location,
    cover_photo_entry_id: d.coverPhotoEntryId,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
    deleted_at: d.deletedAt,
  };
}

export async function getDayMetadata(
  tripId: string,
  dayDateISO: string,
): Promise<JournalDay | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<JournalDayRow>(
    `SELECT * FROM journal_days
      WHERE trip_id = ? AND day_date = ? AND deleted_at IS NULL;`,
    [tripId, dayDateISO],
  );
  return row ? rowToDay(row) : null;
}

// Upsert: create the row if it's missing, otherwise update the location.
async function upsertDay(
  tripId: string,
  dayDateISO: string,
  update: { location?: string | null; coverPhotoEntryId?: string | null },
): Promise<JournalDay> {
  const db = await getDatabase();
  const existing = await getDayMetadata(tripId, dayDateISO);
  const now = new Date().toISOString();
  if (existing) {
    const merged: JournalDay = {
      ...existing,
      location: update.location !== undefined ? update.location : existing.location,
      coverPhotoEntryId:
        update.coverPhotoEntryId !== undefined
          ? update.coverPhotoEntryId
          : existing.coverPhotoEntryId,
      updatedAt: now,
    };
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE journal_days
           SET location = ?, cover_photo_entry_id = ?, updated_at = ?
         WHERE id = ?;`,
        [merged.location, merged.coverPhotoEntryId, merged.updatedAt, merged.id],
      );
      await enqueueSync(db, 'journal_days', merged.id, 'update', dayToPayload(merged));
    });
    return merged;
  }
  const created: JournalDay = {
    id: Crypto.randomUUID(),
    tripId,
    dayDate: dayDateISO,
    location: update.location ?? null,
    coverPhotoEntryId: update.coverPhotoEntryId ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO journal_days
         (id, trip_id, day_date, location, cover_photo_entry_id,
          created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL);`,
      [
        created.id, created.tripId, created.dayDate, created.location,
        created.coverPhotoEntryId, created.createdAt, created.updatedAt,
      ],
    );
    await enqueueSync(db, 'journal_days', created.id, 'create', dayToPayload(created));
  });
  return created;
}

export async function setLocation(
  tripId: string,
  dayDateISO: string,
  location: string | null,
): Promise<JournalDay> {
  return upsertDay(tripId, dayDateISO, { location });
}

export async function setCoverPhotoEntry(
  tripId: string,
  dayDateISO: string,
  entryId: string | null,
): Promise<JournalDay> {
  return upsertDay(tripId, dayDateISO, { coverPhotoEntryId: entryId });
}

// Build the chapter-view aggregate. One SQL roundtrip via UNIONed CTEs.
//
//  - days_in_trip: every date between trips.start_date and the trip end
//    (today if ongoing, else end_date).
//  - per_day counts come from filtered subqueries (photos / voice / expenses).
//  - hero photo path: cover override if set, else first photo of the day.
//  - effective location: journal_days.location override if set, else most-
//    frequent expense place_name (tie-broken by alphabetical to keep stable).
export async function listDaySummaries(
  tripId: string,
  currentUserId: string,
): Promise<DaySummary[]> {
  const db = await getDatabase();
  const trip = await db.getFirstAsync<{ start_date: string; end_date: string | null }>(
    'SELECT start_date, end_date FROM trips WHERE id = ?;',
    [tripId],
  );
  if (!trip) return [];

  // The CTE below uses SQLite's recursive CTE to generate one row per date
  // from trip.start_date through min(today, trip.end_date) (or today if
  // end_date is null, capped at start_date + 365 days as a safety net).
  const rows = await db.getAllAsync<{
    day_date: string;
    photo_count: number;
    voice_count: number;
    expense_count: number;
    total_converted_amount: number;
    cover_storage_path: string | null;
    override_location: string | null;
    inferred_location: string | null;
  }>(
    `
    WITH RECURSIVE
      params(start_date, end_date) AS (
        SELECT
          ?,
          COALESCE(?, date('now', 'localtime'))
      ),
      days(day_date) AS (
        SELECT start_date FROM params
        UNION ALL
        SELECT date(day_date, '+1 day') FROM days
         WHERE day_date < (SELECT end_date FROM params)
           AND day_date < date((SELECT start_date FROM params), '+365 day')
      )
    SELECT
      d.day_date,
      (SELECT COUNT(*) FROM journal_photo_entries e
         WHERE e.trip_id = ? AND e.deleted_at IS NULL
           AND SUBSTR(e.occurred_at, 1, 10) = d.day_date
           AND (e.is_private = 0 OR e.user_id = ?)) AS photo_count,
      (SELECT COUNT(*) FROM voice_clips v
         WHERE v.trip_id = ? AND v.deleted_at IS NULL
           AND SUBSTR(v.occurred_at, 1, 10) = d.day_date
           AND (v.is_private = 0 OR v.user_id = ?)) AS voice_count,
      (SELECT COUNT(*) FROM expenses x
         WHERE x.trip_id = ? AND x.deleted_at IS NULL
           AND x.expense_date = d.day_date
           AND (x.is_private = 0 OR x.user_id = ?)) AS expense_count,
      (SELECT COALESCE(SUM(x.converted_amount), 0) FROM expenses x
         WHERE x.trip_id = ? AND x.deleted_at IS NULL
           AND x.expense_date = d.day_date
           AND x.is_excluded_from_daily_metrics = 0
           AND (x.is_private = 0 OR x.user_id = ?)) AS total_converted_amount,
      COALESCE(
        (SELECT jp.storage_path
           FROM journal_days jd
           JOIN journal_photo_entries cov ON cov.id = jd.cover_photo_entry_id
           JOIN journal_photos jp ON jp.entry_id = cov.id
          WHERE jd.trip_id = ? AND jd.day_date = d.day_date AND jd.deleted_at IS NULL
          ORDER BY jp.sort_order ASC
          LIMIT 1),
        (SELECT jp.storage_path
           FROM journal_photo_entries e
           JOIN journal_photos jp ON jp.entry_id = e.id
          WHERE e.trip_id = ? AND e.deleted_at IS NULL
            AND SUBSTR(e.occurred_at, 1, 10) = d.day_date
            AND (e.is_private = 0 OR e.user_id = ?)
          ORDER BY e.occurred_at ASC, jp.sort_order ASC
          LIMIT 1)
      ) AS cover_storage_path,
      (SELECT jd.location FROM journal_days jd
         WHERE jd.trip_id = ? AND jd.day_date = d.day_date AND jd.deleted_at IS NULL) AS override_location,
      (SELECT x.place_name FROM expenses x
         WHERE x.trip_id = ? AND x.deleted_at IS NULL
           AND x.expense_date = d.day_date
           AND x.place_name IS NOT NULL
           AND (x.is_private = 0 OR x.user_id = ?)
         GROUP BY x.place_name
         ORDER BY COUNT(*) DESC, x.place_name ASC
         LIMIT 1) AS inferred_location
    FROM days d
    ORDER BY d.day_date DESC;
    `,
    [
      trip.start_date,
      trip.end_date,
      tripId, currentUserId,             // photo_count
      tripId, currentUserId,             // voice_count
      tripId, currentUserId,             // expense_count
      tripId, currentUserId,             // total
      tripId,                            // cover override
      tripId, currentUserId,             // cover fallback
      tripId,                            // override_location
      tripId, currentUserId,             // inferred_location
    ],
  );

  const startDate = trip.start_date;
  return rows.map((r) => {
    const dayIndex =
      Math.floor((Date.parse(r.day_date) - Date.parse(startDate)) / 86_400_000) + 1;
    return {
      dayDate: r.day_date,
      dayIndex: Math.max(1, dayIndex),
      photoCount: r.photo_count,
      voiceCount: r.voice_count,
      expenseCount: r.expense_count,
      totalConvertedAmount: r.total_converted_amount,
      coverStoragePath: r.cover_storage_path,
      effectiveLocation: r.override_location ?? r.inferred_location,
    };
  });
}

const _check: JournalDaysQueries = {
  getDayMetadata,
  setLocation,
  setCoverPhotoEntry,
  listDaySummaries,
};
void _check;
```

- [ ] **Step 14: Create `src/db/queries/journalDays.web.ts`**

```ts
// Web variant — Postgres-side equivalent of the SQLite recursive CTE in the
// native version. We pull the parent trip, build the date range in JS, and
// fan out simple count queries.

import * as Crypto from 'expo-crypto';

import { supabase } from '@/services/supabase';
import type { DaySummary, JournalDay } from '@/types/journal';

import type { JournalDaysQueries } from './contract';

function rowToDay(r: Record<string, unknown>): JournalDay {
  return {
    id: String(r.id),
    tripId: String(r.trip_id),
    dayDate: String(r.day_date),
    location: r.location == null ? null : String(r.location),
    coverPhotoEntryId:
      r.cover_photo_entry_id == null ? null : String(r.cover_photo_entry_id),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: r.deleted_at == null ? null : String(r.deleted_at),
  };
}

export async function getDayMetadata(
  tripId: string,
  dayDateISO: string,
): Promise<JournalDay | null> {
  const { data, error } = await supabase
    .from('journal_days')
    .select('*')
    .eq('trip_id', tripId)
    .eq('day_date', dayDateISO)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToDay(data) : null;
}

async function upsertDay(
  tripId: string,
  dayDateISO: string,
  patch: { location?: string | null; cover_photo_entry_id?: string | null },
): Promise<JournalDay> {
  const existing = await getDayMetadata(tripId, dayDateISO);
  if (existing) {
    const { data, error } = await supabase
      .from('journal_days')
      .update(patch)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return rowToDay(data);
  }
  const { data, error } = await supabase
    .from('journal_days')
    .insert({
      id: Crypto.randomUUID(),
      trip_id: tripId,
      day_date: dayDateISO,
      ...patch,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToDay(data);
}

export async function setLocation(
  tripId: string,
  dayDateISO: string,
  location: string | null,
): Promise<JournalDay> {
  return upsertDay(tripId, dayDateISO, { location });
}

export async function setCoverPhotoEntry(
  tripId: string,
  dayDateISO: string,
  entryId: string | null,
): Promise<JournalDay> {
  return upsertDay(tripId, dayDateISO, { cover_photo_entry_id: entryId });
}

export async function listDaySummaries(
  tripId: string,
  currentUserId: string,
): Promise<DaySummary[]> {
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('start_date, end_date')
    .eq('id', tripId)
    .single();
  if (tripErr) throw tripErr;
  if (!trip) return [];

  const endDate = trip.end_date ?? new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  const start = new Date(`${trip.start_date}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  for (
    let d = start;
    d.getTime() <= end.getTime() && dates.length < 366;
    d = new Date(d.getTime() + 86_400_000)
  ) {
    dates.push(d.toISOString().slice(0, 10));
  }

  // For each day, run 4 small queries. Acceptable on web — fewer rows than
  // native (no offline cache), and the chapter view is not opened often.
  const summaries: DaySummary[] = [];
  for (const day of dates.reverse()) {
    const start = `${day}T00:00:00Z`;
    const end = `${day}T23:59:59.999Z`;

    const [{ count: photoCount }, { count: voiceCount }, { count: expenseCount }, totals, override, inferred, coverPath] =
      await Promise.all([
        supabase.from('journal_photo_entries').select('id', { count: 'exact', head: true })
          .eq('trip_id', tripId).gte('occurred_at', start).lte('occurred_at', end)
          .is('deleted_at', null).or(`is_private.eq.false,user_id.eq.${currentUserId}`),
        supabase.from('voice_clips').select('id', { count: 'exact', head: true })
          .eq('trip_id', tripId).gte('occurred_at', start).lte('occurred_at', end)
          .is('deleted_at', null).or(`is_private.eq.false,user_id.eq.${currentUserId}`),
        supabase.from('expenses').select('id', { count: 'exact', head: true })
          .eq('trip_id', tripId).eq('expense_date', day)
          .is('deleted_at', null).or(`is_private.eq.false,user_id.eq.${currentUserId}`),
        supabase.from('expenses').select('converted_amount')
          .eq('trip_id', tripId).eq('expense_date', day)
          .is('deleted_at', null).eq('is_excluded_from_daily_metrics', false)
          .or(`is_private.eq.false,user_id.eq.${currentUserId}`),
        supabase.from('journal_days').select('location, cover_photo_entry_id')
          .eq('trip_id', tripId).eq('day_date', day).is('deleted_at', null).maybeSingle(),
        supabase.from('expenses').select('place_name')
          .eq('trip_id', tripId).eq('expense_date', day)
          .is('deleted_at', null).not('place_name', 'is', null)
          .or(`is_private.eq.false,user_id.eq.${currentUserId}`),
        supabase.from('journal_photo_entries').select('journal_photos(storage_path), occurred_at')
          .eq('trip_id', tripId).gte('occurred_at', start).lte('occurred_at', end)
          .is('deleted_at', null).or(`is_private.eq.false,user_id.eq.${currentUserId}`)
          .order('occurred_at', { ascending: true }).limit(1).maybeSingle(),
      ]);

    const totalConvertedAmount = (totals.data ?? []).reduce(
      (acc: number, row: { converted_amount: number }) => acc + (row.converted_amount ?? 0),
      0,
    );

    // Inferred location = most-frequent expense place_name for the day.
    const placeCounts = new Map<string, number>();
    for (const row of (inferred.data ?? []) as Array<{ place_name: string }>) {
      placeCounts.set(row.place_name, (placeCounts.get(row.place_name) ?? 0) + 1);
    }
    let inferredLocation: string | null = null;
    let bestCount = 0;
    for (const [place, count] of placeCounts) {
      if (count > bestCount || (count === bestCount && (inferredLocation === null || place < inferredLocation))) {
        bestCount = count;
        inferredLocation = place;
      }
    }

    const overrideLocation = override.data?.location ?? null;
    const coverEntryFirstPhoto =
      coverPath.data?.journal_photos?.[0]?.storage_path ?? null;

    const dayIndex =
      Math.floor((Date.parse(day) - Date.parse(trip.start_date)) / 86_400_000) + 1;

    summaries.push({
      dayDate: day,
      dayIndex: Math.max(1, dayIndex),
      photoCount: photoCount ?? 0,
      voiceCount: voiceCount ?? 0,
      expenseCount: expenseCount ?? 0,
      totalConvertedAmount,
      coverStoragePath: coverEntryFirstPhoto,
      effectiveLocation: overrideLocation ?? inferredLocation,
    });
  }

  return summaries;
}

const _check: JournalDaysQueries = {
  getDayMetadata,
  setLocation,
  setCoverPhotoEntry,
  listDaySummaries,
};
void _check;
```

- [ ] **Step 15: Type-check everything in Phase 1.7**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 16: Commit**

`/commit-commands:commit`:

```
journalDays query module + DaySummary aggregate (native + web)

Native variant uses a recursive CTE to generate one row per trip date plus
per-day count/total/cover/location subqueries — single SQLite roundtrip.
Web variant fans out per-day queries because cross-table CTE composition
isn't worth threading through PostgREST for a screen opened occasionally.
setLocation/setCoverPhotoEntry both upsert (creating the day row lazily).
```

---

### Task 1.8: Extend photoService for journal photos

**Files:**
- Modify: `src/services/photoService.native.ts`
- Modify: `src/services/photoService.web.ts`

- [ ] **Step 1: Generalize `uploadPhotoToStorage` in photoService.native.ts**

Find `uploadPhotoToStorage` (line ~103) and replace with the variant that accepts a `kind`:

```ts
type UploadArgs =
  | { kind: 'expense-photo'; tripId: string; expenseId: string; photoId: string; localUri: string }
  | { kind: 'journal-photo'; tripId: string; photoId: string; localUri: string };

// Upload a locally-persisted photo to R2 via a presigned PUT URL. Object key:
//   expense-photo:  <tripId>/<expenseId>/<photoId>.jpg
//   journal-photo:  <tripId>/journal/<photoId>.jpg
export async function uploadPhotoToStorage(args: UploadArgs): Promise<string> {
  const path =
    args.kind === 'expense-photo'
      ? `${args.tripId}/${args.expenseId}/${args.photoId}.jpg`
      : `${args.tripId}/journal/${args.photoId}.jpg`;

  let attempts = 0;
  let lastStatus = 0;
  while (attempts < 2) {
    attempts += 1;
    const { url } = await requestPresignedR2Url(args.kind, path, 'PUT');
    const res = await FileSystem.uploadAsync(url, args.localUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': 'image/jpeg' },
    });
    lastStatus = res.status;
    if (res.status >= 200 && res.status < 300) return path;
    if (res.status !== 403) break;
  }
  throw new Error(`R2 PUT failed with status ${lastStatus} after ${attempts} attempt(s)`);
}
```

And update `requestPresignedR2Url` to take a `kind`:

```ts
async function requestPresignedR2Url(
  kind: 'expense-photo' | 'journal-photo' | 'voice-clip',
  path: string,
  op: 'PUT' | 'GET',
): Promise<PresignedResponse> {
  const { data, error } = await supabase.functions.invoke<PresignedResponse>(
    'r2-media-url',
    { body: { kind, path, op } },
  );
  if (error) throw error;
  if (!data?.url) throw new Error('r2-media-url: empty response');
  return data;
}
```

`getSignedPhotoUrl` and `deletePhotoFromStorage` need a `kind` argument too. Replace them:

```ts
export async function getSignedPhotoUrl(
  storagePath: string,
  kind: 'expense-photo' | 'journal-photo' = 'expense-photo',
): Promise<string | null> {
  if (!storagePath) return null;
  const cached = signedCache.get(storagePath);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.url;
  try {
    const { url } = await requestPresignedR2Url(kind, storagePath, 'GET');
    signedCache.set(storagePath, { url, expiresAt: now + SIGNED_TTL_MS });
    return url;
  } catch (error) {
    console.warn('r2-media-url GET failed:', error);
    return null;
  }
}

export async function deletePhotoFromStorage(
  storagePath: string | null | undefined,
  kind: 'expense-photo' | 'journal-photo' = 'expense-photo',
): Promise<void> {
  if (!storagePath) return;
  signedCache.delete(storagePath);
  const { error } = await supabase.functions.invoke('r2-media-url', {
    body: { kind, path: storagePath, op: 'DELETE' },
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Mirror the same shape in photoService.web.ts**

Apply equivalent edits to the web variant. The structure is parallel; just wrap `fetch` calls instead of `FileSystem.uploadAsync`.

- [ ] **Step 3: Update existing call sites that don't pass a `kind`**

Search for callers:

```bash
npx grep -r "uploadPhotoToStorage" src app
npx grep -r "getSignedPhotoUrl" src app
npx grep -r "deletePhotoFromStorage" src app
```

For each call, add `kind: 'expense-photo'`. The defaults on `getSignedPhotoUrl` and `deletePhotoFromStorage` will keep existing calls building, but be explicit at call sites for clarity. The `uploadPhotoToStorage` ones MUST pass `kind` — its argument shape changed.

In particular, edit `src/sync/pushChanges.native.ts` (line ~87):

```ts
const storagePath = await uploadPhotoToStorage({
  kind: 'expense-photo',
  tripId,
  expenseId: photo.expenseId,
  photoId,
  localUri: photo.localUri,
});
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

`/commit-commands:commit`:

```
Generalize photoService to handle journal photos

uploadPhotoToStorage takes a kind discriminator with kind-specific path
construction; getSignedPhotoUrl/deletePhotoFromStorage take an optional
kind (defaulting to expense-photo for back-compat). All R2 traffic now
goes through r2-media-url.
```

---

### Task 1.9: voiceClipService — record + upload + signed-url cache

**Files:**
- Create: `src/services/voiceClipService.native.ts`
- Create: `src/services/voiceClipService.web.ts`
- Create: `src/services/voiceClipService.ts` (re-export alias matching the project pattern)

- [ ] **Step 1: Check package.json for expo-av**

```bash
npx grep "expo-av" package.json
```

Expected: a version like `"expo-av": "~14.x.x"`. If missing:
```bash
npx expo install expo-av
```

- [ ] **Step 2: Create voiceClipService.native.ts**

```ts
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';

import { supabase } from './supabase';

const CLIPS_DIR = `${FileSystem.documentDirectory}voice-clips/`;
const PRESIGN_TTL_MS = 50 * 60 * 1000;

// AAC/M4A — well-supported by expo-av, small at 64kbps.
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: false,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: '.m4a',
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 64000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CLIPS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CLIPS_DIR, { intermediates: true });
  }
}

// Caller manages the recording lifecycle. We don't keep state in this module —
// the screen owns the Audio.Recording instance.
export async function requestMicPermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

export async function createRecording(): Promise<Audio.Recording> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(RECORDING_OPTIONS);
  await recording.startAsync();
  return recording;
}

export interface FinishedRecording {
  localUri: string;
  durationSec: number;
}

export async function finishRecording(
  recording: Audio.Recording,
  clipId: string,
): Promise<FinishedRecording> {
  await recording.stopAndUnloadAsync();
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  const tempUri = recording.getURI();
  if (!tempUri) throw new Error('voiceClipService: recording produced no URI');
  await ensureDir();
  const targetUri = `${CLIPS_DIR}${clipId}.m4a`;
  await FileSystem.copyAsync({ from: tempUri, to: targetUri });
  const status = await recording.getStatusAsync();
  const durationSec = Math.max(1, Math.round(((status as { durationMillis?: number }).durationMillis ?? 0) / 1000));
  return { localUri: targetUri, durationSec };
}

// Upload + URL-cache plumbing — analogous to photoService's helpers but with
// kind:'voice-clip', a separate path shape, and audio/mp4 Content-Type.
interface PresignedResponse {
  url: string;
  expiresAt: string;
}

async function requestPresigned(
  path: string,
  op: 'PUT' | 'GET',
): Promise<PresignedResponse> {
  const { data, error } = await supabase.functions.invoke<PresignedResponse>(
    'r2-media-url',
    { body: { kind: 'voice-clip', path, op } },
  );
  if (error) throw error;
  if (!data?.url) throw new Error('r2-media-url: empty response');
  return data;
}

export async function uploadVoiceClipToStorage(args: {
  tripId: string;
  clipId: string;
  localUri: string;
}): Promise<string> {
  const path = `${args.tripId}/${args.clipId}.m4a`;
  let attempts = 0;
  let lastStatus = 0;
  while (attempts < 2) {
    attempts += 1;
    const { url } = await requestPresigned(path, 'PUT');
    const res = await FileSystem.uploadAsync(url, args.localUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': 'audio/mp4' },
    });
    lastStatus = res.status;
    if (res.status >= 200 && res.status < 300) return path;
    if (res.status !== 403) break;
  }
  throw new Error(`R2 PUT (voice-clip) failed with status ${lastStatus} after ${attempts} attempt(s)`);
}

const signedCache = new Map<string, { url: string; expiresAt: number }>();

export async function getSignedVoiceClipUrl(
  storagePath: string,
): Promise<string | null> {
  if (!storagePath) return null;
  const cached = signedCache.get(storagePath);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.url;
  try {
    const { url } = await requestPresigned(storagePath, 'GET');
    signedCache.set(storagePath, { url, expiresAt: now + PRESIGN_TTL_MS });
    return url;
  } catch (error) {
    console.warn('r2-media-url GET (voice-clip) failed:', error);
    return null;
  }
}

export async function deleteVoiceClipFromStorage(
  storagePath: string | null | undefined,
): Promise<void> {
  if (!storagePath) return;
  signedCache.delete(storagePath);
  const { error } = await supabase.functions.invoke('r2-media-url', {
    body: { kind: 'voice-clip', path: storagePath, op: 'DELETE' },
  });
  if (error) throw error;
}

export async function deleteLocalVoiceClip(localUri: string | null): Promise<void> {
  if (!localUri) return;
  if (!localUri.startsWith(CLIPS_DIR)) return;
  try {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
  } catch (error) {
    console.warn('deleteLocalVoiceClip failed:', error);
  }
}
```

- [ ] **Step 3: Create voiceClipService.web.ts**

The web variant uses the browser MediaRecorder. Recording UI on web is out of scope (the journal capture flow is native-only), but we still need the same `uploadVoiceClipToStorage` / `getSignedVoiceClipUrl` / `deleteVoiceClipFromStorage` exports so any future web playback works.

```ts
import { supabase } from './supabase';

const PRESIGN_TTL_MS = 50 * 60 * 1000;

interface PresignedResponse {
  url: string;
  expiresAt: string;
}

async function requestPresigned(
  path: string,
  op: 'PUT' | 'GET',
): Promise<PresignedResponse> {
  const { data, error } = await supabase.functions.invoke<PresignedResponse>(
    'r2-media-url',
    { body: { kind: 'voice-clip', path, op } },
  );
  if (error) throw error;
  if (!data?.url) throw new Error('r2-media-url: empty response');
  return data;
}

export async function uploadVoiceClipToStorage(args: {
  tripId: string;
  clipId: string;
  localUri: string;
}): Promise<string> {
  const path = `${args.tripId}/${args.clipId}.m4a`;
  const blob = await fetch(args.localUri).then((r) => r.blob());
  const { url } = await requestPresigned(path, 'PUT');
  const res = await fetch(url, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': 'audio/mp4' },
  });
  if (!(res.status >= 200 && res.status < 300)) {
    throw new Error(`R2 PUT (voice-clip) failed: ${res.status}`);
  }
  return path;
}

const signedCache = new Map<string, { url: string; expiresAt: number }>();

export async function getSignedVoiceClipUrl(
  storagePath: string,
): Promise<string | null> {
  if (!storagePath) return null;
  const cached = signedCache.get(storagePath);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.url;
  try {
    const { url } = await requestPresigned(storagePath, 'GET');
    signedCache.set(storagePath, { url, expiresAt: now + PRESIGN_TTL_MS });
    return url;
  } catch {
    return null;
  }
}

export async function deleteVoiceClipFromStorage(
  storagePath: string | null | undefined,
): Promise<void> {
  if (!storagePath) return;
  signedCache.delete(storagePath);
  const { error } = await supabase.functions.invoke('r2-media-url', {
    body: { kind: 'voice-clip', path: storagePath, op: 'DELETE' },
  });
  if (error) throw error;
}

// Web has no Expo FileSystem; deleteLocalVoiceClip is a no-op shim so
// callers don't need a platform check.
export async function deleteLocalVoiceClip(_localUri: string | null): Promise<void> {
  return;
}

// Native-only stubs to keep the import contract uniform — the journal
// capture screen won't call these on web.
export async function requestMicPermission(): Promise<boolean> {
  return false;
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

`/commit-commands:commit`:

```
voiceClipService — record (expo-av) + R2 upload + signed-URL cache

Native variant wraps Audio.Recording with prepare/start/stop helpers and
finishRecording() that copies the temp file into the documents dir and
returns durationSec. Upload uses the new r2-media-url Edge Function with
kind:'voice-clip' and audio/mp4 Content-Type. Web variant is a thin
playback/upload shim — recording UI is native-only.
```

---

### Task 1.10: Hook journal photo + voice uploads into pushChanges

**Files:**
- Modify: `src/sync/pushChanges.native.ts`

- [ ] **Step 1: Add an uploader for journal photo entries**

In `pushChanges.native.ts`, add this helper near the existing `uploadPhotoForEntry` (which handles expense_photos):

```ts
// For a journal_photos create entry, upload the file to R2 (key
// <tripId>/journal/<photoId>.jpg). Look up the parent entry to derive trip_id.
// Stamp the resulting storage_path back into the local DB and the outgoing
// payload. Throw on failure so the existing markError path retries.
async function uploadJournalPhotoForEntry(
  db: SQLiteDatabase,
  payload: Record<string, unknown>,
): Promise<void> {
  const photoId = payload.id as string | undefined;
  if (!photoId) return;
  const { getPhotoById, setPhotoStoragePath } = await import('@/db/queries/journalPhotos');
  const photo = await getPhotoById(db, photoId);
  if (!photo) return;
  if (photo.storagePath) {
    payload.storage_path = photo.storagePath;
    return;
  }
  if (!photo.localUri) return;
  const row = await db.getFirstAsync<{ trip_id: string }>(
    'SELECT trip_id FROM journal_photo_entries WHERE id = ?;',
    [photo.entryId],
  );
  if (!row?.trip_id) {
    throw new Error(`journal_photos: parent entry ${photo.entryId} not found`);
  }
  const { uploadPhotoToStorage } = await import('@/services/photoService');
  const storagePath = await uploadPhotoToStorage({
    kind: 'journal-photo',
    tripId: row.trip_id,
    photoId,
    localUri: photo.localUri,
  });
  await setPhotoStoragePath(db, photoId, storagePath);
  payload.storage_path = storagePath;
}

// Voice clips: upload audio, then fire-and-forget transcribe-voice.
async function uploadVoiceClipForEntry(
  db: SQLiteDatabase,
  payload: Record<string, unknown>,
): Promise<void> {
  const clipId = payload.id as string | undefined;
  if (!clipId) return;
  const { getClipById, setClipStoragePath } = await import('@/db/queries/voiceClips');
  const clip = await getClipById(db, clipId);
  if (!clip) return;
  if (clip.storagePath) {
    payload.storage_path = clip.storagePath;
    return;
  }
  if (!clip.localUri) return;
  const { uploadVoiceClipToStorage } = await import('@/services/voiceClipService');
  const storagePath = await uploadVoiceClipToStorage({
    tripId: clip.tripId,
    clipId,
    localUri: clip.localUri,
  });
  await setClipStoragePath(db, clipId, storagePath);
  payload.storage_path = storagePath;
}

// Fire-and-forget the transcribe Edge Function after a voice_clip row has
// been pushed. Runs outside any DB transaction. Errors are swallowed — the
// UI will surface a "Retry" affordance from transcript_status='pending'
// stuck for too long.
async function kickTranscribe(supabase: SupabaseClient, clipId: string): Promise<void> {
  try {
    await supabase.functions.invoke('transcribe-voice', { body: { voice_clip_id: clipId } });
  } catch (err) {
    console.warn('transcribe-voice invoke failed (will retry on next sync):', err);
  }
}
```

- [ ] **Step 2: Call the new uploaders from `pushEntry`**

Find the existing switch (or if/else chain) where `pushEntry` decides what to do per (table, action). Locate the branch that calls `uploadPhotoForEntry` for `expense_photos` + `'create'`. Add parallel branches:

```ts
// Inside pushEntry, near the existing expense_photos upload branch:
if (entry.tableName === 'journal_photos' && entry.action === 'create') {
  await uploadJournalPhotoForEntry(db, payload);
}
if (entry.tableName === 'voice_clips' && entry.action === 'create') {
  await uploadVoiceClipForEntry(db, payload);
}
```

After the existing upsert/delete code that pushes the row to Supabase, add:

```ts
if (entry.tableName === 'voice_clips' && entry.action === 'create') {
  // Fire-and-forget. Outside the loop's await chain.
  void kickTranscribe(supabase, entry.recordId);
}
```

- [ ] **Step 3: Also handle the DELETE path for journal_photos and voice_clips R2 objects**

When a `journal_photo_entries` row is soft-deleted, its child `journal_photos` rows cascade locally. We need to clean up the R2 objects too. Find the existing delete handler. Add — at the moment the delete completes successfully — a call:

```ts
if (entry.tableName === 'journal_photo_entries' && entry.action === 'delete') {
  // Best-effort R2 cleanup. Payload (stamped at enqueue time) does not have
  // the child paths, so we look them up here from the local DB.
  const { listPhotoArtifactsForEntry } = await import('@/db/queries/journalPhotos');
  const artifacts = await listPhotoArtifactsForEntry(entry.recordId);
  const { deletePhotoFromStorage } = await import('@/services/photoService');
  for (const a of artifacts) {
    if (a.storagePath) {
      void deletePhotoFromStorage(a.storagePath, 'journal-photo').catch(() => undefined);
    }
  }
}
if (entry.tableName === 'voice_clips' && entry.action === 'delete') {
  const storagePath = (payload.storage_path as string | undefined) ?? '';
  if (storagePath) {
    const { deleteVoiceClipFromStorage } = await import('@/services/voiceClipService');
    void deleteVoiceClipFromStorage(storagePath).catch(() => undefined);
  }
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual smoke**

Run the app, create a journal_photos test record manually (e.g., via the debug menu if one exists, or temporarily call `createEntry` from a screen's useEffect), and watch sync_queue progress in the SQLite browser. Confirm:
- `storage_path` gets filled
- File appears in R2 at `<tripId>/journal/<photoId>.jpg`

For voice, similar — record once `VoiceRecordSheet` lands in Phase 2.

- [ ] **Step 6: Commit**

`/commit-commands:commit`:

```
Wire journal photo + voice clip uploads into pushChanges

Journal-photo create: upload to R2 (kind:'journal-photo'), stamp storage_path
back into DB + payload. Voice-clip create: upload audio, then fire-and-forget
transcribe-voice. Soft-deletes of journal_photo_entries clean up R2 children
best-effort; voice-clip deletes clean up the audio object.
```

---

### Task 1.11: Timeline merge utility — `journalTimeline.ts`

**Files:**
- Create: `src/utils/journalTimeline.ts`
- Create: `src/utils/journalTimeline.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/journalTimeline.test.ts`:

```ts
import { buildDayTimeline } from './journalTimeline';
import type { Expense } from '@/types/expense';
import type { JournalPhotoEntryWithPhotos } from '@/types/journal';
import type { VoiceClip } from '@/types/voice';

function photo(id: string, occurredAt: string, isPrivate = false, userId = 'me'): JournalPhotoEntryWithPhotos {
  return {
    id, tripId: 't1', userId, occurredAt,
    caption: null, isPrivate,
    createdAt: occurredAt, updatedAt: occurredAt, deletedAt: null,
    photos: [],
  };
}
function clip(id: string, occurredAt: string, isPrivate = false, userId = 'me'): VoiceClip {
  return {
    id, tripId: 't1', userId, occurredAt, storagePath: '', localUri: null,
    durationSec: 10, transcript: null, transcriptStatus: 'done', transcriptError: null,
    isPrivate, createdAt: occurredAt, updatedAt: occurredAt, deletedAt: null,
  };
}
function expense(id: string, date: string, time: string, isPrivate = false, userId = 'me'): Expense {
  return {
    id, tripId: 't1', userId,
    amount: 10, currency: 'EUR', convertedAmount: 10, exchangeRate: 1,
    categoryId: 'cat1', note: null, paymentMethod: null,
    latitude: null, longitude: null, placeName: null,
    expenseDate: date, expenseTime: time,
    isRefund: false, isExcludedFromDailyMetrics: false,
    isPrivate, isSplit: false,
    spreadStartDate: null, spreadEndDate: null,
    createdAt: `${date}T${time}Z`, updatedAt: `${date}T${time}Z`, deletedAt: null,
  };
}

describe('buildDayTimeline', () => {
  it('interleaves all three kinds in chronological order', () => {
    const items = buildDayTimeline({
      photoEntries: [photo('p1', '2026-05-23T10:00:00Z')],
      voiceClips:   [clip('v1', '2026-05-23T09:00:00Z')],
      expenses:     [expense('e1', '2026-05-23', '11:00:00')],
      currentUserId: 'me',
    });
    expect(items.map((i) => i.id)).toEqual(['v1', 'p1', 'e1']);
    expect(items.map((i) => i.kind)).toEqual(['voice', 'photo', 'expense']);
  });

  it("filters out other members' private items", () => {
    const items = buildDayTimeline({
      photoEntries: [photo('p1', '2026-05-23T10:00:00Z', true, 'other')],
      voiceClips: [clip('v1', '2026-05-23T09:00:00Z', true, 'me')],
      expenses: [expense('e1', '2026-05-23', '11:00:00', true, 'other')],
      currentUserId: 'me',
    });
    // p1 and e1 are someone else's private items → hidden.
    expect(items.map((i) => i.id)).toEqual(['v1']);
  });

  it('keeps an items own private items visible to the author', () => {
    const items = buildDayTimeline({
      photoEntries: [photo('p1', '2026-05-23T10:00:00Z', true, 'me')],
      voiceClips: [],
      expenses: [],
      currentUserId: 'me',
    });
    expect(items.map((i) => i.id)).toEqual(['p1']);
  });

  it('handles ties by stable sort (insertion order)', () => {
    const items = buildDayTimeline({
      photoEntries: [photo('p1', '2026-05-23T09:00:00Z')],
      voiceClips: [clip('v1', '2026-05-23T09:00:00Z')],
      expenses: [],
      currentUserId: 'me',
    });
    // Same instant — both surface, in the order this util receives them.
    expect(items.length).toBe(2);
    expect(items[0].occurredAt.getTime()).toBe(items[1].occurredAt.getTime());
  });
});
```

- [ ] **Step 2: Run, confirm tests fail**

```bash
npx jest src/utils/journalTimeline.test.ts
```

Expected: FAIL with "Cannot find module './journalTimeline'".

- [ ] **Step 3: Implement the utility**

Create `src/utils/journalTimeline.ts`:

```ts
// Merge journal photo entries, voice clips, and expenses into one
// chronologically-ordered timeline for a given day. Pure function — does no
// SQL on its own. Callers are responsible for fetching the three lists with
// the right per-day, per-user filters.

import type { Expense } from '@/types/expense';
import type {
  JournalPhotoEntry,
  JournalPhotoEntryWithPhotos,
  JournalPhoto,
} from '@/types/journal';
import type { VoiceClip } from '@/types/voice';

export type TimelineItem =
  | {
      kind: 'photo';
      id: string;
      occurredAt: Date;
      entry: JournalPhotoEntry;
      photos: JournalPhoto[];
      caption: string | null;
      userId: string;
      isPrivate: boolean;
    }
  | {
      kind: 'voice';
      id: string;
      occurredAt: Date;
      clip: VoiceClip;
      transcript: string | null;
      userId: string;
      isPrivate: boolean;
    }
  | {
      kind: 'expense';
      id: string;
      occurredAt: Date;
      expense: Expense;
      userId: string;
      isPrivate: boolean;
    };

function visible(userId: string, isPrivate: boolean, currentUserId: string): boolean {
  return userId === currentUserId || !isPrivate;
}

export function buildDayTimeline(input: {
  photoEntries: JournalPhotoEntryWithPhotos[];
  voiceClips: VoiceClip[];
  expenses: Expense[];
  currentUserId: string;
}): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const e of input.photoEntries) {
    if (!visible(e.userId, e.isPrivate, input.currentUserId)) continue;
    items.push({
      kind: 'photo',
      id: e.id,
      occurredAt: new Date(e.occurredAt),
      entry: e,
      photos: e.photos,
      caption: e.caption,
      userId: e.userId,
      isPrivate: e.isPrivate,
    });
  }
  for (const c of input.voiceClips) {
    if (!visible(c.userId, c.isPrivate, input.currentUserId)) continue;
    items.push({
      kind: 'voice',
      id: c.id,
      occurredAt: new Date(c.occurredAt),
      clip: c,
      transcript: c.transcript,
      userId: c.userId,
      isPrivate: c.isPrivate,
    });
  }
  for (const x of input.expenses) {
    if (!visible(x.userId, x.isPrivate, input.currentUserId)) continue;
    items.push({
      kind: 'expense',
      id: x.id,
      occurredAt: new Date(`${x.expenseDate}T${x.expenseTime}Z`),
      expense: x,
      userId: x.userId,
      isPrivate: x.isPrivate,
    });
  }

  // Array.prototype.sort is stable in V8 / Hermes. Tied timestamps preserve
  // insertion order (photo → voice → expense — arbitrary but consistent).
  items.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return items;
}

// Reorder support: given an item being moved and its new neighbors after the
// drop, compute the new ISO timestamp for the moved item. Midpoint when
// neighbors exist; -60s above first / +60s below last when at an edge.
export function computeReorderTimestamp(args: {
  above: TimelineItem | null;
  below: TimelineItem | null;
}): string | null {
  const { above, below } = args;
  if (!above && !below) return null;
  if (!above && below) return new Date(below.occurredAt.getTime() - 60_000).toISOString();
  if (above && !below) return new Date(above.occurredAt.getTime() + 60_000).toISOString();
  const aboveMs = above!.occurredAt.getTime();
  const belowMs = below!.occurredAt.getTime();
  const mid = Math.floor((aboveMs + belowMs) / 2);
  // Tie-break if collision (above and below are at the same ms).
  if (mid === aboveMs && mid === belowMs) return new Date(aboveMs + 1_000).toISOString();
  return new Date(mid).toISOString();
}
```

- [ ] **Step 4: Re-run tests**

```bash
npx jest src/utils/journalTimeline.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

`/commit-commands:commit`:

```
journalTimeline.ts — pure merge of photos/voice/expenses sorted by time

Privacy filter applied client-side (own OR not-private) for defense in
depth even though SQL queries already filter. computeReorderTimestamp
returns the midpoint (or ±60s at edges) for drag-reorder updates.
```

---

### Task 1.12: EXIF and trip-date-clamp helpers

**Files:**
- Create: `src/utils/exifTime.ts`
- Create: `src/utils/exifTime.test.ts`
- Create: `src/utils/tripDateClamp.ts`
- Create: `src/utils/tripDateClamp.test.ts`

- [ ] **Step 1: Write failing tests for exifTime**

Create `src/utils/exifTime.test.ts`:

```ts
import { parseExifDateTimeOriginal } from './exifTime';

describe('parseExifDateTimeOriginal', () => {
  it('parses the standard EXIF format "YYYY:MM:DD HH:MM:SS"', () => {
    expect(parseExifDateTimeOriginal('2026:05:23 14:30:00')).toBe(
      new Date('2026-05-23T14:30:00').toISOString(),
    );
  });
  it('returns null for invalid strings', () => {
    expect(parseExifDateTimeOriginal('not a date')).toBeNull();
    expect(parseExifDateTimeOriginal('')).toBeNull();
    expect(parseExifDateTimeOriginal(null)).toBeNull();
    expect(parseExifDateTimeOriginal(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npx jest src/utils/exifTime.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement exifTime.ts**

Create `src/utils/exifTime.ts`:

```ts
// EXIF DateTimeOriginal uses colons in the date portion, not dashes.
// expo-image-picker can return this as `exif.DateTimeOriginal` when
// `exif: true` is set on the picker call.

const EXIF_RE = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

export function parseExifDateTimeOriginal(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(EXIF_RE);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
```

- [ ] **Step 4: Re-run, confirm pass**

```bash
npx jest src/utils/exifTime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing tests for tripDateClamp**

Create `src/utils/tripDateClamp.test.ts`:

```ts
import { clampOccurredAtToTrip } from './tripDateClamp';

describe('clampOccurredAtToTrip', () => {
  it('returns occurredAt unchanged when within range', () => {
    expect(
      clampOccurredAtToTrip({
        occurredAt: '2026-05-15T10:00:00Z',
        tripStartDate: '2026-05-10',
        tripEndDate: '2026-05-20',
      }),
    ).toEqual({ occurredAt: '2026-05-15T10:00:00Z', clamped: false });
  });

  it('clamps to start when too early', () => {
    expect(
      clampOccurredAtToTrip({
        occurredAt: '2026-05-01T08:00:00Z',
        tripStartDate: '2026-05-10',
        tripEndDate: '2026-05-20',
      }),
    ).toEqual({ occurredAt: '2026-05-10T08:00:00.000Z', clamped: true });
  });

  it('clamps to end when too late', () => {
    expect(
      clampOccurredAtToTrip({
        occurredAt: '2026-06-01T20:00:00Z',
        tripStartDate: '2026-05-10',
        tripEndDate: '2026-05-20',
      }),
    ).toEqual({ occurredAt: '2026-05-20T20:00:00.000Z', clamped: true });
  });

  it('does not clamp upper bound when trip is ongoing (no end date)', () => {
    expect(
      clampOccurredAtToTrip({
        occurredAt: '2099-01-01T00:00:00Z',
        tripStartDate: '2026-05-10',
        tripEndDate: null,
      }),
    ).toEqual({ occurredAt: '2099-01-01T00:00:00Z', clamped: false });
  });
});
```

- [ ] **Step 6: Implement tripDateClamp.ts**

```ts
// When a journal photo is imported from a gallery, its EXIF date might be
// outside the parent trip's [start_date, end_date] range. Clamp the date
// portion to the nearest boundary while preserving the time-of-day so the
// item still slots into the timeline at the right moment of day.

export interface ClampResult {
  occurredAt: string;
  clamped: boolean;
}

export function clampOccurredAtToTrip(args: {
  occurredAt: string;          // ISO-8601
  tripStartDate: string;       // YYYY-MM-DD
  tripEndDate: string | null;  // YYYY-MM-DD or null (ongoing trip)
}): ClampResult {
  const original = new Date(args.occurredAt);
  if (Number.isNaN(original.getTime())) {
    return { occurredAt: args.occurredAt, clamped: false };
  }

  const startBoundary = new Date(`${args.tripStartDate}T00:00:00Z`);
  if (original.getTime() < startBoundary.getTime()) {
    return { occurredAt: shiftToDate(original, args.tripStartDate), clamped: true };
  }
  if (args.tripEndDate) {
    const endBoundary = new Date(`${args.tripEndDate}T23:59:59.999Z`);
    if (original.getTime() > endBoundary.getTime()) {
      return { occurredAt: shiftToDate(original, args.tripEndDate), clamped: true };
    }
  }
  return { occurredAt: args.occurredAt, clamped: false };
}

function shiftToDate(original: Date, newDateISO: string): string {
  // Preserve UTC time-of-day on the new date.
  const hours = original.getUTCHours();
  const minutes = original.getUTCMinutes();
  const seconds = original.getUTCSeconds();
  const ms = original.getUTCMilliseconds();
  const shifted = new Date(`${newDateISO}T00:00:00Z`);
  shifted.setUTCHours(hours, minutes, seconds, ms);
  return shifted.toISOString();
}
```

- [ ] **Step 7: Re-run tests**

```bash
npx jest src/utils/tripDateClamp.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 8: Commit**

`/commit-commands:commit`:

```
EXIF time parser + trip-date-clamp helpers

parseExifDateTimeOriginal converts the colon-separated EXIF format to ISO
8601. clampOccurredAtToTrip snaps an imported photo's occurred_at to the
nearest trip boundary while preserving time-of-day; returns a flag so the
UI can show the "outside trip dates" toast once.
```

---

**Phase 1 complete.** The data layer is fully testable: SQL migration applied, local schema mirrors it, queries return typed data, sync engine pushes/pulls/uploads/deletes correctly, timeline merge is unit-tested. No UI yet.

---

## Phase 2 — Journal tab + Today view + capture flows

Adds the new `/journal` tab, the day-summary card + Today timeline, the FAB action sheet, the photo-batch and voice-record capture flows, and the `transcribe-voice` Edge Function that completes the voice loop.

### Task 2.1: i18n strings — en + he

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/he.json`

- [ ] **Step 1: Add the `journal` namespace to en.json**

Find a sensible insertion point (alphabetical or at the bottom of the file). Insert this block:

```json
  "journal": {
    "title": "Journal",
    "tabLabel": "Journal",
    "toggleToday": "Today",
    "toggleAllDays": "All days",
    "dayOfTotal": "Day {{n}} of {{total}}",
    "today": "Today",
    "totalToday": "total today",
    "addPhotos": "Add photos",
    "recordVoice": "Record voice",
    "addExpense": "Add expense",
    "photoCount_one": "{{count}} photo",
    "photoCount_other": "{{count}} photos",
    "voiceLength": "{{seconds}}s",
    "captionPlaceholder": "Add caption…",
    "locationPlaceholder": "Add a place…",
    "useAutoLocation": "Use auto location",
    "setAsCover": "Set as cover",
    "useFirstPhotoAsCover": "Use first photo",
    "transcribing": "Transcribing…",
    "transcribeFailed": "Couldn't transcribe — tap to retry",
    "retranscribe": "Re-transcribe",
    "deleteItemConfirm": "Delete this item?",
    "deletePhotoEntry": "Delete photo entry",
    "deleteVoiceClip": "Delete voice clip",
    "deleteExpense": "Delete expense",
    "emptyDay": "Nothing logged on this day yet.",
    "outsideTripWarning": "Some photos were taken outside the trip dates — placed on the nearest day.",
    "recordingTitle": "Record voice",
    "recordingStartHint": "Tap to start recording",
    "recordingCapWarning": "Recording will stop in {{seconds}}s",
    "recordingMaxLength": "Maximum 5 minutes",
    "stopRecording": "Stop",
    "discardRecording": "Discard",
    "saveRecording": "Save",
    "private": "Private",
    "shared": "Shared",
    "previousDay": "Previous day",
    "nextDay": "Next day",
    "chapterCardCounts": "📸 {{photos}}  🎤 {{voice}}  €{{total}}"
  },
```

- [ ] **Step 2: Mirror the same block in he.json with Hebrew translations**

```json
  "journal": {
    "title": "יומן",
    "tabLabel": "יומן",
    "toggleToday": "היום",
    "toggleAllDays": "כל הימים",
    "dayOfTotal": "יום {{n}} מתוך {{total}}",
    "today": "היום",
    "totalToday": "סה\"כ היום",
    "addPhotos": "הוספת תמונות",
    "recordVoice": "הקלטת קול",
    "addExpense": "הוספת הוצאה",
    "photoCount_one": "תמונה {{count}}",
    "photoCount_other": "{{count}} תמונות",
    "voiceLength": "{{seconds}} שניות",
    "captionPlaceholder": "הוספת כיתוב…",
    "locationPlaceholder": "הוספת מקום…",
    "useAutoLocation": "מקום אוטומטי",
    "setAsCover": "קביעה כתמונת שער",
    "useFirstPhotoAsCover": "תמונה ראשונה כשער",
    "transcribing": "מתמלל…",
    "transcribeFailed": "התמלול נכשל — נגיעה לניסיון נוסף",
    "retranscribe": "תמלול מחדש",
    "deleteItemConfirm": "למחוק את הפריט?",
    "deletePhotoEntry": "מחיקת אוסף תמונות",
    "deleteVoiceClip": "מחיקת הקלטה",
    "deleteExpense": "מחיקת הוצאה",
    "emptyDay": "עוד לא נרשם דבר ביום הזה.",
    "outsideTripWarning": "חלק מהתמונות צולמו מחוץ לתאריכי הטיול — שובצו ליום הקרוב.",
    "recordingTitle": "הקלטת קול",
    "recordingStartHint": "נגיעה להתחלת הקלטה",
    "recordingCapWarning": "ההקלטה תיעצר עוד {{seconds}} שניות",
    "recordingMaxLength": "עד 5 דקות",
    "stopRecording": "עצירה",
    "discardRecording": "מחיקה",
    "saveRecording": "שמירה",
    "private": "פרטי",
    "shared": "משותף",
    "previousDay": "יום קודם",
    "nextDay": "יום הבא",
    "chapterCardCounts": "📸 {{photos}}  🎤 {{voice}}  ₪{{total}}"
  },
```

Note: the `₪` symbol in `chapterCardCounts.he` is illustrative — the actual currency symbol comes from `formatCurrency` at render time. Keep the template free of currency literals; the consumer passes the formatted amount.

- [ ] **Step 3: Validate both JSON files parse**

```bash
node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('src/i18n/locales/he.json','utf8'))"
```

Expected: no output (success). If a SyntaxError prints, find the offending comma/brace and fix.

- [ ] **Step 4: Commit**

`/commit-commands:commit`:

```
Add journal i18n keys (en + he)

Single namespace covering tab labels, toggle, day summary, capture menu,
recording UI, transcription states, edit affordances, and the chapter
card template. Hebrew populated at write time per the i18n parity rule.
```

---

### Task 2.2: Add Journal tab to the tab bar

**Files:**
- Modify: `app/(main)/trip/[id]/(tabs)/_layout.tsx`

- [ ] **Step 1: Insert the new Tabs.Screen between map and ask**

Open the file and replace the body of `TripTabsLayout` so the screens are ordered Expenses → Map → Journal → Ask → Stats:

```tsx
export default function TripTabsLayout() {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.navBg,
          borderTopColor: theme.border,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tripView.tabExpenses'),
          tabBarIcon: ({ focused }) => <TabEmoji emoji="📋" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('tripView.tabMap'),
          tabBarIcon: ({ focused }) => <TabEmoji emoji="📍" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: t('journal.tabLabel'),
          tabBarIcon: ({ focused }) => <TabEmoji emoji="📖" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          title: t('tripView.tabAsk'),
          tabBarIcon: ({ focused }) => <TabEmoji emoji="🧠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t('tripView.tabStats'),
          tabBarIcon: ({ focused }) => <TabEmoji emoji="📊" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
```

The Expo Router resolves `name="journal"` to `app/(main)/trip/[id]/(tabs)/journal.tsx`, which we create in Task 2.3.

- [ ] **Step 2: Commit**

Don't commit yet — without `journal.tsx`, the tab would crash on tap. Commit together with Task 2.3.

---

### Task 2.3: Skeleton `journal.tsx` screen + toggle

**Files:**
- Create: `app/(main)/trip/[id]/(tabs)/journal.tsx`
- Create: `src/components/journal/index.ts` (barrel export — added incrementally)

- [ ] **Step 1: Create the screen with the toggle and empty placeholders**

```tsx
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChapterView } from '@/components/journal/ChapterView';
import { TodayView } from '@/components/journal/TodayView';
import { sizing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

type Mode = 'today' | 'allDays';

export default function JournalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = id ?? '';
  const theme = useTheme();
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('today');

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.toggle, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ToggleButton
          label={t('journal.toggleToday')}
          active={mode === 'today'}
          onPress={() => setMode('today')}
        />
        <ToggleButton
          label={t('journal.toggleAllDays')}
          active={mode === 'allDays'}
          onPress={() => setMode('allDays')}
        />
      </View>
      {mode === 'today' ? (
        <TodayView tripId={tripId} />
      ) : (
        <ChapterView tripId={tripId} onPickDay={() => setMode('today')} />
      )}
    </View>
  );
}

function ToggleButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <View
      onTouchEnd={onPress}
      style={[
        styles.toggleBtn,
        active && { backgroundColor: theme.accentSoft },
      ]}
    >
      <Text
        style={[
          styles.toggleLabel,
          { color: active ? theme.accent : theme.textMuted },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// Tiny local Text import — re-using react-native Text via the existing import.
import { Text } from 'react-native';

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 12, paddingTop: 12 },
  toggle: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 11,
    alignItems: 'center',
  },
  toggleLabel: { fontSize: 12, fontWeight: '700' },
});
```

This file references `TodayView` and `ChapterView` components that don't exist yet — the next tasks create them. For now, create stub files so the import resolves:

- [ ] **Step 2: Create stub TodayView component**

`src/components/journal/TodayView.tsx`:

```tsx
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export function TodayView(_: { tripId: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={theme.accent} />
    </View>
  );
}
```

- [ ] **Step 3: Create stub ChapterView component**

`src/components/journal/ChapterView.tsx`:

```tsx
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export function ChapterView(_: { tripId: string; onPickDay: (dayDate: string) => void }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={theme.accent} />
    </View>
  );
}
```

- [ ] **Step 4: Type-check and run on device**

```bash
npx tsc --noEmit
npx expo start --android
```

Expected: app launches; tap into a trip → see the new 📖 Journal tab; tap it → see a spinner. Toggle works (no visible state change yet, but no crash).

- [ ] **Step 5: Commit (now we can commit the tab change from Task 2.2 with this screen)**

`/commit-commands:commit`:

```
Add /journal tab + skeleton screen with Today/All-days toggle

Tab order is Expenses · Map · Journal · Ask · Stats. The screen renders a
top toggle and routes to TodayView or ChapterView stub bodies — both are
ActivityIndicator placeholders. Sub-components fill in over the next tasks.
```

---

### Task 2.4: `DayNav` and `DaySummaryCard` components

**Files:**
- Create: `src/components/journal/DayNav.tsx`
- Create: `src/components/journal/DaySummaryCard.tsx`
- Create: `src/hooks/useDaySummary.ts` (fetcher for the summary card data)

- [ ] **Step 1: Create the DayNav component**

`src/components/journal/DayNav.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { sizing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatReadableDate } from '@/utils/date';

export function DayNav(props: {
  dayDate: string;          // YYYY-MM-DD
  dayIndex: number | null;  // 1-based or null if outside trip
  dayTotal: number | null;  // total days in trip or null if ongoing
  isToday: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  const labelMain = props.isToday
    ? t('journal.today')
    : formatReadableDate(props.dayDate);
  const labelSub =
    props.dayIndex && props.dayTotal
      ? t('journal.dayOfTotal', { n: props.dayIndex, total: props.dayTotal })
      : '';

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Pressable
        accessibilityLabel={t('journal.previousDay')}
        onPress={props.onPrev}
        hitSlop={8}
        style={({ pressed }) => [styles.chev, pressed && { opacity: 0.6 }]}
      >
        <Text style={[styles.chevText, { color: theme.text }]}>‹</Text>
      </Pressable>
      <View style={{ alignItems: 'center' }}>
        <Text style={[styles.main, { color: theme.text }]}>{labelMain}</Text>
        {labelSub ? (
          <Text style={[styles.sub, { color: theme.textMuted }]}>{labelSub}</Text>
        ) : null}
      </View>
      <Pressable
        accessibilityLabel={t('journal.nextDay')}
        onPress={props.onNext}
        hitSlop={8}
        style={({ pressed }) => [styles.chev, pressed && { opacity: 0.6 }]}
      >
        <Text style={[styles.chevText, { color: theme.text }]}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  chev: { paddingHorizontal: 6, paddingVertical: 2 },
  chevText: { fontSize: 22, fontWeight: '700', lineHeight: 24 },
  main: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 10, fontWeight: '500', marginTop: 2 },
});
```

- [ ] **Step 2: Create the useDaySummary hook**

`src/hooks/useDaySummary.ts`:

```ts
import { useEffect, useState } from 'react';

import * as journalDays from '@/db/queries/journalDays';
import * as journalPhotoEntries from '@/db/queries/journalPhotoEntries';
import * as voiceClips from '@/db/queries/voiceClips';
import { useAuthStore } from '@/stores/authStore';
import type { JournalDay } from '@/types/journal';
import { sumDayExpenses } from '@/utils/dailyTotals';

export interface DaySummaryData {
  totalConvertedAmount: number;
  photoCount: number;
  voiceCount: number;
  expenseCount: number;
  coverStoragePath: string | null;
  effectiveLocation: string | null;
  meta: JournalDay | null;
  isLoading: boolean;
}

export function useDaySummary(tripId: string, dayDateISO: string): DaySummaryData & {
  reload: () => Promise<void>;
} {
  const me = useAuthStore((s) => s.session?.user.id ?? '');
  const [data, setData] = useState<DaySummaryData>({
    totalConvertedAmount: 0,
    photoCount: 0,
    voiceCount: 0,
    expenseCount: 0,
    coverStoragePath: null,
    effectiveLocation: null,
    meta: null,
    isLoading: true,
  });

  const reload = async () => {
    if (!tripId || !me) return;
    const [photoCount, voiceCount, meta, coverPath, expenseTotals] = await Promise.all([
      journalPhotoEntries.countPhotosForTripDay(tripId, dayDateISO, me),
      voiceClips.countClipsForTripDay(tripId, dayDateISO, me),
      journalDays.getDayMetadata(tripId, dayDateISO),
      journalPhotoEntries.firstPhotoStoragePathForDay(tripId, dayDateISO, me),
      sumDayExpenses(tripId, dayDateISO, me),
    ]);
    setData({
      totalConvertedAmount: expenseTotals.total,
      photoCount,
      voiceCount,
      expenseCount: expenseTotals.count,
      coverStoragePath: meta?.coverPhotoEntryId
        ? await journalPhotoEntries.firstPhotoStoragePathForDay(tripId, dayDateISO, me) // override resolved server-side in DaySummary aggregate; for the live card we use first-photo as a fallback
        : coverPath,
      effectiveLocation: meta?.location ?? expenseTotals.mostFrequentPlace,
      meta,
      isLoading: false,
    });
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, dayDateISO, me]);

  return { ...data, reload };
}
```

This hook depends on a tiny helper `sumDayExpenses` that doesn't exist yet — create it:

- [ ] **Step 3: Create the sumDayExpenses helper**

`src/utils/dailyTotals.ts`:

```ts
import { getDatabase } from '@/db/database';

export interface DayExpenseAggregate {
  total: number;
  count: number;
  mostFrequentPlace: string | null;
}

export async function sumDayExpenses(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<DayExpenseAggregate> {
  const db = await getDatabase();
  const totalRow = await db.getFirstAsync<{ total: number; count: number }>(
    `SELECT COALESCE(SUM(converted_amount), 0) AS total, COUNT(*) AS count
       FROM expenses
      WHERE trip_id = ? AND expense_date = ? AND deleted_at IS NULL
        AND is_excluded_from_daily_metrics = 0
        AND (is_private = 0 OR user_id = ?);`,
    [tripId, dayDateISO, currentUserId],
  );
  const placeRow = await db.getFirstAsync<{ place_name: string | null }>(
    `SELECT place_name FROM expenses
      WHERE trip_id = ? AND expense_date = ? AND deleted_at IS NULL
        AND place_name IS NOT NULL
        AND (is_private = 0 OR user_id = ?)
      GROUP BY place_name
      ORDER BY COUNT(*) DESC, place_name ASC
      LIMIT 1;`,
    [tripId, dayDateISO, currentUserId],
  );
  return {
    total: totalRow?.total ?? 0,
    count: totalRow?.count ?? 0,
    mostFrequentPlace: placeRow?.place_name ?? null,
  };
}
```

- [ ] **Step 4: Create the DaySummaryCard component**

`src/components/journal/DaySummaryCard.tsx`:

```tsx
import { Image, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

import { useSignedJournalPhotoUrl } from '@/hooks/useSignedJournalPhotoUrl';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatCurrency } from '@/utils/currency';

import { LocationEditor } from './LocationEditor';

interface Props {
  tripId: string;
  dayDate: string;
  dayIndex: number;
  dayTotal: number | null;
  isToday: boolean;
  totalConvertedAmount: number;
  homeCurrency: string;
  photoCount: number;
  voiceCount: number;
  expenseCount: number;
  coverStoragePath: string | null;
  effectiveLocation: string | null;
  onLocationChange: (next: string | null) => void;
}

export function DaySummaryCard(props: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const coverUrl = useSignedJournalPhotoUrl(props.coverStoragePath);

  return (
    <LinearGradient
      colors={theme.cardGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { borderColor: theme.border }]}
    >
      <View style={styles.heroWrap}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.hero} />
        ) : (
          <LinearGradient
            colors={[theme.accent, theme.accentAlt]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          />
        )}
      </View>
      <View style={styles.row1}>
        <View>
          <Text style={[styles.dayNum, { color: theme.text }]}>
            {t('journal.dayOfTotal', { n: props.dayIndex, total: props.dayTotal ?? '–' })}
          </Text>
          <Text style={[styles.date, { color: theme.textMuted }]}>
            {props.isToday ? `${t('journal.today')} · ${props.dayDate}` : props.dayDate}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.amount, { color: theme.text }]}>
            {formatCurrency(props.totalConvertedAmount, props.homeCurrency)}
          </Text>
          <Text style={[styles.amountLabel, { color: theme.textMuted }]}>
            {t('journal.totalToday')}
          </Text>
        </View>
      </View>
      <View style={styles.stats}>
        <Text style={[styles.stat, { color: theme.text }]}>
          📸 <Text style={styles.statNum}>{props.photoCount}</Text>
        </Text>
        <Text style={[styles.stat, { color: theme.text }]}>
          🎤 <Text style={styles.statNum}>{props.voiceCount}</Text>
        </Text>
        <Text style={[styles.stat, { color: theme.text }]}>
          📋 <Text style={styles.statNum}>{props.expenseCount}</Text>
        </Text>
      </View>
      <LocationEditor
        value={props.effectiveLocation}
        isAuto={props.effectiveLocation != null}
        onChange={props.onLocationChange}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 14,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroWrap: { borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  hero: { width: '100%', height: 110 },
  row1: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  dayNum: { fontSize: 18, fontWeight: '800' },
  date: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  amount: { fontSize: 18, fontWeight: '800' },
  amountLabel: { fontSize: 10, fontWeight: '500' },
  stats: { flexDirection: 'row', gap: 16, marginTop: 12 },
  stat: { fontSize: 12 },
  statNum: { fontWeight: '800' },
});
```

The DaySummaryCard uses two more components that need stubs: `useSignedJournalPhotoUrl` and `LocationEditor`. Create them now:

- [ ] **Step 5: Create useSignedJournalPhotoUrl hook**

`src/hooks/useSignedJournalPhotoUrl.ts`:

```ts
import { useEffect, useState } from 'react';

import { getSignedPhotoUrl } from '@/services/photoService';

export function useSignedJournalPhotoUrl(storagePath: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!storagePath) {
      setUrl(null);
      return;
    }
    void (async () => {
      const u = await getSignedPhotoUrl(storagePath, 'journal-photo');
      if (!cancelled) setUrl(u);
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath]);
  return url;
}
```

- [ ] **Step 6: Create LocationEditor component**

`src/components/journal/LocationEditor.tsx`:

```tsx
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  value: string | null;
  isAuto: boolean;
  onChange: (next: string | null) => void;
}

export function LocationEditor({ value, onChange }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  if (editing) {
    return (
      <View style={[styles.row, { marginTop: 10 }]}>
        <TextInput
          autoFocus
          value={draft}
          onChangeText={setDraft}
          placeholder={t('journal.locationPlaceholder')}
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          onBlur={() => {
            const trimmed = draft.trim();
            onChange(trimmed.length === 0 ? null : trimmed);
            setEditing(false);
          }}
          onSubmitEditing={() => {
            const trimmed = draft.trim();
            onChange(trimmed.length === 0 ? null : trimmed);
            setEditing(false);
          }}
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => setEditing(true)}
      onLongPress={() => onChange(null)}
      style={[styles.row, { marginTop: 10 }]}
    >
      <Text style={[styles.chip, { color: theme.textMuted }]}>
        {value ?? t('journal.locationPlaceholder')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  chip: { fontSize: 12, fontWeight: '500' },
  input: {
    flex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    fontSize: 14,
  },
});
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. (If LinearGradient isn't installed, run `npx expo install react-native-linear-gradient` first — but the codebase likely already has `expo-linear-gradient`, in which case swap the import to `import { LinearGradient } from 'expo-linear-gradient';`.)

- [ ] **Step 8: Commit**

`/commit-commands:commit`:

```
DayNav + DaySummaryCard + LocationEditor components

Header chevrons navigate days; the hero card shows day index, date, total
spend, counts, and an editable location chip (tap = inline edit, long-press
= clear back to auto). useSignedJournalPhotoUrl wraps photoService for the
cover image.
```

---

### Task 2.5: Timeline row components — photo / voice / expense

**Files:**
- Create: `src/components/journal/timeline/PhotoGrid.tsx`
- Create: `src/components/journal/timeline/PhotoEntryRow.tsx`
- Create: `src/components/journal/timeline/VoiceClipRow.tsx`
- Create: `src/components/journal/timeline/ExpenseTimelineRow.tsx`

- [ ] **Step 1: PhotoGrid**

`src/components/journal/timeline/PhotoGrid.tsx`:

```tsx
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSignedJournalPhotoUrl } from '@/hooks/useSignedJournalPhotoUrl';
import { useTheme } from '@/hooks/useTheme';
import type { JournalPhoto } from '@/types/journal';

interface Props {
  photos: JournalPhoto[];
  onOpen: (index: number) => void;
}

export function PhotoGrid({ photos, onOpen }: Props) {
  if (photos.length === 1) {
    return <SingleTile photo={photos[0]} onPress={() => onOpen(0)} />;
  }
  const tiles = photos.slice(0, 4);
  const remaining = photos.length - tiles.length;
  return (
    <View style={styles.grid}>
      {tiles.map((p, idx) => (
        <Pressable
          key={p.id}
          onPress={() => onOpen(idx)}
          style={({ pressed }) => [styles.cell, pressed && { opacity: 0.85 }]}
        >
          <Tile photo={p} />
          {idx === 3 && remaining > 0 ? (
            <View style={styles.moreOverlay}>
              <Text style={styles.moreText}>+{remaining}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

function Tile({ photo }: { photo: JournalPhoto }) {
  const url = useSignedJournalPhotoUrl(photo.storagePath);
  const theme = useTheme();
  if (!url) return <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.surface }]} />;
  return <Image source={{ uri: url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />;
}

function SingleTile({ photo, onPress }: { photo: JournalPhoto; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.single}>
      <Tile photo={photo} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  single: { width: '100%', aspectRatio: 1.5, borderRadius: 12, overflow: 'hidden' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 12,
    overflow: 'hidden',
    aspectRatio: 1,
  },
  cell: { width: '50%', height: '50%', position: 'relative' },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
```

- [ ] **Step 2: PhotoEntryRow**

`src/components/journal/timeline/PhotoEntryRow.tsx`:

```tsx
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { JournalPhotoEntryWithPhotos } from '@/types/journal';

import { PhotoGrid } from './PhotoGrid';
import { TimestampGutter } from './TimestampGutter';

interface Props {
  entry: JournalPhotoEntryWithPhotos;
  onCaptionChange: (next: string | null) => void;
  onOpenPhoto: (index: number) => void;
  onLongPress: () => void;
}

export function PhotoEntryRow({ entry, onCaptionChange, onOpenPhoto, onLongPress }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.caption ?? '');

  return (
    <Pressable
      onLongPress={onLongPress}
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <TimestampGutter occurredAt={entry.occurredAt} />
      <View style={styles.body}>
        <Text style={[styles.type, { color: theme.textMuted }]}>
          📸 {entry.photos.length === 1 ? t('journal.photoCount_one', { count: 1 }) : t('journal.photoCount_other', { count: entry.photos.length })}
        </Text>
        <PhotoGrid photos={entry.photos} onOpen={onOpenPhoto} />
        {editing ? (
          <TextInput
            autoFocus
            value={draft}
            onChangeText={setDraft}
            placeholder={t('journal.captionPlaceholder')}
            placeholderTextColor={theme.textMuted}
            maxLength={200}
            style={[styles.captionInput, { color: theme.text, borderColor: theme.border }]}
            onBlur={() => {
              const trimmed = draft.trim();
              onCaptionChange(trimmed.length === 0 ? null : trimmed);
              setEditing(false);
            }}
          />
        ) : (
          <Pressable onPress={() => setEditing(true)}>
            <Text style={[styles.caption, { color: theme.text, opacity: entry.caption ? 1 : 0.5 }]}>
              {entry.caption ?? t('journal.captionPlaceholder')}
            </Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  body: { flex: 1 },
  type: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  caption: { marginTop: 6, fontSize: 11 },
  captionInput: { marginTop: 6, fontSize: 11, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
});
```

- [ ] **Step 3: Create the shared TimestampGutter helper**

`src/components/journal/timeline/TimestampGutter.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export function TimestampGutter({ occurredAt }: { occurredAt: string }) {
  const theme = useTheme();
  const d = new Date(occurredAt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return (
    <View style={styles.gutter}>
      <Text style={[styles.text, { color: theme.textMuted }]}>{hh}:{mm}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gutter: { minWidth: 38, paddingTop: 2 },
  text: { fontSize: 10 },
});
```

- [ ] **Step 4: VoiceClipRow**

`src/components/journal/timeline/VoiceClipRow.tsx`:

```tsx
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useVoiceClipPlayback } from '@/hooks/useVoiceClipPlayback';
import type { VoiceClip } from '@/types/voice';

import { TimestampGutter } from './TimestampGutter';

interface Props {
  clip: VoiceClip;
  onOpenTranscript: () => void;
  onLongPress: () => void;
  onRetranscribe: () => void;
}

export function VoiceClipRow({ clip, onOpenTranscript, onLongPress, onRetranscribe }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { isPlaying, toggle } = useVoiceClipPlayback(clip);

  const transcriptText =
    clip.transcriptStatus === 'pending' || clip.transcriptStatus === 'processing'
      ? t('journal.transcribing')
      : clip.transcriptStatus === 'failed'
        ? t('journal.transcribeFailed')
        : (clip.transcript ?? '');

  return (
    <Pressable
      onLongPress={onLongPress}
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <TimestampGutter occurredAt={clip.occurredAt} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.type, { color: theme.textMuted }]}>
          🎤 {t('journal.voiceLength', { seconds: clip.durationSec })}
        </Text>
        <View style={[styles.player, { backgroundColor: theme.accentSoft }]}>
          <Pressable
            onPress={toggle}
            hitSlop={8}
            style={[styles.playBtn, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.playBtnText}>{isPlaying ? '⏸' : '▶'}</Text>
          </Pressable>
          <View style={[styles.waves, { backgroundColor: theme.accentSoft }]} />
        </View>
        <Pressable
          onPress={clip.transcriptStatus === 'failed' ? onRetranscribe : onOpenTranscript}
          style={{ marginTop: 6 }}
        >
          {clip.transcriptStatus === 'pending' || clip.transcriptStatus === 'processing' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ActivityIndicator size="small" color={theme.textMuted} />
              <Text style={[styles.transcript, { color: theme.textMuted }]}>{transcriptText}</Text>
            </View>
          ) : (
            <Text
              numberOfLines={3}
              style={[
                styles.transcript,
                { color: clip.transcriptStatus === 'failed' ? theme.danger : theme.text },
              ]}
            >
              {transcriptText}
            </Text>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  type: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 12,
  },
  playBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnText: { color: '#fff', fontSize: 12 },
  waves: { flex: 1, height: 18, borderRadius: 4, opacity: 0.6 },
  transcript: { fontSize: 11 },
});
```

- [ ] **Step 5: useVoiceClipPlayback hook**

`src/hooks/useVoiceClipPlayback.ts`:

```ts
import { Audio } from 'expo-av';
import { useEffect, useRef, useState } from 'react';

import { getSignedVoiceClipUrl } from '@/services/voiceClipService';
import type { VoiceClip } from '@/types/voice';

export function useVoiceClipPlayback(clip: VoiceClip): {
  isPlaying: boolean;
  toggle: () => Promise<void>;
} {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  async function toggle() {
    if (soundRef.current && isPlaying) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
      return;
    }
    if (!soundRef.current) {
      const uri = clip.localUri ?? (await getSignedVoiceClipUrl(clip.storagePath));
      if (!uri) return;
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            setIsPlaying(false);
            void soundRef.current?.setPositionAsync(0);
          }
        },
      );
      soundRef.current = sound;
      setIsPlaying(true);
      return;
    }
    await soundRef.current.playAsync();
    setIsPlaying(true);
  }

  return { isPlaying, toggle };
}
```

- [ ] **Step 6: ExpenseTimelineRow (thin reuse of existing ExpenseCard)**

`src/components/journal/timeline/ExpenseTimelineRow.tsx`:

```tsx
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ExpenseCard } from '@/components/expense/card/ExpenseCard';
import { useTheme } from '@/hooks/useTheme';
import type { Expense } from '@/types/expense';

import { TimestampGutter } from './TimestampGutter';

interface Props {
  expense: Expense;
  onLongPress: () => void;
}

export function ExpenseTimelineRow({ expense, onLongPress }: Props) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onLongPress={onLongPress}
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <TimestampGutter occurredAt={`${expense.expenseDate}T${expense.expenseTime}Z`} />
      <View style={{ flex: 1 }}>
        <ExpenseCard
          expense={expense}
          onPress={() => router.push(`/trip/${expense.tripId}/expense/${expense.id}`)}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
});
```

(If `ExpenseCard`'s actual props don't match the above, swap to whichever wrapper is exported. The intent is to reuse, not duplicate.)

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors only inside `ExpenseTimelineRow.tsx` if `ExpenseCard`'s prop shape differs — adjust to match the actual export. Everything else should compile.

- [ ] **Step 8: Commit**

`/commit-commands:commit`:

```
Timeline row components — photo / voice / expense

Photo row shows 2×2 grid (single → full-width hero) + inline-editable caption.
Voice row has a play/pause button, transcript preview (3 lines), and a retry
affordance on transcribe failure. Expense row wraps the existing ExpenseCard
inside the shared TimestampGutter so all rows align visually.
```

---

### Task 2.6: `TodayView` — wire timeline merge into the screen

**Files:**
- Modify: `src/components/journal/TodayView.tsx`
- Create: `src/hooks/useDayTimeline.ts`

- [ ] **Step 1: Create the timeline-loading hook**

`src/hooks/useDayTimeline.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

import * as expenseQueries from '@/db/queries/expenses';
import * as journalPhotoEntries from '@/db/queries/journalPhotoEntries';
import * as voiceClips from '@/db/queries/voiceClips';
import { useAuthStore } from '@/stores/authStore';
import { buildDayTimeline, type TimelineItem } from '@/utils/journalTimeline';

export function useDayTimeline(tripId: string, dayDateISO: string): {
  items: TimelineItem[];
  isLoading: boolean;
  reload: () => Promise<void>;
} {
  const me = useAuthStore((s) => s.session?.user.id ?? '');
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!tripId || !me) return;
    setIsLoading(true);
    try {
      const [photoEntries, clips, allExpenses] = await Promise.all([
        journalPhotoEntries.listEntriesForDay(tripId, dayDateISO, me),
        voiceClips.listClipsForDay(tripId, dayDateISO, me),
        // Filter to that day client-side; expenses query module already
        // returns the full trip in many places, so let's stay consistent.
        expenseQueries.listExpensesForTrip(tripId).then((rows) =>
          rows.filter((r) => r.expenseDate === dayDateISO && r.deletedAt == null),
        ),
      ]);
      setItems(
        buildDayTimeline({
          photoEntries,
          voiceClips: clips,
          expenses: allExpenses,
          currentUserId: me,
        }),
      );
    } finally {
      setIsLoading(false);
    }
  }, [tripId, dayDateISO, me]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, isLoading, reload };
}
```

- [ ] **Step 2: Flesh out TodayView**

REPLACE `src/components/journal/TodayView.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { DayNav } from '@/components/journal/DayNav';
import { DaySummaryCard } from '@/components/journal/DaySummaryCard';
import { JournalFab } from '@/components/journal/JournalFab';
import { PhotoEntryRow } from '@/components/journal/timeline/PhotoEntryRow';
import { VoiceClipRow } from '@/components/journal/timeline/VoiceClipRow';
import { ExpenseTimelineRow } from '@/components/journal/timeline/ExpenseTimelineRow';
import * as journalPhotoEntries from '@/db/queries/journalPhotoEntries';
import * as journalDays from '@/db/queries/journalDays';
import { useDaySummary } from '@/hooks/useDaySummary';
import { useDayTimeline } from '@/hooks/useDayTimeline';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useTripsStore } from '@/stores/tripsStore';
import { addDaysISO, todayISO } from '@/utils/date';

export function TodayView({ tripId }: { tripId: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const trip = useTripsStore((s) => s.trips.find((tr) => tr.id === tripId) ?? null);
  const [dayDate, setDayDate] = useState<string>(todayISO());

  const { items, isLoading, reload: reloadTimeline } = useDayTimeline(tripId, dayDate);
  const summary = useDaySummary(tripId, dayDate);

  const dayIndex = useMemo(() => {
    if (!trip) return 1;
    return Math.max(
      1,
      Math.floor((Date.parse(dayDate) - Date.parse(trip.startDate)) / 86_400_000) + 1,
    );
  }, [trip, dayDate]);

  const dayTotal = useMemo(() => {
    if (!trip || !trip.endDate) return null;
    return Math.floor((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86_400_000) + 1;
  }, [trip]);

  if (!trip) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <DayNav
        dayDate={dayDate}
        dayIndex={dayIndex}
        dayTotal={dayTotal}
        isToday={dayDate === todayISO()}
        onPrev={() => setDayDate(addDaysISO(dayDate, -1))}
        onNext={() => setDayDate(addDaysISO(dayDate, +1))}
      />
      <FlatList
        ListHeaderComponent={
          <DaySummaryCard
            tripId={tripId}
            dayDate={dayDate}
            dayIndex={dayIndex}
            dayTotal={dayTotal}
            isToday={dayDate === todayISO()}
            totalConvertedAmount={summary.totalConvertedAmount}
            homeCurrency={trip.homeCurrency}
            photoCount={summary.photoCount}
            voiceCount={summary.voiceCount}
            expenseCount={summary.expenseCount}
            coverStoragePath={summary.coverStoragePath}
            effectiveLocation={summary.effectiveLocation}
            onLocationChange={async (next) => {
              await journalDays.setLocation(tripId, dayDate, next);
              await summary.reload();
            }}
          />
        }
        data={items}
        keyExtractor={(it) => `${it.kind}-${it.id}`}
        renderItem={({ item }) => {
          if (item.kind === 'photo') {
            return (
              <PhotoEntryRow
                entry={{ ...item.entry, photos: item.photos }}
                onCaptionChange={async (caption) => {
                  await journalPhotoEntries.updateEntryCaption(item.id, caption);
                  await reloadTimeline();
                }}
                onOpenPhoto={() => {}}
                onLongPress={() => {}}
              />
            );
          }
          if (item.kind === 'voice') {
            return (
              <VoiceClipRow
                clip={item.clip}
                onOpenTranscript={() => {}}
                onLongPress={() => {}}
                onRetranscribe={() => {}}
              />
            );
          }
          return (
            <ExpenseTimelineRow expense={item.expense} onLongPress={() => {}} />
          );
        }}
        ListEmptyComponent={
          isLoading ? null : (
            <Text style={[styles.empty, { color: theme.textMuted }]}>{t('journal.emptyDay')}</Text>
          )
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      />
      <JournalFab
        tripId={tripId}
        dayDate={dayDate}
        onCreated={async () => {
          await Promise.all([reloadTimeline(), summary.reload()]);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
```

- [ ] **Step 3: Add helpers `addDaysISO` and `todayISO` to `src/utils/date.ts` if missing**

Check the file first; if these don't exist, append:

```ts
// Returns YYYY-MM-DD for the local-timezone "today".
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Add days (positive or negative) to a YYYY-MM-DD string. Returns YYYY-MM-DD.
export function addDaysISO(dayISO: string, delta: number): string {
  const d = new Date(`${dayISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors limited to the not-yet-created `JournalFab` (next task).

- [ ] **Step 5: Commit (defer until JournalFab lands)**

Don't commit yet — `JournalFab` is imported but doesn't exist. Move to Task 2.7.

---

### Task 2.7: `JournalFab` + action sheet

**Files:**
- Create: `src/components/journal/JournalFab.tsx`
- Create: `src/components/journal/AddMenuSheet.tsx`

- [ ] **Step 1: AddMenuSheet (presentational)**

`src/components/journal/AddMenuSheet.tsx`:

```tsx
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onAddPhotos: () => void;
  onRecordVoice: () => void;
  onAddExpense: () => void;
}

export function AddMenuSheet({ visible, onDismiss, onAddPhotos, onRecordVoice, onAddExpense }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Pressable style={styles.row} onPress={onAddPhotos}>
            <Text style={[styles.label, { color: theme.text }]}>📸  {t('journal.addPhotos')}</Text>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Pressable style={styles.row} onPress={onRecordVoice}>
            <Text style={[styles.label, { color: theme.text }]}>🎤  {t('journal.recordVoice')}</Text>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Pressable style={styles.row} onPress={onAddExpense}>
            <Text style={[styles.label, { color: theme.text }]}>📋  {t('journal.addExpense')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', padding: 16 },
  sheet: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, marginBottom: 90 },
  row: { paddingVertical: 16, paddingHorizontal: 18 },
  label: { fontSize: 16, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth },
});
```

- [ ] **Step 2: JournalFab (entry point)**

`src/components/journal/JournalFab.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { I18nManager, Pressable, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/hooks/useTheme';

import { AddMenuSheet } from './AddMenuSheet';
import { runJournalPhotoPick } from './capture/photoPick';
import { VoiceRecordSheet } from './VoiceRecordSheet';

interface Props {
  tripId: string;
  dayDate: string;
  onCreated: () => void | Promise<void>;
}

export function JournalFab({ tripId, dayDate, onCreated }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setMenuOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          I18nManager.isRTL ? styles.fabLeft : styles.fabRight,
          pressed && { transform: [{ scale: 0.97 }] },
        ]}
      >
        <LinearGradient
          colors={[theme.accent, theme.accentAlt]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.plus}>＋</Text>
      </Pressable>
      <AddMenuSheet
        visible={menuOpen}
        onDismiss={() => setMenuOpen(false)}
        onAddPhotos={async () => {
          setMenuOpen(false);
          await runJournalPhotoPick({ tripId, dayDate });
          await onCreated();
        }}
        onRecordVoice={() => {
          setMenuOpen(false);
          setRecordOpen(true);
        }}
        onAddExpense={() => {
          setMenuOpen(false);
          router.push(`/add-expense?tripId=${tripId}&date=${dayDate}`);
        }}
      />
      <VoiceRecordSheet
        visible={recordOpen}
        tripId={tripId}
        dayDate={dayDate}
        onDismiss={() => setRecordOpen(false)}
        onSaved={async () => {
          setRecordOpen(false);
          await onCreated();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 86, // sits above bottom tab bar
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#7c5cff',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  fabRight: { right: 16 },
  fabLeft: { left: 16 },
  plus: { color: '#fff', fontSize: 30, fontWeight: '300', lineHeight: 34 },
});
```

This file imports `runJournalPhotoPick` and `VoiceRecordSheet` — created in the next two tasks.

- [ ] **Step 3: Type-check (still failing) and commit-prep**

Don't commit yet. Tasks 2.8 and 2.9 add the missing imports.

---

### Task 2.8: Photo pick flow

**Files:**
- Create: `src/components/journal/capture/photoPick.ts`

- [ ] **Step 1: Implement the photo-pick orchestrator**

```ts
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import * as journalPhotoEntries from '@/db/queries/journalPhotoEntries';
import { processAndPersistPhoto } from '@/services/photoService';
import { useAuthStore } from '@/stores/authStore';
import { useTripsStore } from '@/stores/tripsStore';
import { i18n } from '@/i18n';
import * as Crypto from 'expo-crypto';
import { parseExifDateTimeOriginal } from '@/utils/exifTime';
import { clampOccurredAtToTrip } from '@/utils/tripDateClamp';

interface Args {
  tripId: string;
  dayDate: string;
}

export async function runJournalPhotoPick(args: Args): Promise<void> {
  const me = useAuthStore.getState().session?.user.id;
  if (!me) return;

  const trip = useTripsStore.getState().trips.find((t) => t.id === args.tripId);
  if (!trip) return;

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    allowsMultipleSelection: true,
    exif: true,
  });
  if (result.canceled || result.assets.length === 0) return;

  // Per-asset: derive occurred_at from EXIF if present, clamp to trip dates,
  // persist a local copy. Build payload for createEntry.
  let earliest: string | null = null;
  let anyClamped = false;
  const photoRefs = await Promise.all(
    result.assets.map(async (asset, idx) => {
      const exifTaken =
        parseExifDateTimeOriginal(
          (asset.exif as Record<string, unknown> | undefined)?.DateTimeOriginal as string | undefined,
        );
      const clamp = clampOccurredAtToTrip({
        occurredAt: exifTaken ?? new Date().toISOString(),
        tripStartDate: trip.startDate,
        tripEndDate: trip.endDate,
      });
      if (clamp.clamped) anyClamped = true;
      if (!earliest || clamp.occurredAt < earliest) earliest = clamp.occurredAt;
      const photoId = Crypto.randomUUID();
      const localUri = await processAndPersistPhoto(asset.uri, photoId);
      return {
        localUri,
        sortOrder: idx,
        exifTakenAt: exifTaken,
      };
    }),
  );

  await journalPhotoEntries.createEntry({
    tripId: args.tripId,
    userId: me,
    occurredAt: earliest ?? new Date().toISOString(),
    caption: null,
    isPrivate: false,
    photos: photoRefs,
  });

  if (anyClamped) {
    Alert.alert(i18n.t('journal.outsideTripWarning'));
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors limited to VoiceRecordSheet (still missing) and any minor adjustments.

---

### Task 2.9: VoiceRecordSheet

**Files:**
- Create: `src/components/journal/VoiceRecordSheet.tsx`

- [ ] **Step 1: Implement the recording sheet**

```tsx
import { Audio } from 'expo-av';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import * as voiceClips from '@/db/queries/voiceClips';
import {
  createRecording,
  finishRecording,
  requestMicPermission,
} from '@/services/voiceClipService';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import * as Crypto from 'expo-crypto';

const MAX_SECONDS = 300;
const WARN_AT = MAX_SECONDS - 30;

interface Props {
  visible: boolean;
  tripId: string;
  dayDate: string;
  onDismiss: () => void;
  onSaved: () => void;
}

export function VoiceRecordSheet({ visible, tripId, dayDate, onDismiss, onSaved }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);
  const [finishedUri, setFinishedUri] = useState<string | null>(null);
  const [finishedDuration, setFinishedDuration] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setElapsed(0);
    setRecording(false);
    setFinishedUri(null);
    setFinishedDuration(0);
  }, [visible]);

  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        if (next >= MAX_SECONDS) {
          // Auto-stop at cap.
          void stop();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  async function start() {
    const granted = await requestMicPermission();
    if (!granted) return;
    const rec = await createRecording();
    recordingRef.current = rec;
    setRecording(true);
  }

  async function stop() {
    const rec = recordingRef.current;
    if (!rec) return;
    const tempId = Crypto.randomUUID();
    const result = await finishRecording(rec, tempId);
    recordingRef.current = null;
    setRecording(false);
    setFinishedUri(result.localUri);
    setFinishedDuration(result.durationSec);
  }

  async function save() {
    if (!finishedUri) return;
    const me = useAuthStore.getState().session?.user.id;
    if (!me) return;
    await voiceClips.createClip({
      tripId,
      userId: me,
      occurredAt: new Date().toISOString(),
      localUri: finishedUri,
      durationSec: finishedDuration,
      isPrivate: false,
    });
    onSaved();
  }

  function discard() {
    recordingRef.current = null;
    setFinishedUri(null);
    setFinishedDuration(0);
    setElapsed(0);
    setRecording(false);
    onDismiss();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={discard}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>
            {t('journal.recordingTitle')}
          </Text>
          <Text style={[styles.timer, { color: theme.text }]}>
            {formatSeconds(elapsed)} / {formatSeconds(MAX_SECONDS)}
          </Text>
          {elapsed >= WARN_AT && recording ? (
            <Text style={[styles.warn, { color: theme.danger }]}>
              {t('journal.recordingCapWarning', { seconds: MAX_SECONDS - elapsed })}
            </Text>
          ) : null}
          {!recording && !finishedUri ? (
            <Pressable
              onPress={start}
              style={({ pressed }) => [styles.recBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={[theme.danger, theme.accent]} style={StyleSheet.absoluteFill} />
              <Text style={styles.recLabel}>●</Text>
            </Pressable>
          ) : null}
          {recording ? (
            <Pressable onPress={stop} style={[styles.stopBtn, { borderColor: theme.danger }]}>
              <Text style={[styles.stopLabel, { color: theme.danger }]}>{t('journal.stopRecording')}</Text>
            </Pressable>
          ) : null}
          {finishedUri ? (
            <View style={styles.actions}>
              <Pressable
                onPress={discard}
                style={[styles.actionBtn, { borderColor: theme.border }]}
              >
                <Text style={[styles.actionLabel, { color: theme.text }]}>
                  {t('journal.discardRecording')}
                </Text>
              </Pressable>
              <Pressable
                onPress={save}
                style={[styles.actionBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}
              >
                <Text style={[styles.actionLabel, { color: '#fff' }]}>
                  {t('journal.saveRecording')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function formatSeconds(s: number): string {
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  timer: { fontSize: 32, fontWeight: '800', marginVertical: 16 },
  warn: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  recBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginVertical: 16,
  },
  recLabel: { color: '#fff', fontSize: 36 },
  stopBtn: { paddingVertical: 12, paddingHorizontal: 28, borderRadius: 16, borderWidth: 2, marginVertical: 16 },
  stopLabel: { fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  actionBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 14, borderWidth: 1 },
  actionLabel: { fontSize: 14, fontWeight: '700' },
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit (Tasks 2.5 + 2.6 + 2.7 + 2.8 + 2.9 together — they only ship as a unit)**

`/commit-commands:commit`:

```
Today timeline screen with photo pick and voice record capture

DayNav + DaySummaryCard + interleaved timeline of photo/voice/expense rows.
FAB action sheet offers Add photos (multi-pick with EXIF clamp),
Record voice (5-min cap with warning + save/discard), Add expense (routes
to the existing screen with today's date pre-filled).
```

---

### Task 2.10: transcribe-voice Edge Function

**Files:**
- Create: `supabase/functions/transcribe-voice/index.ts`
- Create: `supabase/functions/transcribe-voice/validation.ts`
- Create: `supabase/functions/transcribe-voice/validation.test.ts`

- [ ] **Step 1: Write failing tests for validation.ts**

```ts
// supabase/functions/transcribe-voice/validation.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { parseRequestBody } from './validation.ts';

Deno.test('parseRequestBody: accepts valid voice_clip_id', () => {
  assertEquals(
    parseRequestBody({ voice_clip_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }),
    { voice_clip_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
  );
});

Deno.test('parseRequestBody: rejects missing / non-UUID', () => {
  assertEquals(parseRequestBody({}), null);
  assertEquals(parseRequestBody({ voice_clip_id: 'notauuid' }), null);
  assertEquals(parseRequestBody({ voice_clip_id: 123 }), null);
  assertEquals(parseRequestBody(null), null);
});
```

- [ ] **Step 2: Implement validation.ts**

```ts
// supabase/functions/transcribe-voice/validation.ts

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TranscribeRequest {
  voice_clip_id: string;
}

export function parseRequestBody(raw: unknown): TranscribeRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const id = (raw as Record<string, unknown>).voice_clip_id;
  if (typeof id !== 'string' || !UUID_RE.test(id)) return null;
  return { voice_clip_id: id };
}
```

- [ ] **Step 3: Run tests, confirm pass**

```bash
cd supabase/functions/transcribe-voice
deno test validation.test.ts
```

Expected: 2 PASS.

- [ ] **Step 4: Implement index.ts**

```ts
// transcribe-voice Edge Function
//
// Fetches an audio clip from R2 (via service-role) and posts it to OpenAI
// Whisper, then writes the transcript back to the voice_clips row. The
// client invokes this fire-and-forget after pushChanges completes the row
// upload to Postgres.

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
    console.error('transcribe-voice: missing env vars');
    return errorResponse('Server misconfigured', 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Missing Authorization header', 401);

  let raw: unknown;
  try { raw = await req.json(); } catch { return errorResponse('Invalid JSON', 400); }
  const body = parseRequestBody(raw);
  if (!body) return errorResponse('Invalid request', 400);

  // Auth + trip-member gate.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return errorResponse('Invalid JWT', 401);

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
  if (clipRow.duration_sec > MAX_SECONDS) return errorResponse('Clip too long', 400);

  const isMember = await checkTripMembership(adminClient, clipRow.trip_id, userData.user.id);
  if (!isMember) return errorResponse('Not a trip member', 403);

  // Mark processing — idempotent.
  await adminClient
    .from('voice_clips')
    .update({ transcript_status: 'processing', transcript_error: null })
    .eq('id', body.voice_clip_id);

  try {
    // Fetch audio from R2 server-side.
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

    // Whisper.
    const form = new FormData();
    form.append('file', new Blob([audioBytes], { type: 'audio/mp4' }), `${clipRow.id}.m4a`);
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
      .update({ transcript_status: 'failed', transcript_error: errMsg.slice(0, 500) })
      .eq('id', body.voice_clip_id);
    return jsonResponse({ status: 'failed', error: errMsg }, 200);
  }
});

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
  const { data: ownerRow } = await adminClient
    .from('trips')
    .select('id')
    .eq('id', tripId)
    .eq('owner_id', userId)
    .maybeSingle();
  return !!ownerRow;
}
```

- [ ] **Step 5: Deploy and smoke**

```bash
npx supabase functions deploy transcribe-voice --project-ref <project-ref>
```

Record a clip in the app → confirm:
1. `voice_clips.transcript_status` flips to `'processing'` then `'done'`.
2. `voice_clips.transcript` populates.
3. Realtime propagates the update to other devices.

If a clip fails, the row shows `'failed'` and the UI's "Re-transcribe" button re-invokes the function.

- [ ] **Step 6: Commit**

`/commit-commands:commit`:

```
Add transcribe-voice Edge Function (server-side Whisper)

JWT + trip-membership gate. Fetches audio from R2 with service-role
credentials, posts to OpenAI Whisper (whisper-1, json), writes the
transcript back. Flips voice_clips.transcript_status pending → processing
→ done|failed; failed clips store the error message for diagnostics.
```

---

**Phase 2 complete.** The Journal tab is wired: open it, see Today's timeline + summary card + chapter view toggle, capture photos & voice, see voice transcripts roll in via Realtime. Editing affordances and the chapter view's full implementation come next.

---

## Phase 3 — Chapter view + editing flows

### Task 3.1: ChapterView (All-days list)

**Files:**
- Modify: `src/components/journal/ChapterView.tsx`
- Create: `src/components/journal/DayCard.tsx`
- Create: `src/hooks/useDaySummaries.ts`

- [ ] **Step 1: useDaySummaries hook**

`src/hooks/useDaySummaries.ts`:

```ts
import { useEffect, useState } from 'react';

import * as journalDays from '@/db/queries/journalDays';
import { useAuthStore } from '@/stores/authStore';
import type { DaySummary } from '@/types/journal';

export function useDaySummaries(tripId: string): { summaries: DaySummary[]; reload: () => Promise<void>; isLoading: boolean } {
  const me = useAuthStore((s) => s.session?.user.id ?? '');
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = async () => {
    if (!tripId || !me) return;
    setIsLoading(true);
    try {
      const rows = await journalDays.listDaySummaries(tripId, me);
      setSummaries(rows);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, me]);

  return { summaries, reload, isLoading };
}
```

- [ ] **Step 2: DayCard component**

`src/components/journal/DayCard.tsx`:

```tsx
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useSignedJournalPhotoUrl } from '@/hooks/useSignedJournalPhotoUrl';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { DaySummary } from '@/types/journal';
import { formatCurrency } from '@/utils/currency';
import { formatReadableDate } from '@/utils/date';

interface Props {
  summary: DaySummary;
  homeCurrency: string;
  onPress: () => void;
}

export function DayCard({ summary, homeCurrency, onPress }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const heroUrl = useSignedJournalPhotoUrl(summary.coverStoragePath);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && { transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={styles.hero}>
        {heroUrl ? (
          <Image source={{ uri: heroUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[theme.accentSoft, theme.surface]}
            style={StyleSheet.absoluteFillObject}
          />
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: theme.text }]}>
          {t('journal.dayOfTotal', { n: summary.dayIndex, total: '–' })}
        </Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>
          {formatReadableDate(summary.dayDate)}{summary.effectiveLocation ? ` · ${summary.effectiveLocation}` : ''}
        </Text>
        <View style={styles.chips}>
          <Chip text={`📸 ${summary.photoCount}`} />
          <Chip text={`🎤 ${summary.voiceCount}`} />
          <Chip text={formatCurrency(summary.totalConvertedAmount, homeCurrency)} />
        </View>
      </View>
    </Pressable>
  );
}

function Chip({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: theme.accentSoft }]}>
      <Text style={[styles.chipText, { color: theme.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  hero: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden' },
  info: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700' },
  meta: { fontSize: 10, fontWeight: '500', marginTop: 2 },
  chips: { flexDirection: 'row', gap: 4, marginTop: 6, flexWrap: 'wrap' },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 9, fontWeight: '600' },
});
```

- [ ] **Step 3: Replace the stub ChapterView**

`src/components/journal/ChapterView.tsx`:

```tsx
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { useDaySummaries } from '@/hooks/useDaySummaries';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useTripsStore } from '@/stores/tripsStore';

import { DayCard } from './DayCard';

interface Props {
  tripId: string;
  onPickDay: (dayDate: string) => void;
}

export function ChapterView({ tripId, onPickDay }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const trip = useTripsStore((s) => s.trips.find((tr) => tr.id === tripId) ?? null);
  const { summaries, isLoading } = useDaySummaries(tripId);

  if (!trip) return null;

  return (
    <FlatList
      data={summaries}
      keyExtractor={(s) => s.dayDate}
      renderItem={({ item }) => (
        <DayCard
          summary={item}
          homeCurrency={trip.homeCurrency}
          onPress={() => onPickDay(item.dayDate)}
        />
      )}
      ListEmptyComponent={
        isLoading ? null : (
          <Text style={[styles.empty, { color: theme.textMuted }]}>{t('journal.emptyDay')}</Text>
        )
      }
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
```

- [ ] **Step 4: Wire `onPickDay` in `journal.tsx`**

Update the `JournalScreen` body so picking a day switches to Today mode AND sets the dayDate. Modify `journal.tsx` to hoist `dayDate` state:

```tsx
const [mode, setMode] = useState<Mode>('today');
const [dayDate, setDayDate] = useState<string>(todayISO());

// pass dayDate + setDayDate into both views
<TodayView tripId={tripId} dayDate={dayDate} setDayDate={setDayDate} />
// ...
<ChapterView tripId={tripId} onPickDay={(d) => { setDayDate(d); setMode('today'); }} />
```

Then update `TodayView`'s props to accept the controlled dayDate + setter, instead of owning state locally. Adjust accordingly.

- [ ] **Step 5: Type-check and visual test**

```bash
npx tsc --noEmit
npx expo start --android
```

Expected: tapping the "All days" toggle shows the day list; tapping a card jumps to the Today view for that date.

- [ ] **Step 6: Commit**

`/commit-commands:commit`:

```
ChapterView with DayCards, controlled day-date in JournalScreen

Day-date state lifts into JournalScreen so picking a card in All-days view
deep-links into Today view for that date. DayCard shows hero photo, day
index, date+location, and chips (photo/voice/total).
```

---

### Task 3.2: Long-press menu — delete, set-as-cover, edit timestamp

This is the per-row long-press handler that's been a `() => {}` placeholder in `TodayView`'s renderItem.

**Files:**
- Create: `src/components/journal/TimelineItemActions.tsx`
- Modify: `src/components/journal/TodayView.tsx`

- [ ] **Step 1: Build the actions sheet**

`src/components/journal/TimelineItemActions.tsx`:

```tsx
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { TimelineItem } from '@/utils/journalTimeline';

interface Props {
  item: TimelineItem | null;
  onDismiss: () => void;
  onEditTimestamp: () => void;
  onSetCover: () => void;
  onRetranscribe: () => void;
  onDelete: () => void;
}

export function TimelineItemActions({
  item, onDismiss, onEditTimestamp, onSetCover, onRetranscribe, onDelete,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  if (!item) return null;

  const showSetCover = item.kind === 'photo';
  const showRetranscribe = item.kind === 'voice';

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDismiss}>
      <Pressable onPress={onDismiss} style={styles.backdrop}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Row label="🕒 Edit time" onPress={onEditTimestamp} theme={theme} />
          {showSetCover ? <Row label={`⭐ ${t('journal.setAsCover')}`} onPress={onSetCover} theme={theme} /> : null}
          {showRetranscribe ? <Row label={`🔁 ${t('journal.retranscribe')}`} onPress={onRetranscribe} theme={theme} /> : null}
          <Row label="🗑 Delete" destructive onPress={onDelete} theme={theme} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ label, onPress, destructive, theme }: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Text style={{ fontSize: 15, color: destructive ? theme.danger : theme.text }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 16 },
  sheet: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, marginBottom: 80, paddingVertical: 8 },
  row: { paddingVertical: 14, paddingHorizontal: 18 },
});
```

- [ ] **Step 2: Wire the actions sheet into TodayView**

In `TodayView.tsx`, add state for `actionTarget: TimelineItem | null`. In `renderItem`, change each `onLongPress={() => {}}` to `onLongPress={() => setActionTarget(item)}`. After the FlatList, render:

```tsx
<TimelineItemActions
  item={actionTarget}
  onDismiss={() => setActionTarget(null)}
  onEditTimestamp={() => {
    if (!actionTarget) return;
    setEditingTimestampFor(actionTarget);
    setActionTarget(null);
  }}
  onSetCover={async () => {
    if (!actionTarget || actionTarget.kind !== 'photo') return;
    await journalDays.setCoverPhotoEntry(tripId, dayDate, actionTarget.id);
    setActionTarget(null);
    await summary.reload();
  }}
  onRetranscribe={async () => {
    if (!actionTarget || actionTarget.kind !== 'voice') return;
    await supabase.functions.invoke('transcribe-voice', { body: { voice_clip_id: actionTarget.id } });
    setActionTarget(null);
  }}
  onDelete={async () => {
    if (!actionTarget) return;
    if (actionTarget.kind === 'photo') {
      await journalPhotoEntries.softDeleteEntry(actionTarget.id);
    } else if (actionTarget.kind === 'voice') {
      await voiceClips.softDeleteClip(actionTarget.id);
    } else {
      await expenseQueries.softDeleteExpense(actionTarget.id);
    }
    setActionTarget(null);
    await reloadTimeline();
    await summary.reload();
  }}
/>
```

Add the necessary imports (`supabase` from `@/services/supabase`, etc.). Add `editingTimestampFor` state and the corresponding picker (next step).

- [ ] **Step 3: Time picker for timestamp edits**

Create `src/components/journal/TimestampEditor.tsx`:

```tsx
import DateTimePicker from '@react-native-community/datetimepicker';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  initialISO: string | null;
  onSave: (iso: string) => void;
  onDismiss: () => void;
}

export function TimestampEditor({ initialISO, onSave, onDismiss }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  if (!initialISO) return null;
  const initial = new Date(initialISO);
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDismiss}>
      <Pressable onPress={onDismiss} style={styles.backdrop}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <DateTimePicker
            value={initial}
            mode="time"
            display="spinner"
            onChange={(_, date) => {
              if (date) {
                const next = new Date(initial);
                next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                onSave(next.toISOString());
              }
            }}
          />
          <Pressable onPress={onDismiss} style={[styles.btn, { backgroundColor: theme.accent }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{t('common.save')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  sheet: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16, alignItems: 'center' },
  btn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, marginTop: 12 },
});
```

Check if `@react-native-community/datetimepicker` is installed:
```bash
npx grep "datetimepicker" package.json
```
If missing:
```bash
npx expo install @react-native-community/datetimepicker
```

- [ ] **Step 4: Wire TimestampEditor into TodayView**

```tsx
{editingTimestampFor ? (
  <TimestampEditor
    initialISO={
      editingTimestampFor.kind === 'expense'
        ? `${editingTimestampFor.expense.expenseDate}T${editingTimestampFor.expense.expenseTime}Z`
        : editingTimestampFor.occurredAt.toISOString()
    }
    onSave={async (iso) => {
      const target = editingTimestampFor;
      setEditingTimestampFor(null);
      if (target.kind === 'photo') {
        await journalPhotoEntries.updateEntryOccurredAt(target.id, iso);
      } else if (target.kind === 'voice') {
        await voiceClips.updateClipOccurredAt(target.id, iso);
      } else {
        // Expense: split into expense_date / expense_time
        const d = new Date(iso);
        const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
        await expenseQueries.updateExpense({ id: target.id, expenseTime: time });
      }
      await reloadTimeline();
    }}
    onDismiss={() => setEditingTimestampFor(null)}
  />
) : null}
```

- [ ] **Step 5: Type-check and manual test**

```bash
npx tsc --noEmit
npx expo start --android
```

Confirm long-press on any timeline row → menu; tapping "Edit time" → time picker → save updates the row.

- [ ] **Step 6: Commit**

`/commit-commands:commit`:

```
Long-press actions on timeline rows + timestamp editor

Per-row action sheet: edit time (all kinds), set-as-cover (photos only),
re-transcribe (voice only), delete. Cover override + manual time edits
write directly to the underlying tables; delete soft-deletes. Re-transcribe
re-invokes transcribe-voice for the selected clip.
```

---

### Task 3.3: TranscriptEditor (full-screen transcript edit)

**Files:**
- Create: `src/components/journal/TranscriptEditor.tsx`
- Modify: `src/components/journal/TodayView.tsx` (wire `onOpenTranscript`)

- [ ] **Step 1: Build the editor**

`src/components/journal/TranscriptEditor.tsx`:

```tsx
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useVoiceClipPlayback } from '@/hooks/useVoiceClipPlayback';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { VoiceClip } from '@/types/voice';

interface Props {
  clip: VoiceClip | null;
  onSave: (transcript: string) => void;
  onDismiss: () => void;
}

export function TranscriptEditor({ clip, onSave, onDismiss }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [draft, setDraft] = useState(clip?.transcript ?? '');

  // We always need playback, but only when a clip is set. Hook order: declare
  // the hook unconditionally with a placeholder when clip is null.
  const placeholder: VoiceClip = clip ?? {
    id: '', tripId: '', userId: '', occurredAt: '', storagePath: '', localUri: null,
    durationSec: 0, transcript: null, transcriptStatus: 'done', transcriptError: null,
    isPrivate: false, createdAt: '', updatedAt: '', deletedAt: null,
  };
  const { isPlaying, toggle } = useVoiceClipPlayback(placeholder);
  if (!clip) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onDismiss}>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top','bottom']}>
        <View style={styles.header}>
          <Pressable onPress={onDismiss}>
            <Text style={{ color: theme.textMuted, fontSize: 16 }}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable onPress={() => onSave(draft.trim())}>
            <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '700' }}>{t('common.save')}</Text>
          </Pressable>
        </View>
        <View style={[styles.player, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Pressable
            onPress={toggle}
            style={[styles.playBtn, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.playBtnText}>{isPlaying ? '⏸' : '▶'}</Text>
          </Pressable>
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>{clip.durationSec}s</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { color: theme.text }]}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  player: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14, marginHorizontal: 16,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
  },
  playBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  playBtnText: { color: '#fff', fontSize: 14 },
  input: { fontSize: 16, lineHeight: 24, minHeight: 200, textAlignVertical: 'top' },
});
```

- [ ] **Step 2: Wire it from TodayView's VoiceClipRow**

In `TodayView.tsx`, add `editingTranscriptFor: VoiceClip | null` state. Change the row's `onOpenTranscript` to `onOpenTranscript={() => setEditingTranscriptFor(item.clip)}`. After the FlatList, render:

```tsx
<TranscriptEditor
  clip={editingTranscriptFor}
  onDismiss={() => setEditingTranscriptFor(null)}
  onSave={async (transcript) => {
    if (!editingTranscriptFor) return;
    const id = editingTranscriptFor.id;
    setEditingTranscriptFor(null);
    await voiceClips.updateClipTranscript(id, transcript.length === 0 ? null : transcript);
    await reloadTimeline();
  }}
/>
```

- [ ] **Step 3: Type-check & manual test**

Tap any voice row's transcript text → opens editor → audio plays/pauses → save persists.

- [ ] **Step 4: Commit**

`/commit-commands:commit`:

```
TranscriptEditor — full-screen edit with pinned audio player

Lets users clean up Whisper transcripts. Save writes voice_clips.transcript;
playback uses the same useVoiceClipPlayback hook as the timeline row.
```

---

### Task 3.4: Drag-reorder timeline items

Drag-reorder uses `react-native-draggable-flatlist`. If the project doesn't have it, install:

```bash
npx expo install react-native-draggable-flatlist react-native-gesture-handler react-native-reanimated
```

(`react-native-gesture-handler` and `react-native-reanimated` are likely already there.)

**Files:**
- Modify: `src/components/journal/TodayView.tsx`

- [ ] **Step 1: Swap FlatList for DraggableFlatList**

```tsx
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
// ... other imports

// Inside TodayView:
const [localOrder, setLocalOrder] = useState<TimelineItem[] | null>(null);
const renderRow = ({ item, drag, isActive }: RenderItemParams<TimelineItem>) => {
  // Long-press drives drag; on release, computeReorderTimestamp + save.
  // Use Pressable's onLongPress to invoke drag().
  if (item.kind === 'photo') {
    return (
      <PhotoEntryRow
        entry={{ ...item.entry, photos: item.photos }}
        onCaptionChange={/* ... */}
        onOpenPhoto={() => {}}
        onLongPress={drag}
      />
    );
  }
  // ... same shape for voice and expense, passing drag as onLongPress
};

const data = localOrder ?? items;

// In the render tree, replace FlatList with:
<DraggableFlatList
  data={data}
  keyExtractor={(it) => `${it.kind}-${it.id}`}
  renderItem={renderRow}
  onDragEnd={async ({ data: nextOrder, from, to }) => {
    if (from === to) return;
    setLocalOrder(nextOrder);
    const moved = nextOrder[to];
    const above = to > 0 ? nextOrder[to - 1] : null;
    const below = to < nextOrder.length - 1 ? nextOrder[to + 1] : null;
    const newIso = computeReorderTimestamp({ above, below });
    if (!newIso) return;
    if (moved.kind === 'photo') {
      await journalPhotoEntries.updateEntryOccurredAt(moved.id, newIso);
    } else if (moved.kind === 'voice') {
      await voiceClips.updateClipOccurredAt(moved.id, newIso);
    } else {
      const d = new Date(newIso);
      const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
      await expenseQueries.updateExpense({ id: moved.id, expenseTime: time });
    }
    await reloadTimeline();
    setLocalOrder(null);
  }}
  // ...rest (ListHeaderComponent, ListEmptyComponent, contentContainerStyle)
/>
```

Note: this replaces the long-press behavior for both drag AND the actions sheet. To keep both: use `react-native-draggable-flatlist`'s `activationDistance` prop, OR introduce a small "reorder mode" toggle, OR adopt the pattern of long-press = actions sheet, double-tap-and-hold = drag. Simplest for MVP: long-press starts drag; tap-and-hold longer (1s+) opens the actions sheet. Use a `<Pressable delayLongPress={700}>` wrapped around the row content, and call `drag()` on a `onTouchMove` after long-press, OR more practically, expose both via a small drag handle (a `≡` icon on each row).

Choose ONE of:
1. **Drag handle (recommended):** add a `≡` button on each row. Tap-and-hold the handle → drag. Long-press the row → actions sheet.
2. **Mode toggle:** a "Reorder" button in the header that flips the screen into drag mode; out of drag mode, long-press = actions.

Pick (1) for cleaner UX. Update each timeline row to take an optional `dragHandleProps` and render a small touch target that calls `drag()`.

- [ ] **Step 2: Implement drag handle on rows**

In each `PhotoEntryRow`, `VoiceClipRow`, `ExpenseTimelineRow`: add an optional prop `onDragStart?: () => void`. Render a small `≡` `Pressable` at the right edge of the row (mirrored to left in RTL via `flexDirection: 'row'`). Wire it: `<Pressable onLongPress={onDragStart} delayLongPress={250}><Text>≡</Text></Pressable>`.

In `TodayView`'s `renderRow`, pass `onDragStart={drag}` to each row variant.

Keep `onLongPress={() => setActionTarget(item)}` on the row body for the actions menu.

- [ ] **Step 3: Type-check and manual test**

```bash
npx tsc --noEmit
npx expo start --android
```

Confirm:
- Long-press the row body → actions sheet
- Long-press the `≡` handle → drag starts → drop in new position → row reorders, persists across pull-to-refresh

- [ ] **Step 4: Commit**

`/commit-commands:commit`:

```
Drag-reorder timeline items via per-row drag handle

react-native-draggable-flatlist with a ≡ handle on each row; row body's
long-press still opens the actions sheet. On drag-end, computeReorderTimestamp
computes the new midpoint and writes to the underlying table (no
manual_sort_index — the timestamp IS the order).
```

---

**Phase 3 complete.** Editing flows complete: drag-reorder, edit timestamp, edit caption (inline from Task 2.5), edit transcript, delete, set-as-cover. Chapter view (All-days) renders day cards with hero + counts and deep-links into Today.

---

## Phase 4 — AI integration

Extend the existing `ai-query` Edge Function so it includes photo captions and recent voice transcripts in the trip-context payload, unlocking journal-aware questions ("what did I say about the temple?").

### Task 4.1: Extend ai-query trip-context with journal data

**Files:**
- Modify: `supabase/functions/ai-query/index.ts` (the file that builds the context summary)

- [ ] **Step 1: Read the existing context-builder function**

```bash
npx grep -n "context" supabase/functions/ai-query/index.ts | head -40
```

Look for the function that builds the structured summary of the trip's data (members, categories, totals, places) into a string for the OpenAI prompt. Likely named something like `buildTripContext` or `getTripContext`.

- [ ] **Step 2: Add a journal-context fetcher**

Inside that function (or alongside it), add:

```ts
async function fetchJournalContext(
  adminClient: ReturnType<typeof createClient>,
  tripId: string,
  userId: string,
): Promise<{ captions: string[]; transcripts: Array<{ when: string; text: string }> }> {
  // Photo captions (non-private + own private)
  const { data: captionsRows } = await adminClient
    .from('journal_photo_entries')
    .select('caption, occurred_at, user_id, is_private')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .not('caption', 'is', null)
    .or(`is_private.eq.false,user_id.eq.${userId}`)
    .order('occurred_at', { ascending: true })
    .limit(200);

  const captions = (captionsRows ?? [])
    .map((r: { caption: string }) => r.caption)
    .filter((c): c is string => !!c && c.length > 0)
    .slice(0, 100); // hard cap on count

  // Voice transcripts (most-recent 30, only completed)
  const { data: transcriptRows } = await adminClient
    .from('voice_clips')
    .select('occurred_at, transcript, user_id, is_private')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .eq('transcript_status', 'done')
    .not('transcript', 'is', null)
    .or(`is_private.eq.false,user_id.eq.${userId}`)
    .order('occurred_at', { ascending: false })
    .limit(30);

  const transcripts = (transcriptRows ?? [])
    .map((r: { occurred_at: string; transcript: string }) => ({
      when: r.occurred_at,
      text: r.transcript,
    }))
    .filter((t) => t.text && t.text.length > 0);

  return { captions, transcripts };
}
```

- [ ] **Step 3: Splice the journal context into the prompt**

In the existing trip-context-string builder, after the existing sections (members, categories, totals, places), append:

```ts
const journal = await fetchJournalContext(adminClient, tripId, userId);

let journalText = '';
if (journal.captions.length > 0) {
  journalText += '\nPhoto captions:\n';
  journalText += journal.captions.map((c, i) => `  ${i + 1}. ${c}`).join('\n');
}

if (journal.transcripts.length > 0) {
  // Cap by characters so we don't blow the prompt budget. ~4000 tokens ≈ 16K chars.
  let used = 0;
  const lines: string[] = [];
  for (const t of journal.transcripts) {
    const line = `  - ${t.when.slice(0, 10)}: ${t.text}`;
    if (used + line.length > 16_000) break;
    lines.push(line);
    used += line.length;
  }
  journalText += '\nVoice notes (most recent first):\n';
  journalText += lines.join('\n');
  if (lines.length < journal.transcripts.length) {
    journalText += `\n  (${journal.transcripts.length - lines.length} earlier voice notes available in the Journal tab)`;
  }
}

contextString += journalText;
```

(Adapt variable names to the file's actual structure.)

- [ ] **Step 4: Deploy and test**

```bash
npx supabase functions deploy ai-query --project-ref <project-ref>
```

In the app, on a trip with at least one photo caption and one voice transcript, open the Ask tab and ask:
- "What did I say about [a topic from your transcripts]?"
- "What's the caption on the temple photo?"

Confirm the model answers using the new context.

- [ ] **Step 5: Commit**

`/commit-commands:commit`:

```
Extend ai-query trip context with photo captions + voice transcripts

Adds a journal-context section to the prompt the LLM sees:
- All non-empty photo captions (capped at 100, privacy-filtered)
- Most recent 30 voice transcripts (capped at ~16K chars, privacy-filtered)
Older content referenced as "N earlier voice notes available in the Journal
tab" so the model doesn't claim it has them.
```

---

**Phase 4 complete.** Ask AI is now journal-aware. No client changes were needed.

---

## Phase 5 — Cleanup

### Task 5.1: Retire `r2-photo-url` alias

Wait at least one production release after deploying the new client (Phase 0–4) before doing this — any user still on the previous version still calls `r2-photo-url`. Once telemetry confirms no traffic on the alias for 7 days (or you're confident every client has updated):

**Files:**
- Delete: `supabase/functions/r2-photo-url/`

- [ ] **Step 1: Confirm no recent invocations**

In Supabase dashboard → Edge Functions → r2-photo-url → Logs, scan the last 7 days. If invocation count is 0, proceed. Otherwise, wait another release cycle.

- [ ] **Step 2: Delete the directory and remove the deployed function**

```bash
git rm -r supabase/functions/r2-photo-url
npx supabase functions delete r2-photo-url --project-ref <project-ref>
```

- [ ] **Step 3: Type-check (in case any code still imports from the old path)**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

`/commit-commands:commit`:

```
Retire r2-photo-url Edge Function alias

All shipped clients now call r2-media-url directly. The back-compat
proxy is no longer reached and is deleted from both the repo and the
deployed Edge Function list.
```

---

## Self-Review

After writing the plan, scan for:

**Spec coverage:**
- [x] Journal tab as 5th tab between Map and Ask — Task 2.2
- [x] Today view + chapter view toggle — Task 2.3
- [x] Day summary card with hero/index/totals/counts/location — Task 2.4
- [x] Per-day timeline interleaving photo/voice/expense — Tasks 1.11, 2.5, 2.6
- [x] Multi-photo entry (2×2 grid + N more) — Task 2.5 (PhotoGrid)
- [x] Native gallery picker (multi-select) with EXIF + clamping — Tasks 1.12, 2.8
- [x] Voice record (expo-av) + 5-min cap — Tasks 1.9, 2.9
- [x] Whisper transcription via server-side Edge Function — Task 2.10
- [x] Per-item privacy flag — schema in Task 1.1, filters in Tasks 1.7, 1.11
- [x] R2 storage extension (`kind` discriminator, audio bucket) — Phase 0
- [x] Sync engine integration (push/pull/conflict resolve) — Tasks 1.4-1.6, 1.10
- [x] Drag-reorder (timestamp update, no manual_sort_index) — Task 3.4
- [x] Edit timestamp / caption / transcript / delete — Tasks 2.5, 3.2, 3.3
- [x] Cover photo override + day location — Tasks 2.4, 3.2 + 1.7e
- [x] AI integration — Phase 4
- [x] i18n + RTL (en+he parity, RTL FAB mirror) — Task 2.1
- [x] Out-of-trip-date photo clamp with toast — Task 1.12, 2.8

**Placeholder scan:** no TBD/TODO/fill-in markers found.

**Type consistency:** `JournalPhotoEntry` shape consistent across types/queries/UI; `VoiceClip.transcriptStatus` union matches DB CHECK constraint; `kind` discriminator (`expense-photo` | `journal-photo` | `voice-clip`) consistent across photoService, voiceClipService, and r2-media-url.

**Scope check:** the plan is large but coherent — every phase builds on the previous, with explicit commit-per-task checkpoints to keep PR-sized work manageable. Phase 0 stands alone (Edge Function generalization) and Phase 4 stands alone (LLM context extension); Phases 1-3 are tightly coupled by the data model.

**Ambiguity check:**
- Day boundary handling: spec uses local-timezone date; SQL queries use `SUBSTR(occurred_at, 1, 10)` which uses the ISO-8601 string's date portion. Documented in Task 1.7b's `listEntriesForDay` comment.
- Reorder tie-break: when neighbors collide on timestamp, `computeReorderTimestamp` adds +1s (documented in Task 1.11).
- Photo entry occurred_at when only some photos have EXIF: spec says "MIN(exif_taken_at) across the batch, fallback now". The photo pick orchestrator (Task 2.8) takes the earliest EXIF across the asset list, fall back to `now` if no asset has EXIF — implemented as `earliest = ...` accumulator.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-23-trip-journal.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**








