# Trip Journal — Design

**Status:** Approved, ready for implementation plan
**Author:** ilaylavy (with Claude)
**Date:** 2026-05-23
**Depends on:** `worktree-cloudflare-integration` (R2 photo storage) must be merged first. This spec assumes `r2-photo-url` Edge Function and the R2 image bucket are live in production.

---

## 1. Goal

Add a **Journal** layer to the travel-expenses app so a trip is documented as a time-ordered story — photos, voice notes, and expenses interleaved on a per-day timeline — not just a ledger.

This is an additive pivot: expense tracking, splitting, balances, map, and stats remain untouched. The Journal is a new 5th tab on the trip view.

## 2. Scope

In scope (MVP):

- **5th tab — 📖 Journal** sits between Map and Ask: `📋 Expenses · 📍 Map · 📖 Journal · 🧠 Ask · 📊 Stats`.
- **Today view** (default): day-summary header card + timeline of photos / voice / expenses interleaved by time, with day navigation.
- **All-days view**: chapter cards listing every day of the trip; tap a card → drill into that day's timeline.
- **Photo entries**: native gallery picker (multi-select). One pick → one timeline entry containing 1–N photo files.
- **Voice entries**: in-app recorder, 5-minute hard cap, server-side Whisper transcription, editable transcript.
- **Editing** the timeline: drag-reorder (long-press), edit timestamp, edit photo caption, edit voice transcript, delete.
- **Per-item privacy** in shared trips (mirrors `expenses.is_private`).
- **Day-level metadata**: cover photo override + manual location override.
- **AI integration**: photo captions and recent voice transcripts feed the existing `ai-query` Edge Function context.
- **Offline-first**: same posture as expenses — local SQLite write, sync queue, background upload + transcribe.

Out of scope (explicit in §17).

## 3. Architecture overview

```
┌─────────────────────────────┐    journal_photo_entries
│  Journal Tab (Today view)   │    journal_photos
│                             │    voice_clips
│  ┌───────────────────────┐  │ ─→ journal_days
│  │ Day summary card      │  │    (existing) expenses
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │    All read from local SQLite
│  │ Timeline (merged)     │  │    Privacy filtered: own OR not-private
│  │  – voice              │  │    Sorted by occurred_at / expense_time
│  │  – photo batch (1..N) │  │
│  │  – expense            │  │
│  │  – …                  │  │
│  └───────────────────────┘  │
│  [+] FAB → action sheet     │
└─────────────────────────────┘
           │
           │ writes via existing
           │ sync_queue invariant
           ▼
┌──────────────────────────────┐
│ Sync engine (unchanged)      │
│  push: 3 new apply funcs     │ ─→ Supabase Postgres + Realtime
│  pull: 3 new pull endpoints  │
│  R2: photoService + new      │ ─→ R2 buckets (images, audio)
│       voiceClipService       │
└──────────────────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Edge Functions               │
│  – r2-media-url (extended)   │ ─→ R2 PUT/GET/DELETE
│  – transcribe-voice (new)    │ ─→ OpenAI Whisper
│  – ai-query (extended)       │ ─→ OpenAI ChatCompletions
└──────────────────────────────┘
```

## 4. Data model

All tables follow existing conventions: UUID PK, `created_at` / `updated_at` / `deleted_at`, soft-delete everywhere, sync_queue entry on every mutation, RLS by trip membership.

### 4.1 `journal_photo_entries` — the timeline entry for a photo pick

A pick from the gallery (1–N photos) creates exactly one entry. The entry carries the timestamp and the caption.

```sql
CREATE TABLE public.journal_photo_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id),
  occurred_at  TIMESTAMPTZ NOT NULL,   -- earliest EXIF time across the batch, or now
  caption      TEXT,                    -- max 200 chars, UI-enforced
  is_private   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX idx_journal_photo_entries_trip_date
  ON public.journal_photo_entries(trip_id, occurred_at)
  WHERE deleted_at IS NULL;
```

### 4.2 `journal_photos` — file rows under an entry

```sql
CREATE TABLE public.journal_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      UUID NOT NULL REFERENCES public.journal_photo_entries(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,   -- R2 key: <tripId>/journal/<photoId>.jpg
  local_uri     TEXT,            -- pre-upload local file:// path
  sort_order    INTEGER NOT NULL DEFAULT 0,
  exif_taken_at TIMESTAMPTZ,     -- captured if present, used for entry occurred_at
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_journal_photos_entry ON public.journal_photos(entry_id);
```

A photo file is not soft-deleted independently — deletion of the parent entry cascades. (Same pattern as `expense_photos` today.)

### 4.3 `voice_clips`

```sql
CREATE TABLE public.voice_clips (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id           UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES public.profiles(id),
  occurred_at       TIMESTAMPTZ NOT NULL,
  storage_path      TEXT NOT NULL,        -- R2 key: <tripId>/<clipId>.m4a
  local_uri         TEXT,
  duration_sec      INTEGER NOT NULL CHECK (duration_sec BETWEEN 1 AND 300),
  transcript        TEXT,                  -- user-editable after Whisper writes initial value
  transcript_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (transcript_status IN ('pending','processing','done','failed')),
  transcript_error  TEXT,
  is_private        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_voice_clips_trip_date
  ON public.voice_clips(trip_id, occurred_at)
  WHERE deleted_at IS NULL;
```

### 4.4 `journal_days` — per-day metadata (lazy)

A row only exists once the user overrides cover or sets a location. Days with no row use computed defaults.

```sql
CREATE TABLE public.journal_days (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id               UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_date              DATE NOT NULL,
  location              TEXT,                                       -- NULL = auto-derive
  cover_photo_entry_id  UUID REFERENCES public.journal_photo_entries(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,
  UNIQUE(trip_id, day_date)
);

CREATE INDEX idx_journal_days_trip_date
  ON public.journal_days(trip_id, day_date)
  WHERE deleted_at IS NULL;
```

### 4.5 `expenses` — no schema change

Drag-reorder of an expense in the journal timeline directly updates `expense_time` (user explicitly OK'd this). No new column.

### 4.6 RLS

Identical pattern to existing tables: visible to trip members, write requires membership. `is_private` filter applied in queries, not RLS, so private rows are visible to the author across all clients.

```sql
-- Template for all four new tables (adapt name)
ALTER TABLE public.journal_photo_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trip members can view"   ON public.journal_photo_entries FOR SELECT
  USING (trip_id IN (SELECT id FROM public.trips WHERE owner_id = auth.uid()
                     UNION
                     SELECT trip_id FROM public.trip_members WHERE user_id = auth.uid()));
-- + INSERT/UPDATE/DELETE policies, same membership predicate
```

### 4.7 Local SQLite

Mirror of the four new tables. Plus new per-table apply functions registered in `src/sync/conflictResolver.ts`. `BOOL_FIELDS_BY_TABLE` in `src/sync/typeCoercion.ts` gets the new tables added (`is_private` keys).

## 5. Storage — R2

### 5.1 Buckets

- **`images-travel-expense-app`** (existing, EEUR) — both expense receipts and journal photos.
- **`audio-travel-expense-app`** (new, EEUR) — voice clips only.

### 5.2 Object keys

| Kind | Key pattern | Bucket |
|---|---|---|
| Expense receipt (existing) | `<tripId>/<expenseId>/<photoId>.jpg` | image |
| Journal photo (new) | `<tripId>/journal/<photoId>.jpg` | image |
| Voice clip (new) | `<tripId>/<clipId>.m4a` | audio |

### 5.3 Edge Function: `r2-media-url` (rename from `r2-photo-url`)

The existing function is renamed and extended. Request body gains `kind`:

```ts
type Kind = 'expense-photo' | 'journal-photo' | 'voice-clip';
type Op   = 'PUT' | 'GET' | 'DELETE';

// Request:
{ kind: Kind; path: string; op: Op }
```

Per-kind regex + bucket lookup:

| Kind | Path regex | Bucket env var |
|---|---|---|
| `expense-photo` | `^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$` | `R2_BUCKET_IMAGE` |
| `journal-photo` | `^[0-9a-f-]{36}/journal/[0-9a-f-]{36}\.jpg$` | `R2_BUCKET_IMAGE` |
| `voice-clip` | `^[0-9a-f-]{36}/[0-9a-f-]{36}\.m4a$` | `R2_BUCKET_AUDIO` |

JWT verification + trip-membership check unchanged (the trip_id is always the first path segment).

Presigned TTLs unchanged: PUT 5 min, GET 1 hr.

**Backward compatibility:** for one release, keep `r2-photo-url` as a thin alias that defaults `kind` to `'expense-photo'`. The cloudflare-integration client code keeps working without redeployment. After both clients have updated, retire the alias.

### 5.4 New secrets

- `R2_BUCKET_AUDIO` = `audio-travel-expense-app`

The existing R2 API token must be re-issued (or scope expanded) to cover the new bucket with `Object Read & Write`.

### 5.5 Bucket CORS

`PUT, GET` from app origins on both buckets; allowed header `Content-Type`.

## 6. Sync engine integration

No structural changes — sync queue, push, pull, conflict resolution all work the same way.

- **Per-table apply functions added** in `src/sync/conflictResolver.ts`: `journal_photo_entries`, `journal_photos`, `voice_clips`, `journal_days`.
- **Pull cursor:** four new tables added to the cursor-based pull cycle.
- **`enqueueSync`** writes a sync_queue row on every mutation in the new query files, same as today.

### 6.1 Voice clip upload + transcribe

1. User taps record → `expo-av` writes audio to a local file.
2. Local insert of `voice_clips` row: `local_uri = file://…`, `storage_path = ''`, `transcript_status = 'pending'`. sync_queue gets the create entry.
3. Sync push picks up the entry → `voiceClipService.uploadVoiceClipToStorage(...)` → R2 PUT → row updated with `storage_path`, push to Supabase.
4. After successful push, **fire-and-forget**: `supabase.functions.invoke('transcribe-voice', { body: { voice_clip_id } })`.
5. The transcribe function (§7) writes `transcript` and flips `transcript_status='done'`. Realtime pushes the update.

If offline at any step, the sync queue's existing retry handles it.

### 6.2 Photo batch upload

A `journal_photo_entries` row plus its `journal_photos` children are written together inside one local SQLite transaction. The sync_queue gets:
- One entry for the parent
- One entry per child (so each file is uploaded independently)

Sync push uploads photo files one at a time (existing R2 upload logic; each child fetches its own presigned URL). Entry pushes after all children's `storage_path` are filled.

## 7. New Edge Function: `transcribe-voice`

POST endpoint, JWT-authenticated.

**Request:** `{ voice_clip_id: string }`
**Response:** `{ status: 'done' | 'failed', transcript?: string, error?: string }`

**Flow:**
1. Validate JWT → `user_id`.
2. `select * from voice_clips where id = $1`. 404 if missing.
3. Trip-membership check on `voice_clips.trip_id` (reuse `app_private.is_trip_member`).
4. `update voice_clips set transcript_status = 'processing' where id = $1`.
5. Fetch audio bytes from R2 (server-side GET via `aws4fetch`, same pattern as `r2-media-url`'s DELETE).
6. POST to OpenAI Whisper (`/v1/audio/transcriptions`, model `whisper-1`, response_format `json`).
7. On success: `update voice_clips set transcript = $1, transcript_status = 'done', updated_at = now()`. Realtime broadcasts.
8. On failure: `update voice_clips set transcript_status = 'failed', transcript_error = $1`. No automatic retry — the UI surfaces a "Re-transcribe" affordance that re-invokes the function.

**Secrets needed:** `OPENAI_API_KEY` (existing), `R2_*` (existing).

**Privacy posture:** only audio bytes leave the server-side perimeter for OpenAI. No trip name, member names, or expense data is included. Symmetric with the existing `ai-query` posture.

## 8. UI structure

### 8.1 Navigation

Tab bar gains a new tab at position 3:

```
📋 Expenses · 📍 Map · 📖 Journal · 🧠 Ask · 📊 Stats
```

Tab order in `app/(main)/trip/[id]/(tabs)/_layout.tsx`.

### 8.2 New screen: `app/(main)/trip/[id]/(tabs)/journal.tsx`

Top-level structure:

```
┌──────────────────────────────┐
│ Header (← Journal ⋯)         │
├──────────────────────────────┤
│ [Today] [All days] toggle    │
├──────────────────────────────┤
│ Day nav (‹ Today, Mar 15 ›)  │ ← Today mode only
│ ──────────────────────────── │
│ Day summary card             │ ← Today mode only
│  ┌────────────────────────┐  │
│  │ Hero photo             │  │
│  │ Day 3 of 7 / Date      │  │
│  │ 📸 12 · 🎤 3 · 📋 4    │  │
│  │ Location               │  │
│  └────────────────────────┘  │
│ ──────────────────────────── │
│ Timeline items …             │ ← Today mode
│   OR                         │
│ Day cards stack …            │ ← All-days mode
└──────────────────────────────┘
[+] FAB (Today mode only)
```

### 8.3 Day summary card

- **Hero photo**: from `journal_days.cover_photo_entry_id` if set, else first photo of the day, else a default gradient placeholder. Tap → small "Tap to change cover" hint. Long-press any photo in the timeline → context menu with "Set as cover" → writes to `journal_days` (creates the row if absent).
- **Day index**: "Day 3 of 7" (computed from trip `start_date`, capped at trip length).
- **Date**: "Today · Mar 15, 2026" (today flag stripped on past days).
- **Total spend**: sum of that day's `expenses.converted_amount` in home currency. Honors `is_excluded_from_daily_metrics`. Hides private expenses of other members.
- **Counts**: 📸 photo entries · 🎤 voice clips · 📋 expenses, with privacy applied.
- **Location**: from `journal_days.location` if set; else most-frequent `expenses.place_name` for that date; else blank. Tap → inline text input, save on blur, long-press → "Use auto" to clear.

### 8.4 Today view — timeline rows

Three row variants share a left-side timestamp gutter (`HH:MM`).

**Photo entry row** — single photo: full-width image, 16:9 letterbox or natural aspect at max 220px height. Multi-photo: 2×2 grid (1:1 cells), last cell shows `+N` overlay when count > 4. Tap the grid → full-screen swipeable gallery (reuse existing `PhotoGalleryModal`). Caption text under the grid, editable inline.

**Voice clip row** — compact player: ▶/⏸ button, waveform proxy, duration. Below it, transcript preview (3 lines, with "Show more"). Tap the transcript → full-screen editor with the audio scrubber pinned. `transcript_status='processing'` → spinner + "Transcribing…". `transcript_status='failed'` → "Couldn't transcribe — tap to retry."

**Expense row** — compact: category emoji, note, amount (trip currency primary, home secondary). Tap → existing expense detail screen.

### 8.5 All-days view

A vertical stack of day cards (one per date in the trip's range, sorted descending: most recent first). Each card:
- Hero photo (same selection rule as the summary card)
- "Day N" label, date, optional location
- Chips: 📸 count · 🎤 count · trip-currency total

Tap → switches the toggle to "Today" and jumps to that date.

### 8.6 FAB action sheet

Tap the FAB → small action sheet anchored above it:
- 📸 **Add photos** → `pickPhotosFromLibrary()` → multi-select → one `journal_photo_entries` + N children. `occurred_at` = `MIN(exif_taken_at)` across the batch, fallback `now`. Out-of-trip-date photos clamped per §11.
- 🎤 **Record voice** → recording sheet (timer, stop button, 5-min cap). On stop → insert `voice_clips`, kick off upload + transcribe.
- 📋 **Add expense** → existing add-expense screen.

The FAB mirrors to bottom-left in RTL (same as existing Expenses-tab FAB).

## 9. Timeline merge algorithm

`src/utils/journalTimeline.ts`:

```ts
type TimelineItem =
  | { kind: 'photo'; id: string; occurredAt: Date; entry: PhotoEntry; photos: PhotoFile[]; userId: string; isPrivate: boolean }
  | { kind: 'voice'; id: string; occurredAt: Date; clip: VoiceClip; userId: string; isPrivate: boolean }
  | { kind: 'expense'; id: string; occurredAt: Date; expense: Expense; userId: string; isPrivate: boolean };

export async function getDayTimeline(
  tripId: string,
  dateISO: string,
  currentUserId: string,
): Promise<TimelineItem[]> {
  const [photoEntries, voiceClips, expenses] = await Promise.all([
    queries.journalPhotoEntries.forDay(tripId, dateISO, currentUserId),
    queries.voiceClips.forDay(tripId, dateISO, currentUserId),
    queries.expenses.forDay(tripId, dateISO, currentUserId),
  ]);
  return [...mapPhoto(photoEntries), ...mapVoice(voiceClips), ...mapExpense(expenses)]
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}
```

Each `forDay` query applies the privacy filter `(user_id = $current OR is_private = 0) AND deleted_at IS NULL`. Day boundary uses local date (the trip's intuitive timezone — same rule as today's expense grouping).

For expenses, `occurredAt = expense_date + expense_time`. Spread expenses appear once at `expense_date` (matches existing list behavior in `expenseGrouping.ts`).

### 9.1 Chapter view aggregate

Single per-trip query that returns one row per date with:
- `day_date`
- `photo_count`, `voice_count`, `expense_count` (all privacy-filtered)
- `total_converted_amount` (privacy + exclusion filtered)
- `cover_storage_path` — `COALESCE(journal_days.cover_photo_entry_id, first_photo_entry_for_day).first_photo.storage_path`
- `effective_location` — `COALESCE(journal_days.location, most_frequent_expense_place_name)`

Implemented as a single CTE in `src/db/queries/journalDays.ts`.

## 10. Editing flows

### 10.1 Drag-reorder
- Long-press any timeline item → enters drag mode (haptic via `expo-haptics`).
- Drop between two neighbors → new timestamp = midpoint of the two neighbors' timestamps.
- Drop above the first item → new timestamp = `firstItem.occurredAt - 60s`.
- Drop below the last item → `lastItem.occurredAt + 60s`.
- Drop in an empty day → no-op (no reorder possible).
- Saves one row update + one sync_queue entry on the moved row. The moved row's column depends on kind: `journal_photo_entries.occurred_at`, `voice_clips.occurred_at`, or `expenses.expense_time`.

### 10.2 Edit timestamp
- Tap an item's timestamp gutter → time-only picker (date stays in the current day).
- Save → updates the same column as drag-reorder. One row update, one sync entry.

### 10.3 Photo caption
- Inline editable text below the photo grid. 200-char UI cap. Blur saves to `journal_photo_entries.caption`.

### 10.4 Voice transcript edit
- Tap the transcript text → full-screen editor with audio player pinned at the top.
- Save → updates `voice_clips.transcript`. Does NOT re-run Whisper.
- "Re-transcribe" affordance separate, shown on `transcript_status='failed'` and via long-press menu otherwise.

### 10.5 Delete
- Swipe-left on any timeline item → confirm sheet → soft-delete.
- Photo entry: cascades to `journal_photos` children locally; R2 cleanup is async best-effort via `deletePhotoFromStorage` per child (existing pattern).
- Voice clip: soft-delete the row; R2 audio object cleaned via `r2-media-url` DELETE.
- Expense: existing soft-delete path (unchanged).

### 10.6 Cover photo override
- Long-press any photo in the timeline → context menu with "Set as cover for this day". Writes `journal_days.cover_photo_entry_id`, creating the row if absent.
- "Use first photo" option (visible when an override exists) → clears the override.

### 10.7 Day location edit
- Tap the location chip in the summary card → inline text input, save on blur to `journal_days.location` (create row if absent).
- Long-press → "Use auto location" → clears `location` back to NULL.

## 11. Photo import — out-of-trip-range clamp

When the user batch-picks photos whose EXIF dates fall outside the trip's `[start_date, end_date]`:

- The entry's `occurred_at` is **clamped** to the nearest trip boundary (`start_date` if too early, `end_date` if too late and trip ended).
- For ongoing trips (`end_date IS NULL`), only the lower bound clamps.
- Photos with no EXIF time use `now()`.
- After import, if any photo was clamped, show a one-time toast: *"Some photos were taken outside the trip dates — placed on the nearest day."* (i18n key `journal.outsideTripWarning`).

## 12. AI integration (Ask)

The existing `ai-query` Edge Function builds a structured trip-context summary from Postgres. Extend it to include:

- **Photo captions**: every non-null caption from `journal_photo_entries` for the trip, with `is_private` filter applied per the caller. Average ~30 chars × ≤50 captions ≈ 1.5K chars — included in full.
- **Voice transcripts**: most recent 30 transcripts where `transcript_status='done'`, capped at ~4000 tokens total. Older content referenced as "N earlier voice notes (see Journal tab)" so the LLM doesn't claim it has them.

Privacy applied identically to the existing expense-context filtering.

Caching: the context summary is re-built per query (existing pattern). No new caching layer.

New example questions the system should now answer:
- "What did I say about the temple visit?"
- "Which day was the best meal?"
- "Show me when I mentioned ramen."

## 13. i18n & RTL

### 13.1 Strings

All new strings written to both `src/i18n/locales/en.json` and `src/i18n/locales/he.json` at write time (per memory `feedback_i18n_hebrew_parity.md`). New top-level key `journal`:

```json
{
  "journal": {
    "title": "Journal",
    "toggleToday": "Today",
    "toggleAllDays": "All days",
    "dayOfTotal": "Day {{n}} of {{total}}",
    "totalToday": "total today",
    "addPhotos": "Add photos",
    "recordVoice": "Record voice",
    "addExpense": "Add expense",
    "photoCount_one": "{{count}} photo",
    "photoCount_other": "{{count}} photos",
    "captionPlaceholder": "Add caption…",
    "locationPlaceholder": "Add a place…",
    "useAutoLocation": "Use auto location",
    "setAsCover": "Set as cover",
    "useFirstPhotoAsCover": "Use first photo",
    "transcribing": "Transcribing…",
    "transcribeFailed": "Couldn't transcribe — tap to retry",
    "retranscribe": "Re-transcribe",
    "deleteItemConfirm": "Delete this item?",
    "emptyDay": "Nothing logged on this day yet.",
    "outsideTripWarning": "Some photos were taken outside the trip dates — placed on the nearest day.",
    "recordingCapWarning": "Recording will stop in {{seconds}}s",
    "recordingStartHint": "Tap to start recording"
  }
}
```

### 13.2 RTL

- Toggle, timeline rows, summary card, photo grid, FAB sheet — all use `flexDirection: 'row'` (auto-mirrors). No hardcoded `left`/`right` positions or margins.
- FAB mirrors to bottom-left in RTL (existing pattern from the Expenses FAB).
- Voice waveform / scrubber stays LTR semantically inside the player — audio is time-linear regardless of locale (matches YouTube's RTL behavior).
- Caption and transcript text inputs inherit RTL when Hebrew is active.

## 14. Migration plan

Phased. Each phase ships independently and is reversible.

**Phase 0 — pre-flight.** R2 audio bucket provisioned; R2 token re-issued to cover both buckets; `R2_BUCKET_AUDIO` secret set; `r2-media-url` Edge Function deployed (with backward-compatible `r2-photo-url` alias). `ai-query` Edge Function deployed with the journal-context extension behind a feature flag that defaults off (so it has no effect until phase 4).

**Phase 1 — data layer.**
- SQL migration: `001_journal.sql` creates all 4 tables + RLS policies.
- Local SQLite mirror migration.
- New query files: `journalPhotoEntries.ts`, `journalPhotos.ts`, `voiceClips.ts`, `journalDays.ts`.
- New `voiceClipService.native.ts` and `voiceClipService.web.ts`.
- Per-table apply funcs in `conflictResolver.ts`; pull cursor extended.
- Unit tests for `journalTimeline.ts`, clamping logic, location resolution.

**Phase 2 — Journal tab + Today view.**
- New screen `app/(main)/trip/[id]/(tabs)/journal.tsx`.
- Tab layout updated.
- Day summary card, timeline rows (photo/voice/expense), FAB action sheet.
- Photo pick → entry creation → upload via R2.
- Voice record → upload → transcribe (transcribe function deployed in this phase).
- Manual e2e on Android.

**Phase 3 — All-days view, editing.**
- Chapter view aggregate query + day cards.
- Drag-reorder, timestamp edit, caption, transcript edit, delete.
- Cover override + location override.

**Phase 4 — AI integration.**
- Flip the feature flag on `ai-query` to include journal context.
- No client changes; LLM now answers journal-aware questions.

**Phase 5 — retire backwards-compat.** Drop the `r2-photo-url` alias after one production release on the new client.

## 15. Testing

### Unit
- `journalTimeline.ts`: merges + sorts correctly across all three sources; privacy filter respected.
- Location resolution: manual override > most-frequent place_name > blank.
- Cover resolution: override > first-photo > placeholder.
- Out-of-trip-date clamp: 3 cases (too early, too late, ongoing trip ignores upper bound).
- Drag-reorder timestamp math: midpoint, top edge, bottom edge, empty day.
- Whisper response shape parsing.

### Integration / Edge Function (Deno test)
- `r2-media-url` with each kind: PUT/GET/DELETE on valid paths, 400 on bad paths, 403 on non-member.
- `transcribe-voice`: 404 on missing row, 403 on non-member, success path mocks Whisper, failure path sets `transcript_status='failed'`.
- `ai-query` extension: journal context included; token cap honored.

### Manual e2e
- Multi-photo pick on native and web → entry appears in Today view → photo grid renders → upload completes → opens in full-screen gallery.
- Voice record → transcript appears via Realtime → edit transcript → save persists → close app, reopen, transcript still there.
- Drag-reorder: long-press, drop, item visibly reorders, refresh confirms persistence.
- Shared trip: member A creates private photo → member B doesn't see it → A sees it.
- Offline: record voice → quit airplane mode → see clip upload + transcribe.

## 16. Risks

- **Whisper cost creep** if voice usage is heavy. Mitigation: 5-min cap per clip; per-user daily cap can be added later if needed.
- **R2 outage** breaks photo/voice upload + read. Sync queue retries on upload; reads degrade to local copies on the recording device. Acceptable.
- **Transcribe function timeout** for max-length clips. Whisper handles 25MB / ~25 min — well above our 5-min cap. Edge Function default 30s timeout is safe at 5 min audio.
- **Photo batch partial upload failure** — one child fails after others succeed. Sync queue retries the failed child; entry remains visible (just with one fewer photo until retry). Acceptable.
- **EXIF time wrong / missing** → entry lands at `now`. User can edit via timestamp picker.
- **Realtime miss for transcript update** — user sees "Transcribing…" stuck. Mitigation: pull cycle picks up missed updates; "Re-transcribe" is the manual escape valve.

## 17. Out of scope (explicit MVP cuts)

- Video clips
- Voice clips longer than 5 minutes
- Cross-day reorganization (must edit timestamp manually)
- Auto-detected day-level location (we only support manual + most-frequent expense place)
- Trip-level cover page / chapter title page
- PDF export, shareable journal link, public sharing
- AI-generated daily summaries ("Today in review")
- Comments / reactions between trip members
- Draft state (picks and recordings save immediately)
- EXIF GPS coordinates (only EXIF timestamp is used)
- Server-side image transforms / thumbnails (resize stays client-side, 2000px wide, 80% JPEG)
- Background-noise-resistant transcription / speaker diarization
- Per-photo captions inside a batch (caption is per-batch only)

## 18. Open questions

None blocking. The R2 audio bucket and token re-issue are the only manual steps the user must do in the Cloudflare dashboard before the implementation plan runs.
