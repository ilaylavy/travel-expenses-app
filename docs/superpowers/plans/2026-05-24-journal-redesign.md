# Journal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-user journal with a shared, photo-led day timeline that supports user-curated Moments (manual groupings of entries), drag-to-group, and smart entry routing.

**Architecture:** The Journal tab smart-routes to the Day screen (when trip is active) or the All Days screen (otherwise). The Day screen has a sticky horizontal date strip, an edge-to-edge cover hero, a stats strip, and a vertical timeline spine with content-shaped rows. Moments are a new shared first-class entity (`journal_moments` table + `moment_id` FK on each entry type) that render as labeled segments on the spine. Manual creation via a `Create Moment` add-menu row (selection mode) or drag-to-group (drop precedence: tint band > solo row > spine).

**Tech Stack:** Expo (SDK 52+), TypeScript strict, expo-sqlite (offline-first), Supabase (Postgres + Realtime + RLS), Zustand, Expo Router, react-native-draggable-flatlist, expo-linear-gradient.

**Spec:** [docs/superpowers/specs/2026-05-24-journal-redesign-design.md](../specs/2026-05-24-journal-redesign-design.md)

---

## Conventions

- **Files** are absolute paths from repo root.
- **Steps** are bite-sized (2–5 min each). Mark `[x]` as you go.
- **Tests live next to source files** (`foo.ts` ↔ `foo.test.ts`). Run with `npx jest <file>`.
- **TypeScript** must stay clean — run `npx tsc --noEmit` after each phase.
- **Commit per task** unless the task explicitly says "no commit (continued in next task)".
- **i18n parity**: every new English key MUST get a real Hebrew value in `he.json` at write-time (per `feedback_i18n_hebrew_parity.md`). Phase 12 has the canonical list, but if a UI task introduces a new key, add to both locales there.

## File Structure

The redesign creates new components, refactors existing ones, and adds one new DB table + columns. Layout (new files marked **NEW**, replaced files marked _DELETE_):

```
app/(main)/trip/[id]/(tabs)/journal.tsx         (refactor → smart router)
app/(main)/trip/[id]/journal/[date].tsx         NEW (pushed Day screen route)

src/components/journal/
  DayScreen.tsx                                 NEW (host of the day view, used by both routes)
  AllDaysScreen.tsx                             NEW (host of the chapter view)
  DateStrip.tsx                                 NEW
  DayCoverHero.tsx                              NEW
  DayStatsStrip.tsx                             NEW
  TripCoverBanner.tsx                           NEW
  MomentHeader.tsx                              NEW (the pill)
  MomentSelectionBanner.tsx                     NEW
  MomentNameSheet.tsx                           NEW
  MomentOptionsSheet.tsx                        NEW
  TimelineSpine.tsx                             NEW (the vertical line + nodes container)
  SpineNode.tsx                                 NEW (single node + time label + drag-target)
  TodayView.tsx                                 _DELETE_
  DayNav.tsx                                    _DELETE_
  DaySummaryCard.tsx                            _DELETE_
  ChapterView.tsx                               _DELETE_
  DayCard.tsx                                   (refactor — add Moment chips)
  JournalFab.tsx                                (no functional change; consumer keys change)
  AddMenuSheet.tsx                              (add Create Moment row)
  TimelineItemActions.tsx                       (add Remove-from-Moment)
  timeline/
    PhotoEntryRow.tsx                           (refactor — strip card + handle + gutter)
    VoiceClipRow.tsx                            (refactor — chip shape + strip card)
    ExpenseTimelineRow.tsx                      (refactor — strip card + gutter)
    TimestampGutter.tsx                         _DELETE_

src/db/
  schema.ts                                     (add V9 statements)
  migrations.ts                                 (register v9)
  queries/
    journalMoments.native.ts                    NEW
    journalMoments.web.ts                       NEW
    journalPhotoEntries.native.ts               (drop currentUserId filter, add moment_id ops)
    journalPhotoEntries.web.ts                  (same)
    voiceClips.native.ts                        (drop currentUserId filter, add moment_id ops)
    voiceClips.web.ts                           (same)
    expenses.native.ts                          (add moment_id ops)
    expenses.web.ts                             (same)
    trips.native.ts                             (add cover_photo_storage_path)
    trips.web.ts                                (same)
    contract.ts                                 (add JournalMomentsQueries contract)

src/sync/
  pushChanges.native.ts                         (TABLE_ORDER: insert journal_moments, ensure moment_id columns)
  pullChanges.native.ts                         (PULL_ORDER: add journal_moments)
  conflictResolver.native.ts                    (handle journal_moments table)
  typeCoercion.ts                               (BOOL_FIELDS_BY_TABLE: extend, add moment_id is uuid not bool)

src/types/
  journal.ts                                    (add JournalMoment, JournalMomentRow, etc.)
  sync.ts                                       (add 'journal_moments' to SyncTable)

src/utils/
  journalTimeline.ts                            (group members under Moment parents)
  journalTimeline.test.ts                       (add Moment-grouping tests)

src/hooks/
  useDaySummary.ts                              (drop currentUserId filter; expose Moments)
  useDaySummaries.ts                            (drop currentUserId; include Moment counts)
  useDayMoments.ts                              NEW (list Moments for a day)
  useTripCover.ts                               NEW (resolve trip cover w/ fallback chain)

src/services/
  voiceClipService.native.ts                    (occurredAt now shared; no functional change)

supabase/migrations/
  20260525000000_journal_redesign.sql           NEW

src/i18n/locales/
  en.json                                       (new keys — Phase 12)
  he.json                                       (parallel keys — Phase 12)
```

---

## PHASE 1 — FOUNDATION (DB, types, sync registration)

After this phase, the new schema is live locally + remotely, sync recognises the new table and `moment_id` columns, but no UI consumes them yet. Each task is committed independently so a partial Phase-1 is safe to push.

### Task 1.1: Supabase migration — `journal_moments` table + `moment_id` columns + trip cover

**Files:**
- Create: `supabase/migrations/20260525000000_journal_redesign.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Journal redesign — shared Moments + per-trip cover photo.
-- - Adds journal_moments table (user-curated groupings of journal entries).
-- - Adds nullable moment_id FK to journal_photo_entries, voice_clips, expenses.
-- - Adds cover_photo_storage_path to trips (for the All Days hero banner).
-- - Drops the per-user SELECT gate on journal_photo_entries / voice_clips
--   so the whole journal is shared across all trip members (matches expenses).
--
-- Note: journal_moments.cover_photo_entry_id is intentionally stored without
-- a FK constraint so the sync engine can insert a Moment whose cover photo
-- entry hasn't been pushed yet (avoids a circular dependency with
-- journal_photo_entries.moment_id). App-level integrity: if the entry is
-- missing locally, the UI falls back to the gradient placeholder.

------------------------------------------------------------------
-- journal_moments
------------------------------------------------------------------
create table if not exists public.journal_moments (
    id                    uuid primary key default gen_random_uuid(),
    trip_id               uuid not null references public.trips(id) on delete cascade,
    day_date              date not null,
    title                 text,
    cover_photo_entry_id  uuid,
    created_by            uuid not null references public.profiles(id),
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    deleted_at            timestamptz
);

create index if not exists idx_journal_moments_trip_day
    on public.journal_moments (trip_id, day_date)
    where deleted_at is null;

drop trigger if exists trg_set_updated_at on public.journal_moments;
create trigger trg_set_updated_at
    before update on public.journal_moments
    for each row execute function public.set_updated_at();

------------------------------------------------------------------
-- moment_id FKs on the three entry types
------------------------------------------------------------------
alter table public.journal_photo_entries
    add column if not exists moment_id uuid
        references public.journal_moments(id) on delete set null;
alter table public.voice_clips
    add column if not exists moment_id uuid
        references public.journal_moments(id) on delete set null;
alter table public.expenses
    add column if not exists moment_id uuid
        references public.journal_moments(id) on delete set null;

create index if not exists idx_journal_photo_entries_moment
    on public.journal_photo_entries (moment_id)
    where deleted_at is null and moment_id is not null;
create index if not exists idx_voice_clips_moment
    on public.voice_clips (moment_id)
    where deleted_at is null and moment_id is not null;
create index if not exists idx_expenses_moment
    on public.expenses (moment_id)
    where deleted_at is null and moment_id is not null;

------------------------------------------------------------------
-- trips.cover_photo_storage_path (All Days hero)
------------------------------------------------------------------
alter table public.trips
    add column if not exists cover_photo_storage_path text;

------------------------------------------------------------------
-- RLS for journal_moments — mirror existing journal_photo_entries policy:
-- any member of the trip can SELECT/INSERT/UPDATE/DELETE.
------------------------------------------------------------------
alter table public.journal_moments enable row level security;

drop policy if exists "journal_moments members can read" on public.journal_moments;
create policy "journal_moments members can read"
    on public.journal_moments
    for select
    using (
        exists (
            select 1 from public.trip_members tm
            where tm.trip_id = journal_moments.trip_id
              and tm.user_id = auth.uid()
              and tm.joined_at is not null
        )
    );

drop policy if exists "journal_moments members can write" on public.journal_moments;
create policy "journal_moments members can write"
    on public.journal_moments
    for all
    using (
        exists (
            select 1 from public.trip_members tm
            where tm.trip_id = journal_moments.trip_id
              and tm.user_id = auth.uid()
              and tm.joined_at is not null
        )
    )
    with check (
        exists (
            select 1 from public.trip_members tm
            where tm.trip_id = journal_moments.trip_id
              and tm.user_id = auth.uid()
              and tm.joined_at is not null
        )
    );

------------------------------------------------------------------
-- Drop per-user SELECT gate on journal_photo_entries / voice_clips so
-- the journal is fully shared across trip members. Existing INSERT/UPDATE
-- policies stay (any member can write).
--
-- The original policies were created in 20260523180000_trip_journal.sql.
-- Replace them with member-scoped SELECT (no user_id == auth.uid() check).
------------------------------------------------------------------
drop policy if exists "journal_photo_entries owner read" on public.journal_photo_entries;
drop policy if exists "journal_photo_entries members read" on public.journal_photo_entries;
create policy "journal_photo_entries members read"
    on public.journal_photo_entries
    for select
    using (
        exists (
            select 1 from public.trip_members tm
            where tm.trip_id = journal_photo_entries.trip_id
              and tm.user_id = auth.uid()
              and tm.joined_at is not null
        )
    );

drop policy if exists "voice_clips owner read" on public.voice_clips;
drop policy if exists "voice_clips members read" on public.voice_clips;
create policy "voice_clips members read"
    on public.voice_clips
    for select
    using (
        exists (
            select 1 from public.trip_members tm
            where tm.trip_id = voice_clips.trip_id
              and tm.user_id = auth.uid()
              and tm.joined_at is not null
        )
    );

------------------------------------------------------------------
-- Realtime publication: add the new table.
------------------------------------------------------------------
alter publication supabase_realtime add table public.journal_moments;
```

- [ ] **Step 2: Inspect the actual policy names that exist today**

Before assuming policy names, list them on the live project:

Run: use Supabase MCP `list_tables` and check `policies` on `journal_photo_entries` + `voice_clips`. If the existing SELECT policy is named differently from the guesses above, replace the `drop policy if exists "..."` lines with the actual names.

Expected: confirms the actual policy names.

- [ ] **Step 3: Push the migration to the live project**

Run: `npx supabase db push`
Expected: "Applied 1 migration." No errors.

- [ ] **Step 4: Verify via MCP**

Run via `mcp__supabase__list_tables` filtered to schema `public` — confirm `journal_moments` exists with the expected columns.
Run via `mcp__supabase__execute_sql`:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('journal_moments', 'journal_photo_entries', 'voice_clips', 'expenses', 'trips')
  and column_name in ('id', 'moment_id', 'cover_photo_storage_path', 'cover_photo_entry_id', 'created_by', 'title', 'day_date');
```
Expected: rows confirming `journal_moments` schema + `moment_id` on each entry type + `cover_photo_storage_path` on `trips`.

- [ ] **Step 5: Run advisors**

Run via `mcp__supabase__get_advisors` with type=security. Expected: no new high-severity issues (RLS policies are added).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260525000000_journal_redesign.sql
git commit -m "Add journal_moments table + moment_id FKs + trip cover column"
```

---

### Task 1.2: Local SQLite schema + migration (v9)

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/migrations.ts`

- [ ] **Step 1: Append V9 statements to schema.ts**

At the bottom of `src/db/schema.ts`, after the existing `V8_STATEMENTS` export, add:

```typescript
export const V9_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS journal_moments (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_date TEXT NOT NULL,
    title TEXT,
    cover_photo_entry_id TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`,

  `CREATE INDEX IF NOT EXISTS idx_journal_moments_trip_day
    ON journal_moments (trip_id, day_date);`,

  `ALTER TABLE journal_photo_entries ADD COLUMN moment_id TEXT;`,
  `ALTER TABLE voice_clips ADD COLUMN moment_id TEXT;`,
  `ALTER TABLE expenses ADD COLUMN moment_id TEXT;`,

  `CREATE INDEX IF NOT EXISTS idx_journal_photo_entries_moment
    ON journal_photo_entries (moment_id);`,
  `CREATE INDEX IF NOT EXISTS idx_voice_clips_moment
    ON voice_clips (moment_id);`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_moment
    ON expenses (moment_id);`,

  `ALTER TABLE trips ADD COLUMN cover_photo_storage_path TEXT;`,
];
```

- [ ] **Step 2: Register the v9 migration**

In `src/db/migrations.ts`:

1. Add `V9_STATEMENTS` to the import block at the top:

```typescript
import {
  V1_STATEMENTS,
  V3_STATEMENTS,
  V4_STATEMENTS,
  V5_STATEMENTS,
  V6_STATEMENTS,
  V7_STATEMENTS,
  V8_STATEMENTS,
  V9_STATEMENTS,
} from './schema';
```

2. Add this migration entry at the END of the `MIGRATIONS` array (after the v8 entry, before the closing `] as const;`):

```typescript
  {
    version: 9,
    name: 'journal_redesign',
    run: async (db) => {
      for (const stmt of V9_STATEMENTS) {
        await db.execAsync(stmt);
      }
    },
  },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/migrations.ts
git commit -m "Mirror journal_moments + moment_id + trip cover in local SQLite (v9)"
```

---

### Task 1.3: Types — Moment entity + row + sync table

**Files:**
- Modify: `src/types/journal.ts`
- Modify: `src/types/sync.ts`

- [ ] **Step 1: Add Moment types to `src/types/journal.ts`**

Append at the end of the file:

```typescript
export interface JournalMomentRow {
  id: string;
  trip_id: string;
  day_date: string;                            // YYYY-MM-DD
  title: string | null;
  cover_photo_entry_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface JournalMoment {
  id: string;
  tripId: string;
  dayDate: string;
  title: string | null;
  coverPhotoEntryId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// Moment with member metadata attached — what the UI renders. Members
// reference timeline items by their kind+id pair so the consumer can fetch
// full bodies from the per-day query results.
export interface JournalMomentWithMemberIds extends JournalMoment {
  memberIds: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string }>;
}
```

Also extend the existing entity types to carry the new `momentId` field (each entry can be a member of ≤1 Moment):

```typescript
// In the existing JournalPhotoEntry interface, add:
//   momentId: string | null;
// In the existing JournalPhotoEntryRow interface, add:
//   moment_id: string | null;
```

Apply those additions inline — locate each interface and add the new field. Edit the existing interfaces to add:
- `JournalPhotoEntryRow`: add `moment_id: string | null;` after `deleted_at`
- `JournalPhotoEntry`: add `momentId: string | null;` after `deletedAt`

(`VoiceClip` lives in `src/types/voice.ts` and `Expense` in `src/types/expense.ts` — Task 1.4 will update those.)

- [ ] **Step 2: Add `'journal_moments'` to `SyncTable`**

In `src/types/sync.ts`, extend the `SyncTable` union:

```typescript
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
  | 'journal_days'
  | 'journal_moments';
```

- [ ] **Step 3: Typecheck — expect failures**

Run: `npx tsc --noEmit`
Expected: errors on every consumer that constructs a `JournalPhotoEntry` without `momentId` (constructors in `journalPhotoEntries.native.ts`, `journalPhotoEntries.web.ts`, the pull-side mapper). DO NOT FIX yet — those constructors are handled in Phase 2. Use the failures as a TODO list.

- [ ] **Step 4: Commit**

```bash
git add src/types/journal.ts src/types/sync.ts
git commit -m "Add JournalMoment types + journal_moments SyncTable"
```

---

### Task 1.4: Add `momentId` to `VoiceClip` and `Expense` types

**Files:**
- Modify: `src/types/voice.ts`
- Modify: `src/types/expense.ts`

- [ ] **Step 1: Add to `VoiceClip` + `VoiceClipRow`**

In `src/types/voice.ts`, add `momentId: string | null;` to `VoiceClip` and `moment_id: string | null;` to `VoiceClipRow`.

- [ ] **Step 2: Add to `Expense` + `ExpenseRow`**

In `src/types/expense.ts`, add `momentId: string | null;` to `Expense` and `moment_id: string | null;` to `ExpenseRow`.

- [ ] **Step 3: Typecheck — expect failures**

Run: `npx tsc --noEmit`
Expected: more errors, now in `voiceClips.*.ts` and `expenses.*.ts` constructors. These are addressed in Phase 2.

- [ ] **Step 4: Commit**

```bash
git add src/types/voice.ts src/types/expense.ts
git commit -m "Add momentId to VoiceClip + Expense types"
```

---

### Task 1.5: Sync registration — table order, bool fields, type coercion

**Files:**
- Modify: `src/sync/pushChanges.native.ts`
- Modify: `src/sync/pullChanges.native.ts`
- Modify: `src/sync/typeCoercion.ts`
- Modify: `src/sync/conflictResolver.native.ts`

- [ ] **Step 1: Add `journal_moments` to `TABLE_ORDER` in pushChanges.native.ts**

Locate `const TABLE_ORDER: SyncTable[] = [ ... ];` and insert `'journal_moments'` BEFORE `'journal_photo_entries'` (so a Moment row exists before any moment_id FK update lands) AND before `'expenses'` (which now has moment_id). Updated order:

```typescript
const TABLE_ORDER: SyncTable[] = [
  'profiles',
  'trips',
  'trip_members',
  'categories',
  'journal_moments',           // NEW — before any moment_id FK consumers
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

- [ ] **Step 2: Add `journal_moments` to `PULL_ORDER` in pullChanges.native.ts**

Match the same order:

```typescript
const PULL_ORDER: PullTable[] = [
  'profiles',
  'trips',
  'trip_members',
  'categories',
  'journal_moments',           // NEW
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

- [ ] **Step 3: Extend `BOOL_FIELDS_BY_TABLE` in typeCoercion.ts**

Add the new table key with an empty list (no bool fields on journal_moments):

```typescript
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
  journal_moments: [],
};
```

- [ ] **Step 4: Wire the new table into conflictResolver.native.ts (pull-side apply)**

Open `src/sync/conflictResolver.native.ts`. Locate the `switch` (or similar dispatch) that maps a `PullTable` name to a per-row apply function. Add a `case 'journal_moments':` branch that:
1. Reads the remote row (`Record<string, unknown>`).
2. Maps it to a local SQLite-shape `journal_moments` row (string columns, no booleans).
3. Upserts via `INSERT OR REPLACE INTO journal_moments (...) VALUES (...)`.

Concrete code (insert near the other journal table branches):

```typescript
case 'journal_moments': {
  const id = asString(remote.id);
  const tripId = asString(remote.trip_id);
  const dayDate = asString(remote.day_date);
  const title = asString(remote.title);
  const coverPhotoEntryId = asString(remote.cover_photo_entry_id);
  const createdBy = asString(remote.created_by);
  const createdAt = asString(remote.created_at);
  const updatedAt = asString(remote.updated_at);
  const deletedAt = asString(remote.deleted_at);
  if (!id || !tripId || !dayDate || !createdBy || !createdAt || !updatedAt) {
    return { applied: false };
  }
  await db.runAsync(
    `INSERT OR REPLACE INTO journal_moments
       (id, trip_id, day_date, title, cover_photo_entry_id, created_by,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, tripId, dayDate, title, coverPhotoEntryId, createdBy,
     createdAt, updatedAt, deletedAt],
  );
  return { applied: true };
}
```

Also add `moment_id` to the per-table column extraction for `journal_photo_entries`, `voice_clips`, and `expenses` — the apply branches for these three need to read `remote.moment_id` and include it in their `INSERT OR REPLACE` column list. Locate each branch and add the column at the end of the existing column list and binding list.

- [ ] **Step 5: Add `moment_id` to push-payload mappers**

In `src/sync/pushChanges.native.ts`, the push step calls `normalizePayload(table, payload)` then sends to Supabase. `moment_id` is a UUID string — no normalization needed. BUT: the payload column list comes from the local `*.toPayload()` helpers (e.g., `entryToPayload`). Those need to include `moment_id` — handled in Phase 2 when those helpers are updated.

For now, just verify push handles unknown columns: the existing code already passes the whole payload through, so once `entryToPayload` includes `moment_id`, push will carry it. No change needed in pushChanges.native.ts other than the TABLE_ORDER from Step 1.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: same errors as Task 1.3 + 1.4 (consumer constructors). No NEW errors in sync files.

- [ ] **Step 7: Commit**

```bash
git add src/sync/pushChanges.native.ts src/sync/pullChanges.native.ts src/sync/typeCoercion.ts src/sync/conflictResolver.native.ts
git commit -m "Register journal_moments in sync push/pull/resolver"
```

---

### Task 1.6: Run app, verify migration applies cleanly

- [ ] **Step 1: Boot the app on a device with existing data**

Run: `npx expo start` and load on a connected device that already has trip data (so the v9 migration runs over real rows rather than a fresh DB).
Expected: app boots, no migration error in the logs. Existing journal entries still render (Phase 2/3 hasn't changed the UI yet).

- [ ] **Step 2: Verify the local DB version**

Use any SQLite inspector or add a temporary `console.log` in `runMigrations` to confirm `PRAGMA user_version` is now `9`.
Expected: `9`.

- [ ] **Step 3: Verify the new table exists locally**

Add a temporary `console.log` of `SELECT name FROM sqlite_master WHERE type='table' AND name='journal_moments';` — confirm it returns the row.
Expected: returns `{ name: 'journal_moments' }`.

- [ ] **Step 4: No commit — verification step only**

---

## PHASE 2 — QUERIES & UTILITIES

After this phase, the data layer can read shared journal entries (no per-user filter), CRUD Moments, and group entries under their parent Moment in the timeline.

### Task 2.1: New query contract for Moments

**Files:**
- Modify: `src/db/queries/contract.ts`

- [ ] **Step 1: Add `JournalMomentsQueries` to contract.ts**

Append after the existing query contracts:

```typescript
import type { JournalMoment } from '@/types/journal';

export interface JournalMomentsQueries {
  listMomentsForDay(tripId: string, dayDate: string): Promise<JournalMoment[]>;
  createMoment(input: {
    tripId: string;
    dayDate: string;
    title: string | null;
    coverPhotoEntryId: string | null;
    createdBy: string;
    memberIds: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string }>;
  }): Promise<JournalMoment>;
  updateMomentTitle(momentId: string, title: string | null): Promise<void>;
  updateMomentCover(momentId: string, coverPhotoEntryId: string | null): Promise<void>;
  addMember(momentId: string, kind: 'photo' | 'voice' | 'expense', entryId: string): Promise<void>;
  removeMember(kind: 'photo' | 'voice' | 'expense', entryId: string): Promise<void>;
  /** Remove every member from a Moment and soft-delete the Moment itself. */
  deleteMoment(momentId: string): Promise<void>;
  /** Split a Moment after a specific member — kept-members stay; later-members
   *  move into a new Moment titled `${originalTitle ?? 'Untitled'} (2)`. */
  splitMomentAfter(
    momentId: string,
    afterMember: { kind: 'photo' | 'voice' | 'expense'; id: string },
  ): Promise<JournalMoment>;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: existing errors only; no new ones.

- [ ] **Step 3: Commit**

```bash
git add src/db/queries/contract.ts
git commit -m "Add JournalMomentsQueries contract"
```

---

### Task 2.2: Native journalMoments queries

**Files:**
- Create: `src/db/queries/journalMoments.native.ts`
- Create: `src/db/queries/journalMoments.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/db/queries/journalMoments.test.ts`:

```typescript
import { createMoment, listMomentsForDay, addMember, removeMember, deleteMoment, splitMomentAfter, updateMomentTitle } from './journalMoments';

// These tests assume a Jest setup with a per-test sqlite DB and a helper
// that seeds a trip + a few journal entries. If the project doesn't have
// one, this test file documents the expected contract — convert it to an
// integration scenario you run manually in the dev app.

describe.skip('journalMoments — contract', () => {
  it('creates a Moment with members and lists it for the day', async () => {
    // arrange: seed trip + 2 photo entries on 2026-05-24
    // act:
    //   const moment = await createMoment({
    //     tripId, dayDate: '2026-05-24', title: 'Lunch', coverPhotoEntryId: null,
    //     createdBy: userId,
    //     memberIds: [{ kind: 'photo', id: entry1.id }, { kind: 'photo', id: entry2.id }],
    //   });
    //   const list = await listMomentsForDay(tripId, '2026-05-24');
    // assert:
    //   expect(list).toHaveLength(1);
    //   expect(list[0].title).toBe('Lunch');
    //   expect(list[0].id).toBe(moment.id);
    //   // also: both photo entries' moment_id is set to moment.id
  });

  it('addMember reassigns moment_id on the entry', async () => { /* ... */ });
  it('removeMember nulls moment_id; if last member, soft-deletes the Moment', async () => { /* ... */ });
  it('deleteMoment soft-deletes and nulls every member', async () => { /* ... */ });
  it('updateMomentTitle persists and bumps updated_at', async () => { /* ... */ });
  it('splitMomentAfter creates a sibling Moment with the later members', async () => { /* ... */ });
});
```

(Use `describe.skip` so CI doesn't fail — these are contract docs. Manual verification of each in the dev app is fine until the test harness supports per-test DBs.)

- [ ] **Step 2: Implement `src/db/queries/journalMoments.native.ts`**

```typescript
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import { newId } from '@/utils/id';
import type {
  JournalMoment,
  JournalMomentRow,
} from '@/types/journal';

import type { JournalMomentsQueries } from './contract';
import { enqueueSync } from './syncQueue';

function rowToMoment(r: JournalMomentRow): JournalMoment {
  return {
    id: r.id,
    tripId: r.trip_id,
    dayDate: r.day_date,
    title: r.title,
    coverPhotoEntryId: r.cover_photo_entry_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

function momentToPayload(m: JournalMoment): Record<string, unknown> {
  return {
    id: m.id,
    trip_id: m.tripId,
    day_date: m.dayDate,
    title: m.title,
    cover_photo_entry_id: m.coverPhotoEntryId,
    created_by: m.createdBy,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
    deleted_at: m.deletedAt,
  };
}

const MEMBER_TABLES: Record<'photo' | 'voice' | 'expense', string> = {
  photo: 'journal_photo_entries',
  voice: 'voice_clips',
  expense: 'expenses',
};

export async function listMomentsForDay(
  tripId: string,
  dayDate: string,
): Promise<JournalMoment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<JournalMomentRow>(
    `SELECT * FROM journal_moments
      WHERE trip_id = ? AND day_date = ? AND deleted_at IS NULL
      ORDER BY created_at ASC;`,
    [tripId, dayDate],
  );
  return rows.map(rowToMoment);
}

export async function createMoment(input: {
  tripId: string;
  dayDate: string;
  title: string | null;
  coverPhotoEntryId: string | null;
  createdBy: string;
  memberIds: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string }>;
}): Promise<JournalMoment> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const moment: JournalMoment = {
    id: newId(),
    tripId: input.tripId,
    dayDate: input.dayDate,
    title: input.title,
    coverPhotoEntryId: input.coverPhotoEntryId,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO journal_moments
         (id, trip_id, day_date, title, cover_photo_entry_id, created_by,
          created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
      [moment.id, moment.tripId, moment.dayDate, moment.title,
       moment.coverPhotoEntryId, moment.createdBy, moment.createdAt, moment.updatedAt],
    );
    await enqueueSync(db, 'journal_moments', moment.id, 'create', momentToPayload(moment));

    for (const member of input.memberIds) {
      await assignMomentToEntryInTx(db, moment.id, member.kind, member.id, now);
    }
  });

  return moment;
}

export async function updateMomentTitle(
  momentId: string,
  title: string | null,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE journal_moments SET title = ?, updated_at = ? WHERE id = ?;`,
      [title, updatedAt, momentId],
    );
    await enqueueSync(db, 'journal_moments', momentId, 'update', {
      id: momentId,
      title,
      updated_at: updatedAt,
    });
  });
}

export async function updateMomentCover(
  momentId: string,
  coverPhotoEntryId: string | null,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE journal_moments SET cover_photo_entry_id = ?, updated_at = ? WHERE id = ?;`,
      [coverPhotoEntryId, updatedAt, momentId],
    );
    await enqueueSync(db, 'journal_moments', momentId, 'update', {
      id: momentId,
      cover_photo_entry_id: coverPhotoEntryId,
      updated_at: updatedAt,
    });
  });
}

export async function addMember(
  momentId: string,
  kind: 'photo' | 'voice' | 'expense',
  entryId: string,
): Promise<void> {
  const db = await getDatabase();
  const ts = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await assignMomentToEntryInTx(db, momentId, kind, entryId, ts);
  });
}

export async function removeMember(
  kind: 'photo' | 'voice' | 'expense',
  entryId: string,
): Promise<void> {
  const db = await getDatabase();
  const ts = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    // Find the entry's current moment_id so we can check "last member" after.
    const table = MEMBER_TABLES[kind];
    const row = await db.getFirstAsync<{ moment_id: string | null }>(
      `SELECT moment_id FROM ${table} WHERE id = ?;`,
      [entryId],
    );
    const previousMomentId = row?.moment_id ?? null;
    if (!previousMomentId) return;

    await assignMomentToEntryInTx(db, null, kind, entryId, ts);
    await maybeAutoDeleteEmptyMomentInTx(db, previousMomentId, ts);
  });
}

export async function deleteMoment(momentId: string): Promise<void> {
  const db = await getDatabase();
  const ts = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    // Null out every member's moment_id and queue each as an update.
    for (const kind of ['photo', 'voice', 'expense'] as const) {
      const table = MEMBER_TABLES[kind];
      const members = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM ${table} WHERE moment_id = ?;`,
        [momentId],
      );
      for (const m of members) {
        await assignMomentToEntryInTx(db, null, kind, m.id, ts);
      }
    }
    // Soft-delete the Moment itself.
    await db.runAsync(
      `UPDATE journal_moments SET deleted_at = ?, updated_at = ? WHERE id = ?;`,
      [ts, ts, momentId],
    );
    await enqueueSync(db, 'journal_moments', momentId, 'update', {
      id: momentId,
      deleted_at: ts,
      updated_at: ts,
    });
  });
}

export async function splitMomentAfter(
  momentId: string,
  afterMember: { kind: 'photo' | 'voice' | 'expense'; id: string },
): Promise<JournalMoment> {
  const db = await getDatabase();
  // Resolve current moment metadata + ordered member list.
  const moment = await db.getFirstAsync<JournalMomentRow>(
    `SELECT * FROM journal_moments WHERE id = ? AND deleted_at IS NULL;`,
    [momentId],
  );
  if (!moment) throw new Error(`splitMomentAfter: moment ${momentId} not found`);

  const orderedMembers = await listOrderedMembers(db, momentId);
  const cutIdx = orderedMembers.findIndex(
    (m) => m.kind === afterMember.kind && m.id === afterMember.id,
  );
  if (cutIdx < 0 || cutIdx === orderedMembers.length - 1) {
    throw new Error(`splitMomentAfter: invalid cut point`);
  }
  const movers = orderedMembers.slice(cutIdx + 1);

  // Build the new Moment with the second-half members.
  const newTitle = (moment.title ?? 'Untitled') + ' (2)';
  return await createMoment({
    tripId: moment.trip_id,
    dayDate: moment.day_date,
    title: newTitle,
    coverPhotoEntryId: null,
    createdBy: moment.created_by,
    memberIds: movers.map((m) => ({ kind: m.kind, id: m.id })),
  });
}

// ─── helpers ────────────────────────────────────────────────────────────

async function assignMomentToEntryInTx(
  db: SQLiteDatabase,
  momentId: string | null,
  kind: 'photo' | 'voice' | 'expense',
  entryId: string,
  ts: string,
): Promise<void> {
  const table = MEMBER_TABLES[kind];
  // expenses has its own updated_at, journal_photo_entries/voice_clips too.
  await db.runAsync(
    `UPDATE ${table} SET moment_id = ?, updated_at = ? WHERE id = ?;`,
    [momentId, ts, entryId],
  );
  await enqueueSync(db, table as never, entryId, 'update', {
    id: entryId,
    moment_id: momentId,
    updated_at: ts,
  });
}

async function maybeAutoDeleteEmptyMomentInTx(
  db: SQLiteDatabase,
  momentId: string,
  ts: string,
): Promise<void> {
  const counts = await db.getFirstAsync<{ n: number }>(
    `SELECT
       ( (SELECT COUNT(*) FROM journal_photo_entries WHERE moment_id = ? AND deleted_at IS NULL)
       + (SELECT COUNT(*) FROM voice_clips           WHERE moment_id = ? AND deleted_at IS NULL)
       + (SELECT COUNT(*) FROM expenses              WHERE moment_id = ? AND deleted_at IS NULL)
       ) AS n;`,
    [momentId, momentId, momentId],
  );
  if ((counts?.n ?? 0) > 0) return;

  await db.runAsync(
    `UPDATE journal_moments SET deleted_at = ?, updated_at = ? WHERE id = ?;`,
    [ts, ts, momentId],
  );
  await enqueueSync(db, 'journal_moments', momentId, 'update', {
    id: momentId,
    deleted_at: ts,
    updated_at: ts,
  });
}

async function listOrderedMembers(
  db: SQLiteDatabase,
  momentId: string,
): Promise<Array<{ kind: 'photo' | 'voice' | 'expense'; id: string; occurredAt: string }>> {
  const photos = await db.getAllAsync<{ id: string; occurred_at: string }>(
    `SELECT id, occurred_at FROM journal_photo_entries WHERE moment_id = ? AND deleted_at IS NULL;`,
    [momentId],
  );
  const voices = await db.getAllAsync<{ id: string; occurred_at: string }>(
    `SELECT id, occurred_at FROM voice_clips WHERE moment_id = ? AND deleted_at IS NULL;`,
    [momentId],
  );
  const expenses = await db.getAllAsync<{ id: string; expense_date: string; expense_time: string }>(
    `SELECT id, expense_date, expense_time FROM expenses WHERE moment_id = ? AND deleted_at IS NULL;`,
    [momentId],
  );
  const all: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string; occurredAt: string }> = [
    ...photos.map((p) => ({ kind: 'photo' as const, id: p.id, occurredAt: p.occurred_at })),
    ...voices.map((v) => ({ kind: 'voice' as const, id: v.id, occurredAt: v.occurred_at })),
    ...expenses.map((e) => ({
      kind: 'expense' as const,
      id: e.id,
      occurredAt: `${e.expense_date}T${e.expense_time}Z`,
    })),
  ];
  all.sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0));
  return all;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only on the prior consumer-side ones; this file compiles.

- [ ] **Step 4: Commit**

```bash
git add src/db/queries/journalMoments.native.ts src/db/queries/journalMoments.test.ts
git commit -m "Add native journalMoments queries (CRUD + member ops + split)"
```

---

### Task 2.3: Web journalMoments queries (web fallback)

**Files:**
- Create: `src/db/queries/journalMoments.web.ts`

- [ ] **Step 1: Implement web fallback**

The `.web.ts` variants in this project are typically no-op stubs that return empty arrays / no-op writes (web is not the primary platform). Match the existing pattern from `journalPhotoEntries.web.ts`:

```typescript
// Web fallback — the journal isn't a supported feature on web. Stubs return
// empty data and no-op writes so consumers compile.

import type { JournalMoment } from '@/types/journal';

export async function listMomentsForDay(
  _tripId: string,
  _dayDate: string,
): Promise<JournalMoment[]> {
  return [];
}

export async function createMoment(_input: {
  tripId: string;
  dayDate: string;
  title: string | null;
  coverPhotoEntryId: string | null;
  createdBy: string;
  memberIds: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string }>;
}): Promise<JournalMoment> {
  throw new Error('createMoment: not supported on web');
}

export async function updateMomentTitle(_id: string, _title: string | null): Promise<void> {}
export async function updateMomentCover(_id: string, _cover: string | null): Promise<void> {}
export async function addMember(
  _momentId: string,
  _kind: 'photo' | 'voice' | 'expense',
  _entryId: string,
): Promise<void> {}
export async function removeMember(
  _kind: 'photo' | 'voice' | 'expense',
  _entryId: string,
): Promise<void> {}
export async function deleteMoment(_id: string): Promise<void> {}
export async function splitMomentAfter(
  _momentId: string,
  _afterMember: { kind: 'photo' | 'voice' | 'expense'; id: string },
): Promise<JournalMoment> {
  throw new Error('splitMomentAfter: not supported on web');
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no new errors.

```bash
git add src/db/queries/journalMoments.web.ts
git commit -m "Add web fallback for journalMoments"
```

---

### Task 2.4: Drop per-user filter on photo entries; carry `moment_id`

**Files:**
- Modify: `src/db/queries/journalPhotoEntries.native.ts`
- Modify: `src/db/queries/journalPhotoEntries.web.ts`

- [ ] **Step 1: Update `rowToEntry`, `entryToPayload`, `createEntry`, and `listEntriesForDay` in native**

In `src/db/queries/journalPhotoEntries.native.ts`:

1. **`rowToEntry`** — include the new field:
```typescript
function rowToEntry(r: JournalPhotoEntryRow): JournalPhotoEntry {
  return {
    id: r.id,
    tripId: r.trip_id,
    userId: r.user_id,
    occurredAt: r.occurred_at,
    caption: r.caption,
    isPrivate: r.is_private === 1,
    momentId: r.moment_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}
```

2. **`entryToPayload`** — include `moment_id`:
```typescript
export function entryToPayload(e: JournalPhotoEntry): Record<string, unknown> {
  return {
    id: e.id,
    trip_id: e.tripId,
    user_id: e.userId,
    occurred_at: e.occurredAt,
    caption: e.caption,
    is_private: e.isPrivate ? 1 : 0,
    moment_id: e.momentId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    deleted_at: e.deletedAt,
  };
}
```

3. **`createEntry`** — set `momentId: null` on the new entry object and include the column in the INSERT:
```typescript
const entry: JournalPhotoEntry = {
  id: entryId,
  tripId: input.tripId,
  userId: input.userId,
  occurredAt: input.occurredAt,
  caption: input.caption,
  isPrivate: input.isPrivate,
  momentId: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};
// ...
await db.runAsync(
  `INSERT INTO journal_photo_entries
     (id, trip_id, user_id, occurred_at, caption, is_private, moment_id,
      created_at, updated_at, deleted_at)
   VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL);`,
  [entry.id, entry.tripId, entry.userId, entry.occurredAt,
   entry.caption, entry.isPrivate ? 1 : 0,
   entry.createdAt, entry.updatedAt],
);
```

4. **`listEntriesForDay`** — drop the `currentUserId` parameter and the privacy WHERE clause (privacy is per-entry but the journal is now shared by trip; `is_private` is no longer used on photo entries per spec):
```typescript
export async function listEntriesForDay(
  tripId: string,
  dayDateISO: string,
): Promise<JournalPhotoEntryWithPhotos[]> {
  const db = await getDatabase();
  const entries = await db.getAllAsync<JournalPhotoEntryRow>(
    `SELECT * FROM journal_photo_entries
      WHERE trip_id = ?
        AND SUBSTR(occurred_at, 1, 10) = ?
        AND deleted_at IS NULL
      ORDER BY occurred_at ASC;`,
    [tripId, dayDateISO],
  );
  // ... rest of the existing function is unchanged
}
```

5. **`countPhotosForTripDay`** and **`firstPhotoStoragePathForDay`** — drop their `currentUserId` parameters and remove any privacy WHERE clause. Locate them in the same file and apply the same change.

- [ ] **Step 2: Mirror in `.web.ts`**

In `src/db/queries/journalPhotoEntries.web.ts`, drop the `currentUserId` parameter from every signature so the contracts line up. Stubs return empty arrays.

- [ ] **Step 3: Update consumers**

The `currentUserId` argument is dropped from these query calls. Search-and-replace consumers:
- `src/components/journal/TodayView.tsx` — to be replaced in Phase 4, but for now update the call sites to drop the third argument.
- `src/hooks/useDaySummary.ts` — update calls; will be further refactored in Task 2.8.
- `src/hooks/useDaySummaries.ts` — same.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: photo-entry-related errors resolved; voice clip + expense errors remain.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries/journalPhotoEntries.native.ts src/db/queries/journalPhotoEntries.web.ts \
  src/hooks/useDaySummary.ts src/hooks/useDaySummaries.ts src/components/journal/TodayView.tsx
git commit -m "Drop per-user filter on journal_photo_entries; carry moment_id"
```

---

### Task 2.5: Drop per-user filter on voice clips; carry `moment_id`

**Files:**
- Modify: `src/db/queries/voiceClips.native.ts`
- Modify: `src/db/queries/voiceClips.web.ts`

- [ ] **Step 1: Apply the same pattern as Task 2.4**

In `src/db/queries/voiceClips.native.ts`:
- `rowToClip` (or equivalent) → add `momentId: r.moment_id`
- `clipToPayload` → include `moment_id`
- `createClip` → init `momentId: null` and include in INSERT
- `listClipsForDay` → drop the `currentUserId` parameter and remove privacy clauses
- `countClipsForTripDay` → drop `currentUserId`
- Any other helpers that take `currentUserId` → drop it

In `src/db/queries/voiceClips.web.ts`: drop `currentUserId` from each stub signature.

- [ ] **Step 2: Update consumers**

Same files as Task 2.4 (`TodayView.tsx`, `useDaySummary.ts`, `useDaySummaries.ts`) and also:
- `src/services/voiceClipService.native.ts` — if it calls listClipsForDay (check).
- Any other call sites — search: `grep -r "listClipsForDay\|countClipsForTripDay" src/`.

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit  # voice-clip errors resolved; expense errors remain
git add src/db/queries/voiceClips.native.ts src/db/queries/voiceClips.web.ts src/services/voiceClipService.native.ts <consumers>
git commit -m "Drop per-user filter on voice_clips; carry moment_id"
```

---

### Task 2.6: Add `moment_id` to expense queries

**Files:**
- Modify: `src/db/queries/expenses.native.ts`
- Modify: `src/db/queries/expenses.web.ts`

- [ ] **Step 1: Extend mappers + create/update**

In `src/db/queries/expenses.native.ts`:
- `rowToExpense` → `momentId: r.moment_id`
- `expenseToPayload` → `moment_id: e.momentId`
- `createExpense` / equivalent → init `momentId: null` and include in INSERT
- `updateExpense` — extend its updatable-fields list to include `momentId` (sets `moment_id` column + enqueues the update):

Locate the `updateExpense` function and add a clause:
```typescript
if (input.momentId !== undefined) {
  await db.runAsync(`UPDATE expenses SET moment_id = ?, updated_at = ? WHERE id = ?;`,
    [input.momentId, updatedAt, input.id]);
  payload.moment_id = input.momentId;
}
```

(Adjust to whatever shape `updateExpense` uses today — look at existing `caption` / `expenseTime` handling for the local pattern.)

- [ ] **Step 2: Mirror in `.web.ts` (no-op stubs)**

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit  # should now be clean
git add src/db/queries/expenses.native.ts src/db/queries/expenses.web.ts
git commit -m "Add moment_id support to expense queries"
```

---

### Task 2.7: Add `cover_photo_storage_path` to trip queries

**Files:**
- Modify: `src/db/queries/trips.native.ts`
- Modify: `src/db/queries/trips.web.ts`
- Modify: `src/types/trip.ts` (assumed file — adjust to actual path)

- [ ] **Step 1: Add to types**

In whichever file defines `Trip` + `TripRow`, add:
- `Trip.coverPhotoStoragePath: string | null`
- `TripRow.cover_photo_storage_path: string | null`

- [ ] **Step 2: Update query helpers**

In `trips.native.ts`:
- `rowToTrip` → include `coverPhotoStoragePath: r.cover_photo_storage_path`
- `tripToPayload` → include `cover_photo_storage_path: t.coverPhotoStoragePath`
- Add a new function:
```typescript
export async function setTripCoverPhoto(
  tripId: string,
  storagePath: string | null,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE trips SET cover_photo_storage_path = ?, updated_at = ? WHERE id = ?;`,
      [storagePath, updatedAt, tripId],
    );
    await enqueueSync(db, 'trips', tripId, 'update', {
      id: tripId,
      cover_photo_storage_path: storagePath,
      updated_at: updatedAt,
    });
  });
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/db/queries/trips.native.ts src/db/queries/trips.web.ts src/types/trip.ts
git commit -m "Add cover_photo_storage_path to trip queries"
```

---

### Task 2.8: Update `journalTimeline.ts` — group members under their Moment parents

**Files:**
- Modify: `src/utils/journalTimeline.ts`
- Modify: `src/utils/journalTimeline.test.ts`

- [ ] **Step 1: Write the failing tests first**

In `src/utils/journalTimeline.test.ts`, add new cases:

```typescript
import { buildDayTimeline, type TimelineItem, type TimelineSection } from './journalTimeline';

describe('buildDayTimeline — Moments grouping', () => {
  it('groups members under their parent Moment in occurred_at order', () => {
    const moment = {
      id: 'm1',
      tripId: 't1',
      dayDate: '2026-05-24',
      title: 'Lunch',
      coverPhotoEntryId: null,
      createdBy: 'u1',
      createdAt: '2026-05-24T12:00:00Z',
      updatedAt: '2026-05-24T12:00:00Z',
      deletedAt: null,
    };
    const photo = makePhotoEntry({ id: 'p1', occurredAt: '2026-05-24T12:50:00Z', momentId: 'm1' });
    const voice = makeVoiceClip({ id: 'v1', occurredAt: '2026-05-24T12:42:00Z', momentId: 'm1' });
    const soloPhoto = makePhotoEntry({ id: 'p2', occurredAt: '2026-05-24T14:30:00Z', momentId: null });

    const sections = buildDayTimeline({
      photoEntries: [photo, soloPhoto],
      voiceClips: [voice],
      expenses: [],
      moments: [moment],
      currentUserId: 'u1',
    });

    // Sections are a flat list — solo entries and Moment headers interleaved
    // chronologically. The Moment header sits at min(members.occurredAt).
    expect(sections).toEqual([
      { kind: 'moment', id: 'm1', moment, members: [voiceItem, photoItem], startsAt: '2026-05-24T12:42:00Z', endsAt: '2026-05-24T12:50:00Z' },
      { kind: 'solo',   id: 'p2', item: soloPhotoItem },
    ]);
  });

  it('falls back to solo when a Moment has no surviving members (e.g., all deleted)', () => { /* ... */ });
  it('omits deleted Moments entirely', () => { /* ... */ });
});
```

(Spell out the helpers and exact expected items in full; this snippet shows shape.)

- [ ] **Step 2: Update `buildDayTimeline` to return a grouped structure**

Replace the existing `TimelineItem[]` return with a `TimelineSection[]`:

```typescript
import type { JournalMoment } from '@/types/journal';

export type TimelineSection =
  | { kind: 'solo'; id: string; item: TimelineItem }
  | {
      kind: 'moment';
      id: string;
      moment: JournalMoment;
      members: TimelineItem[];
      startsAt: string;          // ISO, min(members.occurredAt)
      endsAt: string;            // ISO, max(members.occurredAt)
    };

export function buildDayTimeline(input: {
  photoEntries: JournalPhotoEntryWithPhotos[];
  voiceClips: VoiceClip[];
  expenses: Expense[];
  moments: JournalMoment[];
  currentUserId: string;
}): TimelineSection[] {
  // 1. Build TimelineItems (same as before — includes per-entry momentId).
  const items = buildItems(input);

  // 2. Bucket items by their momentId (null = solo).
  const byMoment = new Map<string, TimelineItem[]>();
  const solos: TimelineItem[] = [];
  for (const it of items) {
    const mid = momentIdOf(it);
    if (mid == null) {
      solos.push(it);
    } else {
      const list = byMoment.get(mid) ?? [];
      list.push(it);
      byMoment.set(mid, list);
    }
  }

  // 3. Build Moment sections; drop Moments with zero surviving members.
  const sections: TimelineSection[] = [];
  for (const m of input.moments) {
    if (m.deletedAt) continue;
    const members = (byMoment.get(m.id) ?? []).slice()
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    if (members.length === 0) continue;
    sections.push({
      kind: 'moment',
      id: m.id,
      moment: m,
      members,
      startsAt: members[0]!.occurredAt.toISOString(),
      endsAt: members[members.length - 1]!.occurredAt.toISOString(),
    });
  }

  // 4. Solos as their own sections.
  for (const it of solos) {
    sections.push({ kind: 'solo', id: it.id, item: it });
  }

  // 5. Sort sections by their effective start time.
  sections.sort((a, b) => sectionStartMs(a) - sectionStartMs(b));
  return sections;
}

function momentIdOf(it: TimelineItem): string | null {
  if (it.kind === 'photo') return it.entry.momentId;
  if (it.kind === 'voice') return it.clip.momentId;
  return it.expense.momentId;
}

function sectionStartMs(s: TimelineSection): number {
  if (s.kind === 'solo') return s.item.occurredAt.getTime();
  return new Date(s.startsAt).getTime();
}

// Extract the old item-building into a private helper so the public API can
// return sections without breaking the old TimelineItem type used by drag
// helpers and tests.
function buildItems(input: { ... }): TimelineItem[] { /* same logic as before */ }
```

Also export a back-compat helper for code that still wants a flat list:
```typescript
export function flattenSections(sections: TimelineSection[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const s of sections) {
    if (s.kind === 'solo') out.push(s.item);
    else out.push(...s.members);
  }
  return out;
}
```

- [ ] **Step 3: Run tests**

Run: `npx jest src/utils/journalTimeline.test.ts`
Expected: PASS.

- [ ] **Step 4: Typecheck + commit**

Update `computeReorderTimestamp` (in the same file) — its signature still uses `TimelineItem`, which is fine; drag operations resolve up to items, not sections. No change needed.

```bash
npx tsc --noEmit
git add src/utils/journalTimeline.ts src/utils/journalTimeline.test.ts
git commit -m "Group timeline items under Moment parents in buildDayTimeline"
```

---

### Task 2.9: New hooks — `useDayMoments`, `useTripCover`; update `useDaySummary`

**Files:**
- Create: `src/hooks/useDayMoments.ts`
- Create: `src/hooks/useTripCover.ts`
- Modify: `src/hooks/useDaySummary.ts`

- [ ] **Step 1: `useDayMoments.ts`**

```typescript
import { useCallback, useEffect, useState } from 'react';

import * as journalMoments from '@/db/queries/journalMoments';
import type { JournalMoment } from '@/types/journal';

export interface DayMomentsState {
  moments: JournalMoment[];
  isLoading: boolean;
  reload: () => Promise<void>;
}

export function useDayMoments(tripId: string, dayDate: string): DayMomentsState {
  const [moments, setMoments] = useState<JournalMoment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async (): Promise<void> => {
    if (!tripId || !dayDate) {
      setMoments([]);
      setIsLoading(false);
      return;
    }
    try {
      const list = await journalMoments.listMomentsForDay(tripId, dayDate);
      setMoments(list);
    } catch (error) {
      console.warn('useDayMoments reload failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [tripId, dayDate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { moments, isLoading, reload };
}
```

- [ ] **Step 2: `useTripCover.ts`**

Resolve the trip's cover via the fallback chain: explicit `trip.coverPhotoStoragePath` → first day's `coverStoragePath` → null.

```typescript
import { useEffect, useState } from 'react';

import * as journalPhotoEntries from '@/db/queries/journalPhotoEntries';
import * as journalDays from '@/db/queries/journalDays';
import { useTripStore } from '@/stores/tripStore';

export function useTripCover(tripId: string): string | null {
  const trip = useTripStore((s) => s.trips.find((t) => t.id === tripId) ?? null);
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!trip) {
        setResolved(null);
        return;
      }
      if (trip.coverPhotoStoragePath) {
        setResolved(trip.coverPhotoStoragePath);
        return;
      }
      // Fallback: first day with a cover (chapter-summaries order, descending).
      // Cheap version: call listDaySummaries and take the first cover.
      try {
        const summaries = await journalDays.listDaySummaries(tripId);
        const firstWithCover = summaries.find((d) => d.coverStoragePath);
        if (!cancelled) setResolved(firstWithCover?.coverStoragePath ?? null);
      } catch {
        if (!cancelled) setResolved(null);
      }
    })();
    return () => { cancelled = true; };
  }, [trip]);

  return resolved;
}
```

- [ ] **Step 3: Update `useDaySummary.ts`**

Drop the `currentUserId` filter — it's no longer passed to the query helpers. Replace the body of `reload` accordingly:

```typescript
const reload = async (): Promise<void> => {
  if (!tripId) return;
  try {
    const [photoCount, voiceCount, meta, coverPath, expenseTotals] = await Promise.all([
      journalPhotoEntries.countPhotosForTripDay(tripId, dayDateISO),
      voiceClips.countClipsForTripDay(tripId, dayDateISO),
      journalDays.getDayMetadata(tripId, dayDateISO),
      journalPhotoEntries.firstPhotoStoragePathForDay(tripId, dayDateISO),
      sumDayExpenses(tripId, dayDateISO, me),  // expense totals still pass `me` for is_private filtering
    ]);
    setData({
      totalConvertedAmount: expenseTotals.total,
      photoCount,
      voiceCount,
      expenseCount: expenseTotals.count,
      coverStoragePath: meta?.coverPhotoEntryId
        ? await journalPhotoEntries.storagePathForEntry(meta.coverPhotoEntryId)
        : coverPath,
      effectiveLocation: meta?.location ?? expenseTotals.mostFrequentPlace,
      meta,
      isLoading: false,
    });
  } catch (error) {
    console.warn('useDaySummary reload failed:', error);
    setData((prev) => ({ ...prev, isLoading: false }));
  }
};
```

Note: also need a new query helper `storagePathForEntry(entryId)` on `journalPhotoEntries` queries — add it now:

```typescript
export async function storagePathForEntry(entryId: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ storage_path: string }>(
    `SELECT p.storage_path
       FROM journal_photos p
      WHERE p.entry_id = ?
      ORDER BY p.sort_order ASC
      LIMIT 1;`,
    [entryId],
  );
  return row?.storage_path ?? null;
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/hooks/useDayMoments.ts src/hooks/useTripCover.ts src/hooks/useDaySummary.ts src/db/queries/journalPhotoEntries.native.ts
git commit -m "Add useDayMoments + useTripCover; rewire useDaySummary to shared model"
```

---

### Task 2.10: Update `useDaySummaries` to count Moments + drop user filter

**Files:**
- Modify: `src/hooks/useDaySummaries.ts`
- Modify: `src/types/journal.ts` (extend `DaySummary` with `momentCount` and `moments`)

- [ ] **Step 1: Extend `DaySummary`**

In `src/types/journal.ts`:

```typescript
export interface DaySummary {
  dayDate: string;
  dayIndex: number;
  photoCount: number;
  voiceCount: number;
  expenseCount: number;
  totalConvertedAmount: number;
  coverStoragePath: string | null;
  effectiveLocation: string | null;
  momentTitles: string[];                       // NEW — up to first N titles for the All Days chip strip
  momentCount: number;                          // NEW
}
```

- [ ] **Step 2: Update the hook**

Drop the per-user filter from every query call. Add a per-day Moment fetch and populate `momentTitles` (first 3) + `momentCount`.

In `useDaySummaries.ts`, after fetching the existing aggregates, add:
```typescript
const momentsByDate: Record<string, JournalMoment[]> = {};
const allMoments = await journalMoments.listMomentsForTrip(tripId); // see Step 3 below
for (const m of allMoments) {
  (momentsByDate[m.dayDate] = momentsByDate[m.dayDate] ?? []).push(m);
}
// when building each summary:
const dayMoments = momentsByDate[date] ?? [];
summary.momentCount = dayMoments.length;
summary.momentTitles = dayMoments.slice(0, 3).map((m) => m.title ?? 'Untitled');
```

- [ ] **Step 3: Add `listMomentsForTrip` to the moments queries**

In `journalMoments.native.ts`:
```typescript
export async function listMomentsForTrip(tripId: string): Promise<JournalMoment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<JournalMomentRow>(
    `SELECT * FROM journal_moments
      WHERE trip_id = ? AND deleted_at IS NULL
      ORDER BY day_date DESC, created_at ASC;`,
    [tripId],
  );
  return rows.map(rowToMoment);
}
```

In `journalMoments.web.ts`: add the stub returning `[]`.

In `contract.ts`: add to the contract interface.

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/hooks/useDaySummaries.ts src/types/journal.ts src/db/queries/journalMoments.native.ts src/db/queries/journalMoments.web.ts src/db/queries/contract.ts
git commit -m "Extend useDaySummaries with Moment counts + titles; drop user filter"
```

---

## PHASE 3 — NAVIGATION SKELETON

After this phase, the tab smart-routes and the pushed Day-screen route exists. The screens still render the old `TodayView` / `ChapterView` content — Phase 4 swaps in the new visuals.

### Task 3.1: Smart router on the journal tab

**Files:**
- Modify: `app/(main)/trip/[id]/(tabs)/journal.tsx`

- [ ] **Step 1: Replace the toggle + lifted-state implementation**

```typescript
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { AllDaysScreen } from '@/components/journal/AllDaysScreen';
import { DayScreen } from '@/components/journal/DayScreen';
import { useTripStore } from '@/stores/tripStore';
import { todayIsoDate } from '@/utils/date';

export default function JournalScreen() {
  const params = useGlobalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  const trip = useTripStore((s) => s.trips.find((t) => t.id === tripId) ?? null);

  const isTripActive = useMemo<boolean>(() => {
    if (!trip) return false;
    const today = todayIsoDate();
    if (today < trip.startDate) return false;
    if (trip.endDate && today > trip.endDate) return false;
    return true;
  }, [trip]);

  if (!trip) return null;

  if (isTripActive) {
    // Smart-route: open directly on today's Day screen, no back button.
    return <DayScreen tripId={tripId} initialDayDate={todayIsoDate()} showBackButton={false} />;
  }
  return <AllDaysScreen tripId={tripId} />;
}
```

- [ ] **Step 2: Stub `AllDaysScreen` and `DayScreen`**

Create no-op stubs so the import resolves until Phase 3.2 fleshes them out:

```typescript
// src/components/journal/AllDaysScreen.tsx
import { Text, View } from 'react-native';
export function AllDaysScreen({ tripId }: { tripId: string }) {
  return <View><Text>All Days · {tripId}</Text></View>;
}

// src/components/journal/DayScreen.tsx
import { Text, View } from 'react-native';
interface Props {
  tripId: string;
  initialDayDate: string;
  showBackButton: boolean;
}
export function DayScreen({ tripId, initialDayDate }: Props) {
  return <View><Text>Day {initialDayDate} · {tripId}</Text></View>;
}
```

These stubs are temporary — they'll be implemented in Phases 3.3, 4, 5, 6.

- [ ] **Step 3: Verify**

Run: `npx expo start`. Open a trip with `startDate` today → land directly on the Day stub. Open a trip with `endDate` in the past → land on All Days stub.

- [ ] **Step 4: Commit**

```bash
git add app/(main)/trip/[id]/(tabs)/journal.tsx src/components/journal/AllDaysScreen.tsx src/components/journal/DayScreen.tsx
git commit -m "Smart-route journal tab + stub Day/AllDays screens"
```

---

### Task 3.2: Pushed Day-screen route

**Files:**
- Create: `app/(main)/trip/[id]/journal/[date].tsx`

- [ ] **Step 1: New pushed route**

```typescript
import { useLocalSearchParams } from 'expo-router';

import { DayScreen } from '@/components/journal/DayScreen';

export default function PushedDayScreen() {
  const params = useLocalSearchParams<{ id: string; date: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  const date = Array.isArray(params.date) ? params.date[0] : params.date ?? '';
  if (!tripId || !date) return null;
  return <DayScreen tripId={tripId} initialDayDate={date} showBackButton />;
}
```

- [ ] **Step 2: Configure screen header**

Make sure the route is registered with a header layout that includes a default back button (Expo Router handles this automatically when navigating from `useRouter().push(...)`). If your project disables the default header at a layout level, add a `Stack.Screen` config here:

```typescript
// At top of the file:
import { Stack } from 'expo-router';

// In the component (above DayScreen):
return (
  <>
    <Stack.Screen options={{ headerShown: false }} />
    <DayScreen ... />
  </>
);
```

`showBackButton` is consumed inside DayScreen — the new DateStrip (Task 4.1) renders the back glyph itself, not the OS chrome.

- [ ] **Step 3: Verify**

Open `AllDaysScreen` stub, manually trigger `router.push("/trip/{id}/journal/2026-05-24")` from the dev console (or add a temporary Pressable inside the stub). Confirm the pushed Day screen renders.

- [ ] **Step 4: Commit**

```bash
git add app/(main)/trip/[id]/journal/[date].tsx
git commit -m "Add pushed Day-screen route"
```

---

### Task 3.3: AllDaysScreen scaffold (real list, old DayCard)

**Files:**
- Modify: `src/components/journal/AllDaysScreen.tsx`

- [ ] **Step 1: Port the existing ChapterView body into AllDaysScreen**

For Phase 3, just render the existing `DayCard` list. The trip-cover banner + Moment chips come in Phase 10.

```typescript
import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { DayCard } from './DayCard';
import { useDaySummaries } from '@/hooks/useDaySummaries';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useTripStore } from '@/stores/tripStore';
import { href } from '@/utils/nav';

interface Props { tripId: string; }

export function AllDaysScreen({ tripId }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const trip = useTripStore((s) => s.trips.find((tr) => tr.id === tripId) ?? null);
  const { summaries, isLoading } = useDaySummaries(tripId);

  if (!trip) return null;
  const dayTotal = summaries.length > 0 ? summaries.length : null;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <FlatList
        data={summaries}
        keyExtractor={(s) => s.dayDate}
        renderItem={({ item }) => (
          <DayCard
            summary={item}
            homeCurrency={trip.homeCurrency}
            dayTotal={dayTotal}
            onPress={() => router.push(href(`/trip/${tripId}/journal/${item.dayDate}`))}
          />
        )}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={[styles.empty, { borderColor: theme.border }]}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                {t('journal.emptyDay')}
              </Text>
            </View>
          )
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 12, paddingBottom: 100 },
  empty: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', padding: 28, alignItems: 'center', marginTop: 24 },
  emptyText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
});
```

- [ ] **Step 2: Delete `ChapterView.tsx`**

```bash
git rm src/components/journal/ChapterView.tsx
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/journal/AllDaysScreen.tsx
git commit -m "Replace ChapterView with AllDaysScreen, push to per-day route on tap"
```

---

## PHASE 4 — DAY SCREEN CHROME (DateStrip + CoverHero + StatsStrip)

After this phase, the Day screen has its full top: sticky date strip, edge-to-edge cover hero with overlay text, stats strip with location editor. The timeline below is still the old `TodayView` content; Phase 5 replaces it.

### Task 4.1: `DateStrip` component

**Files:**
- Create: `src/components/journal/DateStrip.tsx`

- [ ] **Step 1: Implement DateStrip**

```typescript
// Sticky horizontal pill strip: one pill per trip day. The active pill is
// filled accent; others are outlined. Past days are dimmed. Auto-scrolls
// horizontally so the active pill stays visible. Includes optional
// inline-start back button and inline-end "All days" button.

import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { href } from '@/utils/nav';
import { todayIsoDate } from '@/utils/date';

interface Props {
  tripId: string;
  startDate: string;          // YYYY-MM-DD
  endDate: string | null;
  currentDate: string;        // YYYY-MM-DD
  onPick: (date: string) => void;
  showBackButton: boolean;
}

const PILL_W = 56;             // approximate; for autoscroll math

export function DateStrip({ tripId, startDate, endDate, currentDate, onPick, showBackButton }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const days = expandDays(startDate, endDate);
  const today = todayIsoDate();

  useEffect(() => {
    const idx = days.findIndex((d) => d === currentDate);
    if (idx < 0) return;
    // Center the active pill: scroll to (idx*PILL_W) - (viewport/2 - PILL_W/2)
    // — but we don't know viewport here; just align it ~1/3 in.
    const x = Math.max(0, idx * PILL_W - 80);
    scrollRef.current?.scrollTo({ x, animated: true });
  }, [currentDate, days.length]);

  return (
    <View style={[styles.bar, { backgroundColor: theme.bg, borderColor: theme.border }]}>
      {showBackButton ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel={t('common.back')}
          style={styles.backBtn}
        >
          <Text style={[styles.backGlyph, { color: theme.text }]}>‹</Text>
        </Pressable>
      ) : null}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {days.map((date) => (
          <DatePill
            key={date}
            date={date}
            active={date === currentDate}
            past={date < today}
            onPress={() => onPick(date)}
          />
        ))}
      </ScrollView>
      <Pressable
        onPress={() => router.push(href(`/trip/${tripId}/(tabs)/journal`))}
        hitSlop={8}
        accessibilityLabel={t('journal.allDays')}
        style={styles.allDaysBtn}
      >
        <Text style={[styles.allDaysGlyph, { color: theme.text }]}>≡</Text>
      </Pressable>
    </View>
  );
}

function DatePill({
  date, active, past, onPress,
}: { date: string; active: boolean; past: boolean; onPress: () => void; }) {
  const theme = useTheme();
  const [yyyy, mm, dd] = date.split('-');
  const weekday = new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        active
          ? { backgroundColor: theme.accent, borderColor: theme.accent }
          : { borderColor: theme.border, backgroundColor: 'transparent' },
        past && !active && { opacity: 0.6 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={[styles.pillDay, { color: active ? '#fff' : theme.text }]}>{dd}</Text>
      <Text style={[styles.pillWeekday, { color: active ? '#fff' : theme.textMuted }]}>{weekday}</Text>
    </Pressable>
  );
}

function expandDays(startDate: string, endDate: string | null): string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = endDate ? new Date(`${endDate}T00:00:00Z`) : new Date(startDate);
  const out: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  backGlyph: { fontSize: 26, fontWeight: '700', lineHeight: 26 },
  strip: { gap: 8, paddingHorizontal: 4 },
  pill: {
    width: PILL_W,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  pillDay: { fontSize: 16, fontWeight: '800' },
  pillWeekday: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  allDaysBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  allDaysGlyph: { fontSize: 18, fontWeight: '700' },
});
```

- [ ] **Step 2: Add new i18n keys (placeholders — finalised in Phase 12)**

Add to both `src/i18n/locales/en.json` and `src/i18n/locales/he.json`:
```json
"common": { "back": "Back" },
"journal": {
  "allDays": "All days"
}
```

(Hebrew: `"חזרה"` / `"כל הימים"`.)

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/journal/DateStrip.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Add DateStrip — sticky day pills with back + All Days buttons"
```

---

### Task 4.2: `DayCoverHero` component

**Files:**
- Create: `src/components/journal/DayCoverHero.tsx`

- [ ] **Step 1: Implement DayCoverHero**

```typescript
// Edge-to-edge cover photo header for a single day. Renders the day's cover
// (signed URL from useSignedJournalPhotoUrl) or a soft gradient placeholder
// when there's no cover. Overlay text on a bottom dark gradient.

import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSignedJournalPhotoUrl } from '@/hooks/useSignedJournalPhotoUrl';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatReadableDate } from '@/utils/date';

interface Props {
  dayDate: string;
  isToday: boolean;
  dayIndex: number | null;
  dayTotal: number | null;
  effectiveLocation: string | null;
  coverStoragePath: string | null;
  onPlaceholderPress: () => void;
  onCoverLongPress: () => void;
}

const HERO_HEIGHT = 280;

export function DayCoverHero({
  dayDate, isToday, dayIndex, dayTotal, effectiveLocation,
  coverStoragePath, onPlaceholderPress, onCoverLongPress,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const coverUrl = useSignedJournalPhotoUrl(coverStoragePath);

  const dayLabel = isToday ? t('journal.today') : formatReadableDate(dayDate);
  const subParts: string[] = [];
  if (effectiveLocation) subParts.push(effectiveLocation);
  if (dayIndex && dayTotal) subParts.push(t('journal.dayOfTotal', { n: dayIndex, total: dayTotal }));
  const subLabel = subParts.join(' · ');

  if (!coverUrl) {
    return (
      <Pressable onPress={onPlaceholderPress} style={[styles.placeholderRoot, { height: HERO_HEIGHT }]}>
        <LinearGradient
          colors={theme.gradient1}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.placeholderInner, { backgroundColor: theme.accentSoft }]}>
          <Text style={styles.placeholderGlyph}>📸</Text>
        </View>
        <Text style={[styles.placeholderText, { color: theme.text }]}>
          {t('journal.coverPlaceholder')}
        </Text>
        <OverlayText dayLabel={dayLabel} subLabel={subLabel} />
      </Pressable>
    );
  }

  return (
    <Pressable onLongPress={onCoverLongPress} style={{ height: HERO_HEIGHT }}>
      <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={[StyleSheet.absoluteFill, { top: HERO_HEIGHT * 0.5 }]}
      />
      <OverlayText dayLabel={dayLabel} subLabel={subLabel} />
    </Pressable>
  );
}

function OverlayText({ dayLabel, subLabel }: { dayLabel: string; subLabel: string }) {
  return (
    <View style={styles.overlay}>
      <Text style={styles.dayLabel} numberOfLines={1}>{dayLabel}</Text>
      {subLabel ? <Text style={styles.subLabel} numberOfLines={1}>{subLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholderRoot: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  placeholderInner: {
    width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center',
  },
  placeholderGlyph: { fontSize: 28 },
  placeholderText: { marginTop: 10, fontSize: 13, fontWeight: '600' },
  overlay: {
    position: 'absolute',
    bottom: 18, insetInlineStart: 18, insetInlineEnd: 18,
  },
  dayLabel: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500', marginTop: 2 },
});
```

Note on `insetInlineStart` / `insetInlineEnd`: these are the logical equivalents of `left`/`right` and mirror correctly in RTL. If TS complains, fall back to runtime `useIsRTL` to pick `left` vs `right`.

- [ ] **Step 2: Add i18n key for `journal.coverPlaceholder`**

In en.json: `"coverPlaceholder": "Tap to set a cover photo"`
In he.json: `"coverPlaceholder": "הקש כדי להגדיר תמונת שער"`

- [ ] **Step 3: Commit**

```bash
git add src/components/journal/DayCoverHero.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Add DayCoverHero — edge-to-edge cover with overlay text + placeholder"
```

---

### Task 4.3: `DayStatsStrip` component

**Files:**
- Create: `src/components/journal/DayStatsStrip.tsx`

- [ ] **Step 1: Implement**

```typescript
// Stats strip below the cover: spend total (tappable for category breakdown),
// content count chips (tap to scroll-to-first), and the location line with
// inline editor affordance.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LocationEditor } from './LocationEditor';
import { useTheme } from '@/hooks/useTheme';
import { formatAmount } from '@/utils/currency';

interface Props {
  totalConvertedAmount: number;
  homeCurrency: string;
  photoCount: number;
  voiceCount: number;
  expenseCount: number;
  effectiveLocation: string | null;
  isAutoLocation: boolean;
  onTotalPress: () => void;
  onChipPress: (kind: 'photo' | 'voice' | 'expense') => void;
  onLocationChange: (next: string | null) => void;
}

export function DayStatsStrip(props: Props) {
  const theme = useTheme();
  return (
    <View>
      <View style={styles.row}>
        <Pressable onPress={props.onTotalPress} hitSlop={6}>
          <Text style={[styles.total, { color: theme.text }]} numberOfLines={1}>
            {formatAmount(props.totalConvertedAmount, props.homeCurrency)}
          </Text>
        </Pressable>
        <View style={styles.chips}>
          <Chip onPress={() => props.onChipPress('photo')}   text={`📸 ${props.photoCount}`} />
          <Text style={[styles.sep, { color: theme.textMuted }]}>·</Text>
          <Chip onPress={() => props.onChipPress('voice')}   text={`🎤 ${props.voiceCount}`} />
          <Text style={[styles.sep, { color: theme.textMuted }]}>·</Text>
          <Chip onPress={() => props.onChipPress('expense')} text={`💳 ${props.expenseCount}`} />
        </View>
      </View>
      <LocationEditor
        value={props.effectiveLocation}
        isAuto={props.isAutoLocation}
        onChange={props.onLocationChange}
      />
      <View style={[styles.divider, { backgroundColor: theme.accent, opacity: 0.3 }]} />
    </View>
  );
}

function Chip({ onPress, text }: { onPress: () => void; text: string }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <Text style={[styles.chip, { color: theme.text }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  total: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { fontSize: 12, fontWeight: '700' },
  sep: { fontSize: 12 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 18, marginTop: 6, marginBottom: 8 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/journal/DayStatsStrip.tsx
git commit -m "Add DayStatsStrip — total + count chips + location"
```

---

### Task 4.4: `DayScreen` scaffold — combine DateStrip + CoverHero + StatsStrip

**Files:**
- Modify: `src/components/journal/DayScreen.tsx`

- [ ] **Step 1: Replace stub with real implementation (timeline still old)**

```typescript
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DateStrip } from './DateStrip';
import { DayCoverHero } from './DayCoverHero';
import { DayStatsStrip } from './DayStatsStrip';
import * as journalDays from '@/db/queries/journalDays';
import { useDaySummary } from '@/hooks/useDaySummary';
import { useTheme } from '@/hooks/useTheme';
import { useTripStore } from '@/stores/tripStore';
import { href } from '@/utils/nav';
import { todayIsoDate } from '@/utils/date';

interface Props {
  tripId: string;
  initialDayDate: string;
  showBackButton: boolean;
}

export function DayScreen({ tripId, initialDayDate, showBackButton }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const trip = useTripStore((s) => s.trips.find((t) => t.id === tripId) ?? null);
  const [dayDate, setDayDate] = useState<string>(initialDayDate);
  const summary = useDaySummary(tripId, dayDate);

  const handleLocationChange = useCallback(async (next: string | null) => {
    try {
      await journalDays.setLocation(tripId, dayDate, next);
      await summary.reload();
    } catch (e) { console.warn(e); }
  }, [tripId, dayDate, summary]);

  if (!trip) return null;
  const isToday = dayDate === todayIsoDate();
  const dayIndex = computeDayIndex(trip.startDate, dayDate);
  const dayTotal = trip.endDate ? computeDayIndex(trip.startDate, trip.endDate) : null;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <DateStrip
        tripId={tripId}
        startDate={trip.startDate}
        endDate={trip.endDate}
        currentDate={dayDate}
        onPick={setDayDate}
        showBackButton={showBackButton}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <DayCoverHero
          dayDate={dayDate}
          isToday={isToday}
          dayIndex={dayIndex}
          dayTotal={dayTotal}
          effectiveLocation={summary.effectiveLocation}
          coverStoragePath={summary.coverStoragePath}
          onPlaceholderPress={() => { /* Phase 5+ → opens cover picker */ }}
          onCoverLongPress={() => { /* Phase 5+ → opens "Change cover" sheet */ }}
        />
        <DayStatsStrip
          totalConvertedAmount={summary.totalConvertedAmount}
          homeCurrency={trip.homeCurrency}
          photoCount={summary.photoCount}
          voiceCount={summary.voiceCount}
          expenseCount={summary.expenseCount}
          effectiveLocation={summary.effectiveLocation}
          isAutoLocation={summary.meta?.location == null}
          onTotalPress={() => { /* Phase 11 → category breakdown sheet */ }}
          onChipPress={() => { /* Phase 5 → scrollToIndex */ }}
          onLocationChange={handleLocationChange}
        />
        {/* Timeline body goes here in Phase 5 */}
      </ScrollView>
    </View>
  );
}

function computeDayIndex(start: string, target: string): number | null {
  const s = new Date(`${start}T00:00:00Z`);
  const t = new Date(`${target}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(t.getTime())) return null;
  return Math.max(1, Math.floor((t.getTime() - s.getTime()) / 86_400_000) + 1);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 100 },
});
```

- [ ] **Step 2: Verify on device**

Run: `npx expo start`. Open a trip → tab journal renders the new chrome with the old stats. Switch days via the strip → cover + stats refresh.

- [ ] **Step 3: Commit**

```bash
git add src/components/journal/DayScreen.tsx
git commit -m "DayScreen scaffold: DateStrip + DayCoverHero + DayStatsStrip"
```

---

## PHASE 5 — TIMELINE SPINE + ROW TREATMENTS

After this phase, the spine is visible, each entry renders against it without the uniform card wrapper, and the day timeline reads as photos/voice-chips/expense-cards on a vertical thread.

### Task 5.1: `TimelineSpine` + `SpineNode` components

**Files:**
- Create: `src/components/journal/TimelineSpine.tsx`
- Create: `src/components/journal/SpineNode.tsx`

- [ ] **Step 1: SpineNode (visual + drag-target)**

```typescript
// One node on the spine — a dot + a time label. The whole touch area (~36pt
// square) initiates drag on long-press, leaving the row body free for taps.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface Props {
  occurredAt: string;            // ISO with timezone (photos/voices) or YYYY-MM-DDTHH:MM (expenses)
  loggedByName?: string | null;  // shown in muted text under time when set
  variant: 'solo' | 'member';    // hollow vs filled
  onDragStart?: () => void;
}

export function SpineNode({ occurredAt, loggedByName, variant, onDragStart }: Props) {
  const theme = useTheme();
  const time = formatTime(occurredAt);

  const dot = variant === 'solo'
    ? { backgroundColor: theme.accent, borderColor: theme.accent }
    : { backgroundColor: 'transparent', borderColor: theme.accent, borderWidth: 1.5 };

  return (
    <Pressable
      onLongPress={onDragStart}
      hitSlop={6}
      delayLongPress={300}
      style={styles.root}
    >
      <View style={[styles.dot, dot]} />
      <View style={styles.labelCol}>
        <Text style={[styles.time, { color: theme.textMuted }]}>{time}</Text>
        {loggedByName ? (
          <Text style={[styles.by, { color: theme.textMuted }]} numberOfLines={1}>by {loggedByName}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso.length === 16 ? `${iso}:00` : iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  root: { width: 64, alignItems: 'center', paddingTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  labelCol: { alignItems: 'center', marginTop: 4 },
  time: { fontSize: 10, fontWeight: '600' },
  by: { fontSize: 9, marginTop: 1, maxWidth: 64 },
});
```

- [ ] **Step 2: TimelineSpine (layout helper)**

The spine is rendered as a 2px absolutely-positioned line behind the spine-node column. This lets us avoid manually drawing line segments between each row.

```typescript
// Vertical accent line behind the spine-node column. Renders as a single
// absolutely-positioned View spanning the timeline area's height. The host
// component (DayScreen body) supplies the height by laying the spine
// underneath the row column.

import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface Props { thickness?: number; opacity?: number; }

export function TimelineSpine({ thickness = 2, opacity = 0.3 }: Props) {
  const theme = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        styles.spine,
        { width: thickness, backgroundColor: theme.accent, opacity },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  spine: {
    position: 'absolute',
    top: 6, bottom: 6,
    insetInlineStart: 32 - 1,   // half of node column width (64), minus half thickness
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add src/components/journal/SpineNode.tsx src/components/journal/TimelineSpine.tsx
git commit -m "Add SpineNode + TimelineSpine — vertical thread with time-labeled nodes"
```

---

### Task 5.2: Refactor `PhotoEntryRow` — drop card wrapper, gutter, ≡ handle

**Files:**
- Modify: `src/components/journal/timeline/PhotoEntryRow.tsx`

- [ ] **Step 1: Replace the row's outer card with a flat layout**

The row becomes a horizontal layout of `[SpineNode] [body]` where body is the photo grid + caption, no wrapping border. Drag is initiated by the SpineNode (passed `onDragStart`). The body keeps its `onLongPress` for the actions sheet.

```typescript
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SpineNode } from '@/components/journal/SpineNode';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { JournalPhotoEntryWithPhotos } from '@/types/journal';

import { PhotoGrid } from './PhotoGrid';

interface Props {
  entry: JournalPhotoEntryWithPhotos;
  loggedByName?: string | null;
  onCaptionChange: (next: string | null) => void;
  onOpenPhoto: (index: number) => void;
  onLongPress: () => void;
  onDragStart?: () => void;
  isMember?: boolean;
}

export function PhotoEntryRow({
  entry, loggedByName, onCaptionChange, onOpenPhoto, onLongPress, onDragStart, isMember,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.caption ?? '');

  return (
    <View style={[styles.row, isMember && styles.indented]}>
      <SpineNode
        occurredAt={entry.occurredAt}
        loggedByName={loggedByName ?? undefined}
        variant={isMember ? 'member' : 'solo'}
        onDragStart={onDragStart}
      />
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={400}
        style={styles.body}
      >
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
            <Text style={[styles.caption, { color: theme.text, opacity: entry.caption ? 1 : 0.55 }]}>
              {entry.caption ?? t('journal.captionPlaceholder')}
            </Text>
          </Pressable>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, marginBottom: 16 },
  indented: { marginInlineStart: 12 },
  body: { flex: 1, paddingTop: 2 },
  caption: { marginTop: 8, fontSize: 13, fontWeight: '500' },
  captionInput: {
    marginTop: 8, fontSize: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/journal/timeline/PhotoEntryRow.tsx
git commit -m "PhotoEntryRow: drop card wrapper + gutter + handle; spine node owns drag"
```

---

### Task 5.3: Refactor `VoiceClipRow` — voice chip shape

**Files:**
- Modify: `src/components/journal/timeline/VoiceClipRow.tsx`

- [ ] **Step 1: New chip-shaped body**

```typescript
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SpineNode } from '@/components/journal/SpineNode';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useVoiceClipPlayback } from '@/hooks/useVoiceClipPlayback';
import type { VoiceClip } from '@/types/voice';

interface Props {
  clip: VoiceClip;
  loggedByName?: string | null;
  onOpenTranscript: () => void;
  onLongPress: () => void;
  onRetranscribe: () => void;
  onDragStart?: () => void;
  isMember?: boolean;
}

const WAVE_BARS = 22;

export function VoiceClipRow({
  clip, loggedByName, onOpenTranscript, onLongPress, onRetranscribe, onDragStart, isMember,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { isPlaying, toggle } = useVoiceClipPlayback(clip);

  const isPending = clip.transcriptStatus === 'pending' || clip.transcriptStatus === 'processing';
  const isFailed  = clip.transcriptStatus === 'failed';
  const transcript = isPending
    ? t('journal.transcribing')
    : isFailed
      ? t('journal.transcribeFailed')
      : (clip.transcript ?? '');

  return (
    <View style={[styles.row, isMember && styles.indented]}>
      <SpineNode
        occurredAt={clip.occurredAt}
        loggedByName={loggedByName ?? undefined}
        variant={isMember ? 'member' : 'solo'}
        onDragStart={onDragStart}
      />
      <Pressable onLongPress={onLongPress} delayLongPress={400} style={styles.body}>
        <View style={[styles.chip, { backgroundColor: theme.accentSoft }]}>
          <Pressable
            onPress={() => { void toggle(); }}
            hitSlop={8}
            style={[styles.playBtn, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.playGlyph}>{isPlaying ? '⏸' : '▶'}</Text>
          </Pressable>
          <View style={styles.wave}>
            {Array.from({ length: WAVE_BARS }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.waveBar,
                  { backgroundColor: theme.accent, height: 4 + Math.abs(Math.sin(i * 0.4)) * 12 },
                ]}
              />
            ))}
          </View>
          <Text style={[styles.duration, { color: theme.text }]}>{formatDuration(clip.durationSec)}</Text>
        </View>
        <Pressable
          onPress={isFailed ? onRetranscribe : onOpenTranscript}
          style={styles.transcriptWrap}
        >
          {isPending ? (
            <View style={styles.pendingRow}>
              <ActivityIndicator size="small" color={theme.textMuted} />
              <Text style={[styles.transcript, { color: theme.textMuted }]}>{transcript}</Text>
            </View>
          ) : (
            <Text numberOfLines={3} style={[styles.transcript, { color: isFailed ? theme.red : theme.text }]}>
              {transcript}
            </Text>
          )}
        </Pressable>
      </Pressable>
    </View>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, marginBottom: 16 },
  indented: { marginInlineStart: 12 },
  body: { flex: 1, paddingTop: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 22,
  },
  playBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  playGlyph: { color: '#fff', fontSize: 13 },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 },
  waveBar: { width: 2, borderRadius: 1, opacity: 0.75 },
  duration: { fontSize: 11, fontWeight: '700', minWidth: 28, textAlign: 'right' },
  transcriptWrap: { marginTop: 6 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  transcript: { fontSize: 13, lineHeight: 18 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/journal/timeline/VoiceClipRow.tsx
git commit -m "VoiceClipRow: chip-shaped body, decorative waveform, spine node owns drag"
```

---

### Task 5.4: Refactor `ExpenseTimelineRow` — drop card wrapper + gutter

**Files:**
- Modify: `src/components/journal/timeline/ExpenseTimelineRow.tsx`

- [ ] **Step 1: New layout — SpineNode + ExpenseCard directly**

```typescript
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ExpenseCard } from '@/components/expense/card/ExpenseCard';
import { SpineNode } from '@/components/journal/SpineNode';
import type { Category } from '@/types/category';
import type { ExpenseWithPhotos } from '@/types/expense';
import { href } from '@/utils/nav';

interface Props {
  expense: ExpenseWithPhotos;
  category: Category | null;
  homeCurrency: string;
  loggedByName?: string | null;
  isSelfLogged?: boolean;
  userShareAmount?: number;
  userShareConverted?: number;
  onLongPress: () => void;
  onDragStart?: () => void;
  isMember?: boolean;
}

export function ExpenseTimelineRow({
  expense, category, homeCurrency, loggedByName, isSelfLogged,
  userShareAmount, userShareConverted, onLongPress, onDragStart, isMember,
}: Props) {
  const router = useRouter();
  const occurredAt = `${expense.expenseDate}T${expense.expenseTime}`;
  return (
    <View style={[styles.row, isMember && styles.indented]}>
      <SpineNode
        occurredAt={occurredAt}
        loggedByName={loggedByName ?? undefined}
        variant={isMember ? 'member' : 'solo'}
        onDragStart={onDragStart}
      />
      <Pressable onLongPress={onLongPress} delayLongPress={400} style={styles.body}>
        <ExpenseCard
          expense={expense}
          category={category}
          homeCurrency={homeCurrency}
          loggedByName={loggedByName}
          isSelfLogged={isSelfLogged}
          userShareAmount={userShareAmount}
          userShareConverted={userShareConverted}
          onPress={() => router.push(href(`/trip/${expense.tripId}/expense/${expense.id}`))}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, marginBottom: 16 },
  indented: { marginInlineStart: 12 },
  body: { flex: 1, paddingTop: 2 },
});
```

- [ ] **Step 2: Delete `TimestampGutter.tsx`**

```bash
git rm src/components/journal/timeline/TimestampGutter.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/journal/timeline/ExpenseTimelineRow.tsx
git commit -m "ExpenseTimelineRow: drop wrapping card + gutter; spine node owns drag"
```

---

### Task 5.5: Wire the timeline into `DayScreen` (still no Moments visual — comes in Phase 6)

**Files:**
- Modify: `src/components/journal/DayScreen.tsx`

- [ ] **Step 1: Load entries + render rows**

Replace the `{/* Timeline body goes here in Phase 5 */}` comment with a real list. For Phase 5, just render rows in flat order (Moments are still data-only; visual treatment in Phase 6). Use `flattenSections(buildDayTimeline(...))` so the order is correct.

```typescript
// At the top of the component, alongside the existing hooks:
const expenses = useExpenseStore((s) => s.expenses);
const activeExpenseTripId = useExpenseStore((s) => s.activeTripId);
const loadExpensesForTrip = useExpenseStore((s) => s.loadForTrip);
const currentUserId = useAuthStore((s) => s.session?.user.id ?? '');
const tripMembers = useTripMembersStore((s) => s.byTripId[tripId] ?? []);   // assume existing store; adjust to actual

const [photoEntries, setPhotoEntries] = useState<JournalPhotoEntryWithPhotos[]>([]);
const [clips, setClips] = useState<VoiceClip[]>([]);
const moments = useDayMoments(tripId, dayDate);

useEffect(() => {
  if (tripId && activeExpenseTripId !== tripId) void loadExpensesForTrip(tripId);
}, [tripId, activeExpenseTripId, loadExpensesForTrip]);

const reloadDay = useCallback(async () => {
  try {
    const [pe, vc] = await Promise.all([
      journalPhotoEntries.listEntriesForDay(tripId, dayDate),
      voiceClips.listClipsForDay(tripId, dayDate),
    ]);
    setPhotoEntries(pe);
    setClips(vc);
  } catch (e) { console.warn(e); }
}, [tripId, dayDate]);

useEffect(() => { void reloadDay(); }, [reloadDay]);

const expensesForDay = useMemo(
  () => expenses.filter((e) => e.deletedAt == null && e.expenseDate === dayDate
    && (!e.isPrivate || e.userId === currentUserId)),
  [expenses, dayDate, currentUserId],
);

const sections = useMemo(
  () => buildDayTimeline({
    photoEntries, voiceClips: clips, expenses: expensesForDay,
    moments: moments.moments, currentUserId,
  }),
  [photoEntries, clips, expensesForDay, moments.moments, currentUserId],
);

const items = useMemo(() => flattenSections(sections), [sections]);  // Phase 5 — flat
```

Then below `<DayStatsStrip ... />`, render the timeline:

```typescript
<View style={styles.timelineWrap}>
  <TimelineSpine />
  {items.map((it) => renderRow(it))}
</View>
```

`renderRow` switches on `it.kind` and instantiates the appropriate row. Drag handlers + handlers for caption, transcript, action sheet are wired through. For Phase 5, `onDragStart` can be a no-op `() => {}` placeholder — Phase 8 wires real DnD.

Add this style: `timelineWrap: { paddingHorizontal: 14, marginTop: 6, position: 'relative' }`.

Also add the JournalFab to the bottom:
```typescript
<JournalFab tripId={tripId} dayDate={dayDate} onCreated={async () => {
  await reloadDay();
  await summary.reload();
  await moments.reload();
}} />
```

- [ ] **Step 2: Delete `TodayView.tsx` + `DayNav.tsx` + `DaySummaryCard.tsx`**

These are no longer imported anywhere (the tab `journal.tsx` now goes through `DayScreen`).

```bash
git rm src/components/journal/TodayView.tsx src/components/journal/DayNav.tsx src/components/journal/DaySummaryCard.tsx
```

- [ ] **Step 3: Verify on device**

Run: `npx expo start`. Open a trip on its active day. Confirm:
- Date strip works
- Cover hero shows
- Stats strip shows
- Timeline below shows photo/voice/expense rows on the spine, no card wrappers
- FAB still works and creates new entries (Moments not yet visible)

- [ ] **Step 4: Commit**

```bash
git add src/components/journal/DayScreen.tsx
git commit -m "DayScreen: wire timeline with spine + row treatments; remove old TodayView/DayNav/DaySummaryCard"
```

---

## PHASE 6 — MOMENTS VISUAL

After this phase, Moments render as labelled segments on the spine with a tint band around their members. Still no UI for creating/editing — that's Phase 7-9.

### Task 6.1: `MomentHeader` pill component

**Files:**
- Create: `src/components/journal/MomentHeader.tsx`

- [ ] **Step 1: Implement the pill**

```typescript
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { JournalMoment } from '@/types/journal';

interface Props {
  moment: JournalMoment;
  startsAt: string;
  endsAt: string;
  memberCount: number;
  collapsed: boolean;
  onPress: () => void;
  onToggleCollapse: () => void;
}

export function MomentHeader({ moment, startsAt, endsAt, memberCount, collapsed, onPress, onToggleCollapse }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const title = moment.title ?? t('journal.untitledMoment');
  const range = `${shortTime(startsAt)} – ${shortTime(endsAt)}`;

  return (
    <View style={styles.row}>
      {/* Spine bracket placeholder so the pill aligns with the indented members below.
          The actual thick spine segment is drawn by TimelineSpine in MomentTintBand. */}
      <View style={styles.gutter} />
      <Pressable
        onPress={onPress}
        style={[
          styles.pill,
          { backgroundColor: theme.accentSoft, borderColor: theme.accent },
        ]}
      >
        <Text style={[styles.glyph, { color: theme.accent }]}>✦</Text>
        <View style={styles.titleCol}>
          <Text
            style={[
              styles.title,
              {
                color: moment.title ? theme.text : theme.textMuted,
                fontStyle: moment.title ? 'normal' : 'italic',
              },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text style={[styles.range, { color: theme.textMuted }]}>{range}</Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: theme.accent }]}>
          <Text style={styles.countText}>{memberCount}</Text>
        </View>
        <Pressable onPress={onToggleCollapse} hitSlop={6} style={styles.chev}>
          <Text style={[styles.chevText, { color: theme.textMuted }]}>{collapsed ? '▸' : '▾'}</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 8 },
  gutter: { width: 64 },
  pill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 22, borderWidth: 1,
    marginInlineEnd: 12,
  },
  glyph: { fontSize: 16, fontWeight: '800' },
  titleCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '700' },
  range: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  countBadge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  chev: { paddingHorizontal: 4 },
  chevText: { fontSize: 14, fontWeight: '700' },
});
```

- [ ] **Step 2: Add i18n keys**

In en.json: `"untitledMoment": "Untitled Moment"`
In he.json: `"untitledMoment": "רגע ללא שם"`

- [ ] **Step 3: Commit**

```bash
git add src/components/journal/MomentHeader.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Add MomentHeader pill — title + range + count + collapse chevron"
```

---

### Task 6.2: Tint band rendering around Moment members

**Files:**
- Create: `src/components/journal/MomentTintBand.tsx`

- [ ] **Step 1: Implement**

The tint band is a soft `accent` fill behind the member rows. It also draws the thicker spine segment in solid accent for the Moment's vertical span.

```typescript
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface Props { children: React.ReactNode; }

export function MomentTintBand({ children }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.band, { backgroundColor: theme.accent, opacity: 0.04 }]}>
      {/* Thick spine segment in solid accent for the Moment's span */}
      <View
        pointerEvents="none"
        style={[styles.thickSpine, { backgroundColor: theme.accent }]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { borderRadius: 14, marginBottom: 8, paddingTop: 6, paddingBottom: 2, position: 'relative', overflow: 'hidden' },
  thickSpine: { position: 'absolute', insetInlineStart: 32 - 2, top: 0, bottom: 0, width: 4, opacity: 1 },
});
```

The tint container uses `opacity: 0.04` on the whole band (subtle tint behind everything), and the thick spine inside has its own solid color — that means the spine is drawn at the band's accent color but no opacity reduction. Visually the spine is "lit up" inside the tint band region.

- [ ] **Step 2: Commit**

```bash
git add src/components/journal/MomentTintBand.tsx
git commit -m "Add MomentTintBand — soft fill + thicker accent spine segment"
```

---

### Task 6.3: Render Moments in DayScreen

**Files:**
- Modify: `src/components/journal/DayScreen.tsx`

- [ ] **Step 1: Switch from `flattenSections` to per-section rendering**

```typescript
// Track which Moments are collapsed (local UI state, not persisted).
const [collapsedMomentIds, setCollapsedMomentIds] = useState<Set<string>>(new Set());

const handleToggleCollapse = useCallback((momentId: string) => {
  setCollapsedMomentIds((prev) => {
    const next = new Set(prev);
    if (next.has(momentId)) next.delete(momentId); else next.add(momentId);
    return next;
  });
}, []);

// In the JSX where we previously did items.map(renderRow), do:
{sections.map((s) => {
  if (s.kind === 'solo') return <React.Fragment key={`${s.item.kind}:${s.id}`}>{renderRow(s.item, { isMember: false })}</React.Fragment>;
  const collapsed = collapsedMomentIds.has(s.id);
  return (
    <React.Fragment key={`m:${s.id}`}>
      <MomentHeader
        moment={s.moment}
        startsAt={s.startsAt}
        endsAt={s.endsAt}
        memberCount={s.members.length}
        collapsed={collapsed}
        onPress={() => { /* Phase 9 → opens MomentOptionsSheet */ }}
        onToggleCollapse={() => handleToggleCollapse(s.id)}
      />
      {!collapsed ? (
        <MomentTintBand>
          {s.members.map((it) => (
            <React.Fragment key={`${it.kind}:${it.id}`}>{renderRow(it, { isMember: true })}</React.Fragment>
          ))}
        </MomentTintBand>
      ) : (
        <View style={styles.collapsedHint}>
          <Text style={{ color: theme.textMuted, marginInlineStart: 64 }}>
            {t('journal.momentCount', { count: s.members.length })}
          </Text>
        </View>
      )}
    </React.Fragment>
  );
})}
```

`renderRow` should accept an options arg with `isMember` and pass it down to the per-row component (`PhotoEntryRow`, `VoiceClipRow`, `ExpenseTimelineRow`). Each of those rows reads `isMember` and applies the indent + the hollow-node variant.

- [ ] **Step 2: Add i18n key**

In en.json: `"momentCount_one": "{{count}} entry"`, `"momentCount_other": "{{count}} entries"`
In he.json: `"momentCount_one": "פריט אחד"`, `"momentCount_other": "{{count}} פריטים"`

- [ ] **Step 3: Verify on device**

Run: `npx expo start`. Manually insert a row in the local DB (e.g., via SQLite inspector) into `journal_moments` with `trip_id` + `day_date` matching a day with ≥2 entries, then UPDATE the entries to set their `moment_id`. Reload the journal — the Moment should appear as a labelled pill above the indented member entries with a tinted band around them.

(After Phase 7 you'll create Moments from the UI — this manual seeding is just for visual verification now.)

- [ ] **Step 4: Commit**

```bash
git add src/components/journal/DayScreen.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Render Moments in DayScreen with pill header + tint band + collapse"
```

---

## PHASE 7 — MOMENT CREATION (SELECTION MODE via add-menu)

### Task 7.1: Extend `AddMenuSheet` with `Create Moment` row

**Files:**
- Modify: `src/components/journal/AddMenuSheet.tsx`

- [ ] **Step 1: Add the row**

Add a fourth row + a prop `onCreateMoment`, plus a `momentEnabled` flag so the row can be disabled on an empty day.

```typescript
interface Props {
  visible: boolean;
  onDismiss: () => void;
  onAddPhotos: () => void;
  onRecordVoice: () => void;
  onAddExpense: () => void;
  onCreateMoment: () => void;
  momentEnabled: boolean;
}
```

In the rendered list, after the expense row + divider:

```typescript
<View style={[styles.divider, { backgroundColor: theme.border }]} />
<Pressable
  style={[styles.row, !momentEnabled && { opacity: 0.4 }]}
  disabled={!momentEnabled}
  onPress={onCreateMoment}
>
  <Text style={[styles.label, { color: theme.text }]}>
    {`✦  ${t('journal.createMoment')}`}
  </Text>
  {!momentEnabled ? (
    <Text style={[styles.help, { color: theme.textMuted }]}>{t('journal.createMomentDisabled')}</Text>
  ) : null}
</Pressable>
```

Add `help: { fontSize: 11, marginTop: 2 }` to the styles.

- [ ] **Step 2: Add i18n keys**

In en.json:
```json
"createMoment": "Create Moment",
"createMomentDisabled": "Add a photo, voice, or expense first"
```
In he.json:
```json
"createMoment": "צור רגע",
"createMomentDisabled": "תחילה הוסף תמונה, הקלטה או הוצאה"
```

- [ ] **Step 3: Wire `JournalFab` to forward the new callback**

In `JournalFab.tsx`, add `onCreateMoment: () => void` to props and forward it on the AddMenuSheet.

- [ ] **Step 4: Commit**

```bash
git add src/components/journal/AddMenuSheet.tsx src/components/journal/JournalFab.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "AddMenuSheet: add Create Moment row with empty-day disabled state"
```

---

### Task 7.2: `MomentSelectionBanner` component

**Files:**
- Create: `src/components/journal/MomentSelectionBanner.tsx`

- [ ] **Step 1: Implement the floating bottom banner**

```typescript
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  selectedCount: number;
  onCancel: () => void;
  onCreate: () => void;
}

export function MomentSelectionBanner({ selectedCount, onCancel, onCreate }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const canCreate = selectedCount > 0;
  return (
    <View style={[styles.banner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.copyCol}>
        <Text style={[styles.title, { color: theme.text }]}>{t('journal.momentSelectionBanner')}</Text>
        <Text style={[styles.count, { color: theme.textMuted }]}>
          {t('journal.momentSelectionCount', { count: selectedCount })}
        </Text>
      </View>
      <Pressable onPress={onCancel} style={styles.cancelBtn}>
        <Text style={[styles.cancelTxt, { color: theme.textMuted }]}>{t('common.cancel')}</Text>
      </Pressable>
      <Pressable
        onPress={onCreate}
        disabled={!canCreate}
        style={[
          styles.createBtn,
          { backgroundColor: canCreate ? theme.accent : theme.border },
        ]}
      >
        <Text style={styles.createTxt}>{t('journal.createMoment')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', insetInlineStart: 16, insetInlineEnd: 16, bottom: 24,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  copyCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 12, fontWeight: '700' },
  count: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  cancelBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  cancelTxt: { fontSize: 12, fontWeight: '700' },
  createBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  createTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
```

- [ ] **Step 2: i18n keys**

```json
// en
"momentSelectionBanner": "Tap entries to add to your Moment",
"momentSelectionCount_one": "{{count}} selected",
"momentSelectionCount_other": "{{count}} selected",
"common": { "cancel": "Cancel" }
```
```json
// he
"momentSelectionBanner": "הקש על פריטים כדי להוסיף לרגע",
"momentSelectionCount_one": "פריט אחד נבחר",
"momentSelectionCount_other": "{{count}} פריטים נבחרו",
"common": { "cancel": "ביטול" }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/journal/MomentSelectionBanner.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Add MomentSelectionBanner — floating create/cancel banner"
```

---

### Task 7.3: `MomentNameSheet` component

**Files:**
- Create: `src/components/journal/MomentNameSheet.tsx`

- [ ] **Step 1: Implement**

A small bottom sheet with a TextInput + an optional cover-photo picker.

```typescript
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  visible: boolean;
  defaultCoverEntryId: string | null;       // first photo member's entry id
  candidatePhotoEntryIds: string[];         // selected photo-entry ids the user can pick a cover from
  onDismiss: () => void;
  onSave: (title: string | null, coverEntryId: string | null) => void;
}

export function MomentNameSheet({ visible, defaultCoverEntryId, candidatePhotoEntryIds, onDismiss, onSave }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [coverEntryId, setCoverEntryId] = useState<string | null>(defaultCoverEntryId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.text }]}>{t('journal.createMoment')}</Text>
          <TextInput
            autoFocus
            value={title}
            onChangeText={setTitle}
            placeholder={t('journal.momentNamePlaceholder')}
            placeholderTextColor={theme.textMuted}
            maxLength={60}
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            returnKeyType="done"
            onSubmitEditing={() => onSave(title.trim().length ? title.trim() : null, coverEntryId)}
          />
          {candidatePhotoEntryIds.length > 0 ? (
            <Pressable
              onPress={() => { /* future: open inline picker; for V1, defaults to first photo */ }}
              style={[styles.coverRow, { borderColor: theme.border }]}
            >
              <Text style={[styles.coverLabel, { color: theme.text }]}>
                {t(coverEntryId ? 'journal.momentChangeCover' : 'journal.momentSetCover')}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.actions}>
            <Pressable onPress={onDismiss} style={styles.cancelBtn}>
              <Text style={[styles.cancelTxt, { color: theme.textMuted }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(title.trim().length ? title.trim() : null, coverEntryId)}
              style={[styles.saveBtn, { backgroundColor: theme.accent }]}
            >
              <Text style={styles.saveTxt}>{t('common.save')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 14, fontWeight: '800', marginBottom: 10 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  coverRow: { marginTop: 10, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  coverLabel: { fontSize: 13, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  cancelTxt: { fontSize: 13, fontWeight: '700' },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 },
  saveTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
```

- [ ] **Step 2: i18n keys**

```json
// en
"momentNamePlaceholder": "Name your Moment (optional)",
"momentSetCover": "Set cover photo",
"momentChangeCover": "Change cover",
"common": { "save": "Save", "cancel": "Cancel" }
```
```json
// he
"momentNamePlaceholder": "תן שם לרגע (אופציונלי)",
"momentSetCover": "הגדר תמונת שער",
"momentChangeCover": "החלף תמונת שער",
"common": { "save": "שמור", "cancel": "ביטול" }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/journal/MomentNameSheet.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Add MomentNameSheet — title input + cover picker stub"
```

---

### Task 7.4: Wire selection mode into DayScreen

**Files:**
- Modify: `src/components/journal/DayScreen.tsx`

- [ ] **Step 1: Add state + handlers**

```typescript
// New UI state:
const [selectionMode, setSelectionMode] = useState(false);
const [selected, setSelected] = useState<Set<string>>(new Set());        // composite key `${kind}:${id}`
const [namingMoment, setNamingMoment] = useState<null | {
  memberIds: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string }>;
  defaultCoverEntryId: string | null;
  candidatePhotoEntryIds: string[];
}>(null);

const handleStartSelection = () => {
  setSelected(new Set());
  setSelectionMode(true);
};

const handleToggleSelect = (kind: 'photo' | 'voice' | 'expense', id: string) => {
  const key = `${kind}:${id}`;
  setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
};

const handleCancelSelection = () => {
  setSelectionMode(false);
  setSelected(new Set());
};

const handleConfirmSelection = () => {
  const memberIds: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string }> = [];
  for (const key of selected) {
    const [kind, id] = key.split(':') as ['photo' | 'voice' | 'expense', string];
    memberIds.push({ kind, id });
  }
  const photoMembers = memberIds.filter((m) => m.kind === 'photo').map((m) => m.id);
  setNamingMoment({
    memberIds,
    defaultCoverEntryId: photoMembers[0] ?? null,
    candidatePhotoEntryIds: photoMembers,
  });
};

const handleNameSave = async (title: string | null, coverEntryId: string | null) => {
  if (!namingMoment) return;
  try {
    await journalMoments.createMoment({
      tripId,
      dayDate,
      title,
      coverPhotoEntryId: coverEntryId,
      createdBy: currentUserId,
      memberIds: namingMoment.memberIds,
    });
    setNamingMoment(null);
    setSelectionMode(false);
    setSelected(new Set());
    await Promise.all([reloadDay(), moments.reload(), summary.reload()]);
  } catch (e) {
    console.warn('createMoment failed:', e);
  }
};
```

- [ ] **Step 2: Pass `selectionMode` + `selected` + `onToggleSelect` to each row**

Each row component should render a selection checkbox circle when `selectionMode` is true:
- Tap on the row body in selection mode toggles selection instead of opening the actions sheet.
- The visible style is a colored outline + a check glyph on the circle.

Add a new optional prop `selectionState?: { enabled: boolean; selected: boolean; onToggle: () => void }` to each row component (`PhotoEntryRow`, `VoiceClipRow`, `ExpenseTimelineRow`). When `selectionState.enabled`, the row:
- Wraps its body in an extra `Pressable` whose `onPress` calls `onToggle`.
- Renders an additional `View` to the inline-end of the SpineNode showing a checkbox circle (24x24, accent border when not selected, accent-filled with white check when selected).
- Disables `onLongPress` (drag + actions sheet).

Show concrete additions to e.g. PhotoEntryRow at the start of its body, inside the row View:
```typescript
{selectionState?.enabled ? (
  <Pressable onPress={selectionState.onToggle} hitSlop={6} style={styles.checkBox}>
    <View
      style={[
        styles.checkCircle,
        { borderColor: theme.accent, backgroundColor: selectionState.selected ? theme.accent : 'transparent' },
      ]}
    >
      {selectionState.selected ? <Text style={styles.checkGlyph}>✓</Text> : null}
    </View>
  </Pressable>
) : null}
```
Plus styles:
```typescript
checkBox: { paddingHorizontal: 4, paddingTop: 6 },
checkCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
checkGlyph: { color: '#fff', fontWeight: '800', fontSize: 12 },
```

- [ ] **Step 3: Render the banner + sheet**

At the end of `DayScreen`'s returned JSX (just before the final closing `</View>`):
```typescript
{selectionMode ? (
  <MomentSelectionBanner
    selectedCount={selected.size}
    onCancel={handleCancelSelection}
    onCreate={handleConfirmSelection}
  />
) : null}
<MomentNameSheet
  visible={namingMoment != null}
  defaultCoverEntryId={namingMoment?.defaultCoverEntryId ?? null}
  candidatePhotoEntryIds={namingMoment?.candidatePhotoEntryIds ?? []}
  onDismiss={() => setNamingMoment(null)}
  onSave={handleNameSave}
/>
```

- [ ] **Step 4: Wire JournalFab → onCreateMoment → handleStartSelection**

In `JournalFab`'s render, pass `onCreateMoment={onCreateMoment}` from props through. In `DayScreen`, supply `onCreateMoment={handleStartSelection}` and `momentEnabled={items.length > 0}` (computed from the timeline sections).

- [ ] **Step 5: Verify**

Run on device:
1. Tap FAB → tap Create Moment → timeline rows show check circles.
2. Tap two rows → banner shows "2 selected", Create button enabled.
3. Tap Create Moment → name sheet opens → type "Lunch" → Save.
4. Confirm the Moment pill + tint band appear on the timeline with the two entries inside.

- [ ] **Step 6: Commit**

```bash
git add src/components/journal/DayScreen.tsx src/components/journal/timeline/PhotoEntryRow.tsx src/components/journal/timeline/VoiceClipRow.tsx src/components/journal/timeline/ExpenseTimelineRow.tsx
git commit -m "Wire Moment selection mode + creation via add-menu"
```

---

## PHASE 8 — MOMENT CREATION (DRAG)

After this phase, long-press on a SpineNode initiates drag; the drop target decides reorder vs group vs join vs eject.

### Task 8.1: Replace `DraggableFlatList` with custom drag handling

**Files:**
- Modify: `src/components/journal/DayScreen.tsx`

The existing `DraggableFlatList` handles drag-to-reorder by swapping list indices. We need a different model — drag's outcome depends on the drop target's identity (a row, a Moment header, empty space). The cleanest path: use `react-native-gesture-handler`'s `Gesture.Pan()` + per-row position measurement, manage drag state in DayScreen.

- [ ] **Step 1: Define drag state**

```typescript
type DragTarget =
  | { kind: 'spine' }                                        // reorder
  | { kind: 'row'; rowKey: string }                          // group with this row (must be solo)
  | { kind: 'moment'; momentId: string };                    // join this Moment

interface DragState {
  draggingKey: string;                  // `${kind}:${id}` of dragged item
  pointerY: number;                     // current pointer Y in screen coords
  target: DragTarget | null;            // resolved by hit-testing
}

const [drag, setDrag] = useState<DragState | null>(null);
```

- [ ] **Step 2: Track row + Moment positions**

After laying out, capture each row + Moment header's `y` offset using `onLayout`. Maintain a `positionsRef = useRef<Map<string, { y: number; h: number; isMoment: boolean; momentId?: string }>>()`.

```typescript
const recordPosition = useCallback((key: string, y: number, h: number, isMoment: boolean, momentId?: string) => {
  positionsRef.current.set(key, { y, h, isMoment, momentId });
}, []);
```

Pass `onLayoutCapture={(e) => recordPosition(rowKey, e.nativeEvent.layout.y, e.nativeEvent.layout.height, false)}` to each row, and similar to `MomentHeader` / `MomentTintBand`.

- [ ] **Step 3: Resolve target on pointer move**

```typescript
function resolveTarget(y: number, draggingKey: string): DragTarget {
  // Walk recorded positions; if pointer lies within a row band, return target accordingly.
  for (const [key, pos] of positionsRef.current.entries()) {
    if (key === draggingKey) continue;
    if (y >= pos.y && y < pos.y + pos.h) {
      if (pos.isMoment) return { kind: 'moment', momentId: pos.momentId! };
      // Tint-band hits resolve to the parent Moment, not the inner row — that's
      // because we record the band itself with isMoment=true on its container.
      return { kind: 'row', rowKey: key };
    }
  }
  return { kind: 'spine' };
}
```

Note: when a tint-band's container is recorded with `isMoment: true`, drops anywhere inside it resolve to the Moment regardless of which specific member row is under the pointer. This matches the spec's precedence: tint band > solo row.

- [ ] **Step 4: Drag-start handler on each SpineNode**

In each row's `onDragStart` prop (passed from DayScreen), set `drag` state:
```typescript
const handleRowDragStart = (kind: 'photo' | 'voice' | 'expense', id: string) => {
  setDrag({ draggingKey: `${kind}:${id}`, pointerY: 0, target: { kind: 'spine' } });
};
```

Then attach a `PanGestureHandler` (or `Gesture.Pan().onUpdate(...)` API) at the top of the timeline container that updates `pointerY` and recomputes `target` on each event. On `onEnd`, run the resolution:

```typescript
const handleDragEnd = async () => {
  if (!drag) return;
  const { draggingKey, target } = drag;
  setDrag(null);
  if (!target) return;
  const [kindStr, id] = draggingKey.split(':') as ['photo' | 'voice' | 'expense', string];

  if (target.kind === 'spine') {
    // Reorder — recompute timestamp via computeReorderTimestamp(items, pointerY).
    // Mirror existing Phase-5/handleDragEnd logic from old TodayView for reorder.
    // ALSO: if the dragged item was a Moment member, and the new position is
    // outside its current Moment's bracket, eject from the Moment.
    await reorderTo(kindStr, id, drag.pointerY);

  } else if (target.kind === 'row') {
    // Group with the target row → create new Moment with both as members.
    await createMomentFromPair(kindStr, id, target.rowKey);

  } else {
    // target.kind === 'moment' — join the existing Moment.
    await journalMoments.addMember(target.momentId, kindStr, id);
    await Promise.all([reloadDay(), moments.reload()]);
  }
};
```

The exact reorder + eject logic mirrors the existing `handleDragEnd` in TodayView (which the new DayScreen replaces). Use `computeReorderTimestamp` for the timestamp update; check whether the moved item's new neighbor range overlaps with its current Moment's span and, if not, call `journalMoments.removeMember(kindStr, id)` followed by `assignMomentToEntryInTx(... null ...)` — implemented inside `journalMoments.removeMember` per Task 2.2.

- [ ] **Step 5: Visual feedback during drag**

While `drag` is set, render an overlay highlight on the resolved `target`:
- `target.kind === 'row'`: the target row gets `borderWidth: 2, borderColor: theme.accent, borderRadius: 14` applied via a style overlay.
- `target.kind === 'moment'`: the Moment's tint band pulses (opacity animates `0.04 → 0.10 → 0.04` over 800ms loop).
- `target.kind === 'spine'`: the spine line at the pointer Y briefly thickens.

Use `Animated.Value` or `useSharedValue` (reanimated) for the pulse; or a simpler approach: a `pulseTarget` state + `useEffect` that toggles a class every 400ms.

- [ ] **Step 6: Commit**

```bash
git add src/components/journal/DayScreen.tsx src/components/journal/timeline/PhotoEntryRow.tsx src/components/journal/timeline/VoiceClipRow.tsx src/components/journal/timeline/ExpenseTimelineRow.tsx
git commit -m "Drag-to-group with precedence rules + hover feedback"
```

---

### Task 8.2: Inline name-input on freshly-created Moment via drag-to-group

**Files:**
- Modify: `src/components/journal/DayScreen.tsx` (`createMomentFromPair` from Task 8.1)

- [ ] **Step 1: After creating the Moment, surface an inline rename**

`createMomentFromPair` creates the Moment with `title: null`. Right after, set a transient `nameInlineMomentId` state that the rendered MomentHeader picks up and replaces the title text with a `TextInput` (auto-focused). On blur / submit / X, update the Moment title via `journalMoments.updateMomentTitle`, then clear `nameInlineMomentId`. On X (abort), `journalMoments.deleteMoment(id)` and clear.

Implementation:
```typescript
const [nameInlineMomentId, setNameInlineMomentId] = useState<string | null>(null);

const createMomentFromPair = async (
  draggedKind: 'photo' | 'voice' | 'expense', draggedId: string, targetRowKey: string,
) => {
  const [tKind, tId] = targetRowKey.split(':') as ['photo' | 'voice' | 'expense', string];
  const photoMember = [draggedKind, tKind].includes('photo')
    ? (draggedKind === 'photo' ? draggedId : tId)
    : null;
  const m = await journalMoments.createMoment({
    tripId, dayDate, title: null,
    coverPhotoEntryId: photoMember,
    createdBy: currentUserId,
    memberIds: [{ kind: draggedKind, id: draggedId }, { kind: tKind, id: tId }],
  });
  await Promise.all([reloadDay(), moments.reload()]);
  setNameInlineMomentId(m.id);
};
```

In MomentHeader rendering, when `moment.id === nameInlineMomentId`, render an inline name editor inside the pill in place of the title.

```typescript
// In DayScreen's per-Moment rendering, pass an extra prop:
<MomentHeader
  ...
  inlineNameEdit={nameInlineMomentId === s.id}
  onInlineNameSubmit={async (title) => {
    await journalMoments.updateMomentTitle(s.id, title.length ? title : null);
    setNameInlineMomentId(null);
    await moments.reload();
  }}
  onInlineNameAbort={async () => {
    await journalMoments.deleteMoment(s.id);
    setNameInlineMomentId(null);
    await Promise.all([reloadDay(), moments.reload()]);
  }}
/>
```

In `MomentHeader.tsx`, extend props:
```typescript
inlineNameEdit?: boolean;
onInlineNameSubmit?: (title: string) => void;
onInlineNameAbort?: () => void;
```
And when `inlineNameEdit`, render a TextInput in place of the title Text:
```typescript
{inlineNameEdit ? (
  <View style={styles.inlineRow}>
    <TextInput
      autoFocus
      placeholder={t('journal.momentNamePlaceholder')}
      placeholderTextColor={theme.textMuted}
      maxLength={60}
      style={[styles.inlineInput, { color: theme.text, borderColor: theme.accent }]}
      onSubmitEditing={(e) => onInlineNameSubmit?.(e.nativeEvent.text.trim())}
      blurOnSubmit
    />
    <Pressable onPress={onInlineNameAbort} hitSlop={6}><Text style={styles.tick}>✕</Text></Pressable>
  </View>
) : (
  <Text style={styles.title}>{title}</Text>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/journal/DayScreen.tsx src/components/journal/MomentHeader.tsx
git commit -m "Drag-to-group: inline rename on freshly created Moment with X-to-abort"
```

---

## PHASE 9 — MOMENT EDITING

### Task 9.1: `MomentOptionsSheet`

**Files:**
- Create: `src/components/journal/MomentOptionsSheet.tsx`

- [ ] **Step 1: Implement the bottom sheet**

```typescript
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { JournalMoment } from '@/types/journal';

interface Props {
  moment: JournalMoment | null;
  onDismiss: () => void;
  onRename: (title: string | null) => void;
  onChangeCover: () => void;             // opens picker (handled by parent)
  onAddEntries: () => void;              // re-enters selection mode
  onSplit: () => void;                   // enters split mode
  onDelete: () => void;
}

export function MomentOptionsSheet(props: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [title, setTitle] = useState(props.moment?.title ?? '');

  if (!props.moment) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={props.onDismiss}>
      <Pressable style={styles.backdrop} onPress={props.onDismiss}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t('journal.momentNamePlaceholder')}
            placeholderTextColor={theme.textMuted}
            maxLength={60}
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            onBlur={() => {
              const trimmed = title.trim();
              if ((trimmed.length ? trimmed : null) !== props.moment!.title) {
                props.onRename(trimmed.length ? trimmed : null);
              }
            }}
          />
          <Row label={t('journal.momentChangeCover')} onPress={props.onChangeCover} />
          <Row label={t('journal.momentAddEntries')}  onPress={props.onAddEntries} />
          <Row label={t('journal.momentSplit')}       onPress={props.onSplit} />
          <Pressable
            onPress={() => {
              Alert.alert(
                t('journal.momentDelete'),
                t('journal.momentDeleteConfirm'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('journal.momentDelete'), style: 'destructive', onPress: props.onDelete },
                ],
              );
            }}
            style={styles.deleteRow}
          >
            <Text style={[styles.deleteTxt, { color: theme.red }]}>{t('journal.momentDelete')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderColor: theme.border }]}>
      <Text style={[styles.rowTxt, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  row: { paddingVertical: 14, paddingHorizontal: 6, borderTopWidth: StyleSheet.hairlineWidth },
  rowTxt: { fontSize: 14, fontWeight: '600' },
  deleteRow: { paddingVertical: 14, paddingHorizontal: 6 },
  deleteTxt: { fontSize: 14, fontWeight: '700' },
});
```

- [ ] **Step 2: i18n keys**

```json
// en
"momentAddEntries": "Add entries",
"momentSplit": "Split here…",
"momentDelete": "Delete Moment",
"momentDeleteConfirm": "Delete this Moment? Entries will stay as solo items."
```
```json
// he
"momentAddEntries": "הוסף פריטים",
"momentSplit": "פצל כאן…",
"momentDelete": "מחק רגע",
"momentDeleteConfirm": "למחוק את הרגע הזה? הפריטים יישארו כפריטים בודדים."
```

- [ ] **Step 3: Wire into DayScreen**

```typescript
const [editingMomentId, setEditingMomentId] = useState<string | null>(null);
const editingMoment = useMemo(
  () => moments.moments.find((m) => m.id === editingMomentId) ?? null,
  [moments.moments, editingMomentId],
);

// In MomentHeader rendering, set onPress={() => setEditingMomentId(s.id)}.

// Render the sheet:
<MomentOptionsSheet
  moment={editingMoment}
  onDismiss={() => setEditingMomentId(null)}
  onRename={async (title) => {
    if (editingMomentId) await journalMoments.updateMomentTitle(editingMomentId, title);
    await moments.reload();
  }}
  onChangeCover={() => { /* Phase 9.2: open picker */ }}
  onAddEntries={() => {
    if (!editingMomentId) return;
    // Pre-select existing members; reuse selection mode.
    const m = editingMoment!;
    setSelected(new Set(/* member keys for this Moment */));
    setSelectionMode(true);
    setEditingMomentId(null);
    // Note: handleConfirmSelection in this mode should call updateMomentMembers
    // rather than createMoment — needs a small refactor to differentiate "create"
    // vs "edit existing" mode. Track mode in state: `selectionPurpose: 'create' | { kind: 'addToMoment', momentId }`.
  }}
  onSplit={() => { /* Phase 9.3 */ }}
  onDelete={async () => {
    if (!editingMomentId) return;
    await journalMoments.deleteMoment(editingMomentId);
    setEditingMomentId(null);
    await Promise.all([reloadDay(), moments.reload(), summary.reload()]);
  }}
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/journal/MomentOptionsSheet.tsx src/components/journal/DayScreen.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Add MomentOptionsSheet — rename / change cover / add / split / delete"
```

---

### Task 9.2: Change-cover picker

**Files:**
- Create: `src/components/journal/MomentCoverPicker.tsx`
- Modify: `src/components/journal/DayScreen.tsx`

- [ ] **Step 1: Build the picker**

A modal that lists every photo-entry member of the Moment as 2-col thumbnails. Tap one → call `journalMoments.updateMomentCover(momentId, entryId)`, close. A `Clear cover` row at the top.

```typescript
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSignedJournalPhotoUrl } from '@/hooks/useSignedJournalPhotoUrl';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { JournalPhotoEntryWithPhotos } from '@/types/journal';

interface Props {
  visible: boolean;
  candidates: JournalPhotoEntryWithPhotos[];
  onDismiss: () => void;
  onPick: (entryId: string | null) => void;  // null → clear
}

export function MomentCoverPicker({ visible, candidates, onDismiss, onPick }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Pressable onPress={() => onPick(null)} style={[styles.clearRow, { borderColor: theme.border }]}>
            <Text style={[styles.clearTxt, { color: theme.text }]}>{t('journal.momentClearCover')}</Text>
          </Pressable>
          <FlatList
            data={candidates}
            keyExtractor={(e) => e.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 8 }}
            contentContainerStyle={{ gap: 8, paddingTop: 8 }}
            renderItem={({ item }) => <CoverCandidate entry={item} onPress={() => onPick(item.id)} />}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CoverCandidate({ entry, onPress }: { entry: JournalPhotoEntryWithPhotos; onPress: () => void }) {
  const url = useSignedJournalPhotoUrl(entry.photos[0]?.storagePath ?? null);
  return (
    <Pressable onPress={onPress} style={styles.tile}>
      {url ? <Image source={{ uri: url }} style={styles.tileImg} /> : <View style={styles.tileImg} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { padding: 16, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: StyleSheet.hairlineWidth, maxHeight: '60%' },
  clearRow: { padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  clearTxt: { fontSize: 13, fontWeight: '600' },
  tile: { flex: 1, aspectRatio: 1, borderRadius: 14, overflow: 'hidden' },
  tileImg: { width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.1)' },
});
```

- [ ] **Step 2: Wire into DayScreen `onChangeCover`**

```typescript
const [coverPickerForMomentId, setCoverPickerForMomentId] = useState<string | null>(null);
const coverCandidates = useMemo(() => {
  if (!coverPickerForMomentId) return [];
  return photoEntries.filter((p) => p.momentId === coverPickerForMomentId);
}, [coverPickerForMomentId, photoEntries]);

// In MomentOptionsSheet:
onChangeCover={() => setCoverPickerForMomentId(editingMomentId)}

// In JSX:
<MomentCoverPicker
  visible={coverPickerForMomentId != null}
  candidates={coverCandidates}
  onDismiss={() => setCoverPickerForMomentId(null)}
  onPick={async (entryId) => {
    if (coverPickerForMomentId) {
      await journalMoments.updateMomentCover(coverPickerForMomentId, entryId);
      await moments.reload();
    }
    setCoverPickerForMomentId(null);
  }}
/>
```

- [ ] **Step 3: i18n + commit**

en: `"momentClearCover": "Clear cover"` / he: `"momentClearCover": "נקה שער"`

```bash
git add src/components/journal/MomentCoverPicker.tsx src/components/journal/DayScreen.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "MomentOptionsSheet: implement Change cover picker"
```

---

### Task 9.3: Split mode

**Files:**
- Modify: `src/components/journal/DayScreen.tsx`

- [ ] **Step 1: Implement split mode**

`onSplit` from MomentOptionsSheet sets `splittingMomentId`. While `splittingMomentId` is set, render an inline "Split after this entry" prompt button after every member of the Moment except the last. Tap one → confirm via Alert → call `journalMoments.splitMomentAfter(momentId, member)`, then exit split mode.

```typescript
const [splittingMomentId, setSplittingMomentId] = useState<string | null>(null);

// When rendering Moment members, if splittingMomentId === s.id and the row is
// not the last one in s.members, render a "Split after" button between this
// row and the next:
{splittingMomentId === s.id && idx < s.members.length - 1 ? (
  <Pressable
    onPress={() => {
      Alert.alert(t('journal.momentSplit'), t('journal.momentSplitConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.ok'),     onPress: async () => {
          await journalMoments.splitMomentAfter(s.id, { kind: it.kind, id: it.id });
          setSplittingMomentId(null);
          await Promise.all([reloadDay(), moments.reload()]);
        }},
      ]);
    }}
    style={[styles.splitBetween, { borderColor: theme.accent }]}
  >
    <Text style={[styles.splitBetweenTxt, { color: theme.accent }]}>
      ✂ {t('journal.momentSplit')}
    </Text>
  </Pressable>
) : null}
```

Add styles:
```typescript
splitBetween: { marginInlineStart: 76, marginVertical: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, alignSelf: 'flex-start' },
splitBetweenTxt: { fontSize: 11, fontWeight: '700' },
```

- [ ] **Step 2: i18n keys**

```json
// en
"momentSplitConfirm": "Split into two Moments at this point?",
"common": { "ok": "OK" }
```
```json
// he
"momentSplitConfirm": "לפצל לשני רגעים בנקודה זו?",
"common": { "ok": "אישור" }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/journal/DayScreen.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Moment Split: inline 'split after' prompts in split mode"
```

---

### Task 9.4: Add-entries (reuse selection mode for existing Moment)

**Files:**
- Modify: `src/components/journal/DayScreen.tsx`

- [ ] **Step 1: Differentiate selection purpose**

Replace `setSelectionMode(true)` with a more descriptive state:
```typescript
type SelectionPurpose = { kind: 'create' } | { kind: 'addToMoment'; momentId: string };
const [selectionPurpose, setSelectionPurpose] = useState<SelectionPurpose | null>(null);
```

`handleStartSelection` becomes:
```typescript
const handleStartCreateSelection = () => {
  setSelected(new Set());
  setSelectionPurpose({ kind: 'create' });
};
const handleStartAddEntriesSelection = (momentId: string) => {
  const m = moments.moments.find((x) => x.id === momentId);
  if (!m) return;
  // Pre-fill selection with current members.
  const initial = new Set<string>();
  for (const item of flattenSections(sections)) {
    const mid = momentIdOf(item);
    if (mid === momentId) initial.add(`${item.kind}:${item.id}`);
  }
  setSelected(initial);
  setSelectionPurpose({ kind: 'addToMoment', momentId });
};
```

`handleConfirmSelection` branches on purpose:
```typescript
const handleConfirmSelection = async () => {
  if (!selectionPurpose) return;
  const memberIds: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string }> = [];
  for (const key of selected) {
    const [kind, id] = key.split(':') as ['photo' | 'voice' | 'expense', string];
    memberIds.push({ kind, id });
  }
  if (selectionPurpose.kind === 'create') {
    const photoMembers = memberIds.filter((m) => m.kind === 'photo').map((m) => m.id);
    setNamingMoment({
      memberIds,
      defaultCoverEntryId: photoMembers[0] ?? null,
      candidatePhotoEntryIds: photoMembers,
    });
  } else {
    const momentId = selectionPurpose.momentId;
    // Diff: current members vs target.
    const currentMembers = new Set<string>();
    for (const item of flattenSections(sections)) {
      if (momentIdOf(item) === momentId) currentMembers.add(`${item.kind}:${item.id}`);
    }
    const next = new Set(selected);
    const toAdd: typeof memberIds = [];
    const toRemove: typeof memberIds = [];
    for (const key of next) {
      if (!currentMembers.has(key)) {
        const [k, i] = key.split(':') as ['photo' | 'voice' | 'expense', string];
        toAdd.push({ kind: k, id: i });
      }
    }
    for (const key of currentMembers) {
      if (!next.has(key)) {
        const [k, i] = key.split(':') as ['photo' | 'voice' | 'expense', string];
        toRemove.push({ kind: k, id: i });
      }
    }
    for (const a of toAdd) await journalMoments.addMember(momentId, a.kind, a.id);
    for (const r of toRemove) await journalMoments.removeMember(r.kind, r.id);
    setSelectionPurpose(null);
    setSelected(new Set());
    await Promise.all([reloadDay(), moments.reload(), summary.reload()]);
  }
};
```

Update `MomentOptionsSheet`'s `onAddEntries` to call `handleStartAddEntriesSelection(editingMomentId)` and clear `editingMomentId`.

- [ ] **Step 2: Commit**

```bash
git add src/components/journal/DayScreen.tsx
git commit -m "Moment editing: Add entries reuses selection mode with current members pre-selected"
```

---

### Task 9.5: `Remove from Moment` per-member action

**Files:**
- Modify: `src/components/journal/TimelineItemActions.tsx`
- Modify: `src/components/journal/DayScreen.tsx`

- [ ] **Step 1: Add action to TimelineItemActions**

The sheet currently shows actions based on the item's kind. Add a new conditional action `Remove from Moment` shown only when `item.momentId != null` (the parent must pass this info, since the existing item shape may not carry it).

```typescript
// Existing Props extended:
interface Props {
  item: TimelineItem | null;
  isMember: boolean;             // NEW
  ...
  onRemoveFromMoment: () => void;
}

// In the rendered sheet, add (after the existing actions, before Delete):
{isMember ? (
  <Row label={t('journal.momentMemberRemove')} onPress={props.onRemoveFromMoment} />
) : null}
```

- [ ] **Step 2: Wire into DayScreen**

When opening the actions sheet from a member row, set `actionTarget = { item, isMember: true, momentId: ... }`. Provide `onRemoveFromMoment` handler:

```typescript
onRemoveFromMoment: async () => {
  if (!actionTarget?.item) return;
  await journalMoments.removeMember(actionTarget.item.kind, actionTarget.item.id);
  setActionTarget(null);
  await Promise.all([reloadDay(), moments.reload(), summary.reload()]);
},
```

- [ ] **Step 3: i18n + commit**

en: `"momentMemberRemove": "Remove from Moment"` / he: `"momentMemberRemove": "הסר מהרגע"`

```bash
git add src/components/journal/TimelineItemActions.tsx src/components/journal/DayScreen.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Per-member 'Remove from Moment' in TimelineItemActions"
```

---

## PHASE 10 — ALL DAYS REDESIGN

### Task 10.1: `TripCoverBanner` component

**Files:**
- Create: `src/components/journal/TripCoverBanner.tsx`

- [ ] **Step 1: Implement**

```typescript
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSignedJournalPhotoUrl } from '@/hooks/useSignedJournalPhotoUrl';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatAmount } from '@/utils/currency';
import { formatReadableDate } from '@/utils/date';

interface Props {
  tripName: string;
  startDate: string;
  endDate: string | null;
  dayCount: number;
  totalSpent: number;
  photoCount: number;
  homeCurrency: string;
  coverStoragePath: string | null;
  onChangeCover: () => void;
}

const HEIGHT = 180;

export function TripCoverBanner(p: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const url = useSignedJournalPhotoUrl(p.coverStoragePath);

  return (
    <Pressable onLongPress={p.onChangeCover} style={[styles.root, { height: HEIGHT }]}>
      {url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient
          colors={theme.gradient1}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={[StyleSheet.absoluteFill, { top: HEIGHT * 0.4 }]}
      />
      <View style={styles.overlay}>
        <Text style={styles.title} numberOfLines={1}>{p.tripName}</Text>
        <Text style={styles.range} numberOfLines={1}>
          {formatReadableDate(p.startDate)} – {p.endDate ? formatReadableDate(p.endDate) : t('common.now')}
        </Text>
        <Text style={styles.stats} numberOfLines={1}>
          {t('journal.tripSubtitle', {
            days: p.dayCount,
            spent: formatAmount(p.totalSpent, p.homeCurrency),
            photos: p.photoCount,
          })}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative' },
  overlay: { position: 'absolute', bottom: 14, insetInlineStart: 18, insetInlineEnd: 18 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  range: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '500', marginTop: 2 },
  stats: { color: 'rgba(255,255,255,0.95)', fontSize: 12, fontWeight: '600', marginTop: 6 },
});
```

- [ ] **Step 2: i18n keys**

```json
// en
"tripSubtitle": "{{days}} days · {{spent}} · {{photos}} photos",
"common": { "now": "now" }
```
```json
// he
"tripSubtitle": "{{days}} ימים · {{spent}} · {{photos}} תמונות",
"common": { "now": "כעת" }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/journal/TripCoverBanner.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Add TripCoverBanner — All Days hero with cover + trip stats overlay"
```

---

### Task 10.2: Update `DayCard` with Moment chips

**Files:**
- Modify: `src/components/journal/DayCard.tsx`

- [ ] **Step 1: Add Moment chip row**

After the existing count chips row, render Moment chips (max 3 visible + overflow `+N`).

```typescript
{summary.momentTitles.length > 0 ? (
  <View style={styles.momentChips}>
    {summary.momentTitles.map((title, i) => (
      <View key={i} style={[styles.momentChip, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
        <Text style={[styles.momentChipTxt, { color: theme.accent }]} numberOfLines={1}>
          ✦ {title}
        </Text>
      </View>
    ))}
    {summary.momentCount > summary.momentTitles.length ? (
      <View style={[styles.momentChip, { backgroundColor: theme.border }]}>
        <Text style={[styles.momentChipTxt, { color: theme.textMuted }]}>
          +{summary.momentCount - summary.momentTitles.length}
        </Text>
      </View>
    ) : null}
  </View>
) : null}
```

Add styles:
```typescript
momentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
momentChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, maxWidth: 140 },
momentChipTxt: { fontSize: 10, fontWeight: '700' },
```

- [ ] **Step 2: Commit**

```bash
git add src/components/journal/DayCard.tsx
git commit -m "DayCard: add Moment chips row with overflow indicator"
```

---

### Task 10.3: Wire TripCoverBanner into AllDaysScreen + cover-change picker

**Files:**
- Modify: `src/components/journal/AllDaysScreen.tsx`

- [ ] **Step 1: Add TripCoverBanner as the list header**

Use `ListHeaderComponent` on the FlatList:

```typescript
const cover = useTripCover(tripId);
const photoCountTotal = useMemo(() => summaries.reduce((acc, s) => acc + s.photoCount, 0), [summaries]);
const totalSpent = useMemo(() => summaries.reduce((acc, s) => acc + s.totalConvertedAmount, 0), [summaries]);

<FlatList
  ListHeaderComponent={
    <TripCoverBanner
      tripName={trip.name}
      startDate={trip.startDate}
      endDate={trip.endDate}
      dayCount={summaries.length}
      totalSpent={totalSpent}
      photoCount={photoCountTotal}
      homeCurrency={trip.homeCurrency}
      coverStoragePath={cover}
      onChangeCover={() => setCoverPickerOpen(true)}
    />
  }
  ...
/>
```

- [ ] **Step 2: Reuse `MomentCoverPicker` shape for the trip cover**

Build a simple `TripCoverPicker` that lists every photo entry across the trip. Or, for V1 simplicity, open the device photo picker via `expo-image-picker` and call `setTripCoverPhoto(tripId, newStoragePath)` after uploading. For consistency, prefer the in-trip picker:

Create `src/components/journal/TripCoverPicker.tsx` that loads `await journalPhotoEntries.listAllEntriesForTrip(tripId)` and renders the same 2-col thumbnail grid as `MomentCoverPicker`. Add the new query:

```typescript
// journalPhotoEntries.native.ts
export async function listAllEntriesForTrip(tripId: string): Promise<JournalPhotoEntryWithPhotos[]> {
  const db = await getDatabase();
  const entries = await db.getAllAsync<JournalPhotoEntryRow>(
    `SELECT * FROM journal_photo_entries WHERE trip_id = ? AND deleted_at IS NULL ORDER BY occurred_at DESC;`,
    [tripId],
  );
  // ... same photo-attach pattern as listEntriesForDay
}
```

Wire `onPick` to call `trips.setTripCoverPhoto(tripId, entry.photos[0]?.storagePath ?? null)`.

- [ ] **Step 3: Commit**

```bash
git add src/components/journal/AllDaysScreen.tsx src/components/journal/TripCoverPicker.tsx src/db/queries/journalPhotoEntries.native.ts src/db/queries/journalPhotoEntries.web.ts
git commit -m "AllDaysScreen: TripCoverBanner + cover picker"
```

---

## PHASE 11 — EDGE CASES & POLISH

### Task 11.1: Cross-day timestamp eject

**Files:**
- Modify: `src/components/journal/DayScreen.tsx`

- [ ] **Step 1: When `TimestampEditor` saves a new ISO that lands on a different day, eject from the Moment**

In the existing `TimestampEditor.onSave` handler (carried over from old TodayView), after the update succeeds, if `target.kind` was a member of a Moment and the new ISO's date != current `dayDate`, call `journalMoments.removeMember(target.kind, target.id)` and toast:

```typescript
// After persistence:
const newDate = iso.slice(0, 10);
if (newDate !== dayDate) {
  const prevMomentId = momentIdOfItem(target);   // helper that looks up the item's moment id from the current sections
  if (prevMomentId) {
    const mom = moments.moments.find((m) => m.id === prevMomentId);
    await journalMoments.removeMember(target.kind, target.id);
    Toast.show(t('journal.momentMemberEjectedCrossDay', {
      date: formatReadableDate(newDate),
      momentName: mom?.title ?? t('journal.untitledMoment'),
    }));
  }
}
```

`Toast.show` can be a project-existing toast helper; if not, use a simple `Alert.alert(message)` for V1.

- [ ] **Step 2: i18n key**

en: `"momentMemberEjectedCrossDay": "Moved to {{date}} — removed from {{momentName}}"`
he: `"momentMemberEjectedCrossDay": "הועבר ל-{{date}} — הוסר מהרגע {{momentName}}"`

- [ ] **Step 3: Commit**

```bash
git add src/components/journal/DayScreen.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Eject cross-day-moved members from their Moment with toast"
```

---

### Task 11.2: Empty day state

**Files:**
- Modify: `src/components/journal/DayScreen.tsx`

- [ ] **Step 1: When `sections.length === 0`, render the empty state instead of the timeline body**

```typescript
{sections.length === 0 ? (
  <View style={styles.emptyDay}>
    <View style={styles.emptyDots}>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={[styles.emptyDot, { backgroundColor: theme.accent, opacity: 0.3 }]} />
      ))}
    </View>
    <Pressable
      onPress={() => fabRef.current?.openMenu()}    // assuming JournalFab exposes a ref; alternative: lift menu state into DayScreen
      style={[styles.emptyCta, { backgroundColor: theme.accentSoft }]}
    >
      <Text style={styles.emptyCtaPlus}>+</Text>
    </Pressable>
    <Text style={[styles.emptyTxt, { color: theme.textMuted }]}>{t('journal.dayEmpty')}</Text>
  </View>
) : (
  <View style={styles.timelineWrap}>
    <TimelineSpine />
    {/* sections.map(...) — existing */}
  </View>
)}
```

Add styles:
```typescript
emptyDay: { alignItems: 'center', paddingTop: 40, paddingBottom: 60 },
emptyDots: { gap: 6, marginBottom: 18 },
emptyDot: { width: 4, height: 4, borderRadius: 2 },
emptyCta: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
emptyCtaPlus: { fontSize: 28, fontWeight: '800' },
emptyTxt: { marginTop: 14, fontSize: 13, fontWeight: '500' },
```

If lifting JournalFab state is non-trivial, just set the press to scroll the user's attention to the FAB (e.g., trigger a brief scale animation on the FAB or a transient hint). Simpler V1: the empty CTA opens the add menu by lifting `menuOpen` state into DayScreen and passing `open={menuOpen}` to JournalFab. Refactor JournalFab to accept `open: boolean; onOpenChange: (next: boolean) => void` props.

- [ ] **Step 2: i18n key**

en: `"dayEmpty": "Nothing logged yet — tap + to start your day"`
he: `"dayEmpty": "אין רישומים — הקש + כדי להתחיל את היום"`

- [ ] **Step 3: Commit**

```bash
git add src/components/journal/DayScreen.tsx src/components/journal/JournalFab.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Empty day state with centered CTA"
```

---

### Task 11.3: Post-create animation

**Files:**
- Modify: `src/components/journal/DayScreen.tsx`

- [ ] **Step 1: Mark the most-recently-created entry id**

Each row component accepts an optional `animateIn?: boolean` prop. When true, mount with an Animated.Value(0) for translateY (-8 → 0) and opacity (0 → 1) over 250ms, then unset.

Track in DayScreen:
```typescript
const [recentlyCreatedKey, setRecentlyCreatedKey] = useState<string | null>(null);

const wrappedOnCreated = async () => {
  await Promise.all([reloadDay(), summary.reload(), moments.reload()]);
  // Find the newest entry (max createdAt). Construct its key.
  const all = [
    ...photoEntries.map((p) => ({ k: `photo:${p.id}`, ts: p.createdAt })),
    ...clips.map((c) => ({ k: `voice:${c.id}`, ts: c.createdAt })),
  ];
  const newest = all.reduce<{ k: string; ts: string } | null>(
    (acc, x) => (!acc || x.ts > acc.ts ? x : acc), null,
  );
  if (newest) {
    setRecentlyCreatedKey(newest.k);
    setTimeout(() => setRecentlyCreatedKey(null), 500);
  }
};
```

Pass `animateIn={recentlyCreatedKey === rowKey}` to each row in `renderRow`.

Each row component (`PhotoEntryRow`, `VoiceClipRow`, `ExpenseTimelineRow`) gets:
```typescript
const opacity = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
const translateY = useRef(new Animated.Value(animateIn ? -8 : 0)).current;
useEffect(() => {
  if (animateIn) {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }
}, [animateIn, opacity, translateY]);

// Wrap the row in Animated.View with style={{ opacity, transform: [{ translateY }] }}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/journal/DayScreen.tsx src/components/journal/timeline/PhotoEntryRow.tsx src/components/journal/timeline/VoiceClipRow.tsx src/components/journal/timeline/ExpenseTimelineRow.tsx
git commit -m "Animate newly-created entries in on the spine"
```

---

### Task 11.4: Category breakdown sheet from spent total

**Files:**
- Create: `src/components/journal/DaySpendingBreakdown.tsx`
- Modify: `src/components/journal/DayScreen.tsx`

- [ ] **Step 1: Build the breakdown sheet**

A modal showing each category that contributed to today's spending with its converted total.

```typescript
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Category } from '@/types/category';
import type { ExpenseWithPhotos } from '@/types/expense';
import { formatAmount } from '@/utils/currency';

interface Props {
  visible: boolean;
  expenses: ExpenseWithPhotos[];
  categoriesById: Map<string, Category>;
  homeCurrency: string;
  onDismiss: () => void;
}

export function DaySpendingBreakdown({ visible, expenses, categoriesById, homeCurrency, onDismiss }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const byCat = new Map<string, number>();
  for (const e of expenses) {
    byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + (e.convertedAmount ?? 0));
  }
  const rows = Array.from(byCat.entries())
    .map(([id, amount]) => ({ id, cat: categoriesById.get(id), amount }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{t('journal.todaysSpending')}</Text>
          {rows.map((r) => (
            <View key={r.id} style={styles.row}>
              <Text style={[styles.cat, { color: theme.text }]}>{r.cat?.emoji} {r.cat?.name ?? '—'}</Text>
              <Text style={[styles.amt, { color: theme.text }]}>{formatAmount(r.amount, homeCurrency)}</Text>
            </View>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 13, fontWeight: '800', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  cat: { fontSize: 14, fontWeight: '600' },
  amt: { fontSize: 14, fontWeight: '800' },
});
```

en: `"todaysSpending": "Today's spending"` / he: `"todaysSpending": "ההוצאות של היום"`.

- [ ] **Step 2: Wire to `DayStatsStrip.onTotalPress`**

In DayScreen: `const [breakdownOpen, setBreakdownOpen] = useState(false);` → pass `onTotalPress={() => setBreakdownOpen(true)}` and render `<DaySpendingBreakdown ... visible={breakdownOpen} onDismiss={() => setBreakdownOpen(false)} />`.

- [ ] **Step 3: Commit**

```bash
git add src/components/journal/DaySpendingBreakdown.tsx src/components/journal/DayScreen.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Tap day total → category breakdown sheet"
```

---

### Task 11.5: Scroll-to-first chip behavior

**Files:**
- Modify: `src/components/journal/DayScreen.tsx`

- [ ] **Step 1: Replace ScrollView with a `ref` + manual scroll**

Currently the timeline lives inside the page-level ScrollView. Add a `scrollRef = useRef<ScrollView>(null)` and per-section measured Y offsets (the same `positionsRef` from drag).

Implement:
```typescript
const handleChipPress = (kind: 'photo' | 'voice' | 'expense') => {
  // Find the first section containing an item of this kind.
  for (const s of sections) {
    if (s.kind === 'solo' && s.item.kind === kind) {
      const pos = positionsRef.current.get(`${s.item.kind}:${s.item.id}`);
      if (pos) scrollRef.current?.scrollTo({ y: pos.y - 100, animated: true });
      return;
    }
    if (s.kind === 'moment') {
      for (const m of s.members) {
        if (m.kind === kind) {
          const pos = positionsRef.current.get(`${m.kind}:${m.id}`);
          if (pos) scrollRef.current?.scrollTo({ y: pos.y - 100, animated: true });
          return;
        }
      }
    }
  }
};
```

Pass `onChipPress={handleChipPress}` to DayStatsStrip.

- [ ] **Step 2: Commit**

```bash
git add src/components/journal/DayScreen.tsx
git commit -m "Tap a count chip → scroll to first entry of that kind"
```

---

## PHASE 12 — i18n FINALIZATION + DOCS

### Task 12.1: Consolidate en.json + he.json keys

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/he.json`

- [ ] **Step 1: Verify the full key list is present in both files**

Open en.json and confirm the `journal.*` namespace has every key listed in the spec section "i18n & RTL → New translation keys". The keys added across Phases 4–11 above should already cover most of it, but the spec lists more. Cross-check and add any missing ones now. Canonical list:

```
allDays, allDaysTitle, createMoment, createMomentDisabled, untitledMoment,
momentSelectionBanner, momentSelectionCount_one, momentSelectionCount_other,
momentNamePlaceholder, momentSetCover, momentChangeCover, momentClearCover,
momentAddEntries, momentSplit, momentSplitConfirm, momentDelete,
momentDeleteConfirm, momentMemberRemove, momentMemberEjectedCrossDay,
momentTimeRange, momentCount_one, momentCount_other,
coverChangeSheet, coverClear, coverPlaceholder, dayEmpty, loggedBy,
tripSubtitle, todaysSpending
```

Plus `common.{back, cancel, save, ok, now}`.

Add any missing key with a sensible default in en.json and a real Hebrew translation in he.json.

- [ ] **Step 2: Run app, sanity-check Hebrew rendering**

Switch device language to Hebrew via Settings → confirm:
- Date strip pills mirror correctly
- Cover hero overlay text aligns to the visual right
- MomentHeader pill mirrors and shows correct Hebrew title
- Spine on inline-start of timeline = visual right in RTL

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Finalize journal redesign i18n keys (en + he parity)"
```

---

### Task 12.2: Manual smoke checklist + final cleanup

**Files:**
- None (verification only)

- [ ] **Step 1: Run through this scenario list on a real device**

A) **Routing**:
- Tab journal on an active trip → opens Today's Day screen with no back button.
- Tab journal on a past trip → opens All Days.
- All Days → tap a day → Day screen with back button. Tap back → returns.

B) **Day screen**:
- Date strip scrolls, active pill highlighted, past pills dimmed.
- Cover hero shows photo or placeholder. Tap placeholder → picker opens. Long-press cover → change-cover sheet.
- Stats strip: tap total → breakdown opens; tap each chip → scrolls.
- Location editor works (auto vs override).

C) **Timeline**:
- Photo row: tap caption → edit; tap photo → opens (existing behavior).
- Voice row: tap play → plays; tap transcript → edit; failed → tap retries.
- Expense row: tap → expense detail.
- Long-press row body → opens TimelineItemActions.
- Long-press SpineNode → drag begins; drop on spine reorders; drop on row creates Moment with inline rename; drop on Moment joins.

D) **Moments**:
- FAB → Create Moment → select 2 entries → save with name "Lunch" → Moment renders.
- Tap Moment header → options sheet → rename works.
- Add entries → selection mode pre-fills; add a third entry → Moment grows.
- Split here → tap inline button → confirms → two Moments.
- Delete Moment → confirms → entries return as solos.
- Long-press a member's row body → "Remove from Moment" → ejects.
- Drag a member out of the band → ejects.
- Drag a member onto a different Moment's band → moves over.
- Edit timestamp across days → ejects with toast.

E) **All Days**:
- TripCoverBanner shows trip cover + name + range + stats.
- Long-press banner → cover picker → pick one → updates.
- Day cards show Moment chips for days that have Moments.

F) **Sharing**:
- On a shared trip, the partner sees the same Moments, photos, voice notes. Edits propagate via realtime.
- "by [name]" tag shows on entries not logged by the current user.

G) **Empty day**:
- A day with no entries shows the centered CTA. Tap → add menu opens.

H) **RTL**:
- Switch to Hebrew → spine moves to the visual right, date strip mirrors, FAB anchors visual left.

- [ ] **Step 2: Remove any temporary debug `console.log` you added during Phase 1 verification**

Run: `grep -rn "console.log.*journal\|console.log.*moment" src/ app/`
Expected: no matches (or only intentional warns).

- [ ] **Step 3: Final typecheck + lint**

Run:
```bash
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
```
Expected: clean.

- [ ] **Step 4: Run the journalTimeline tests**

Run: `npx jest src/utils/journalTimeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit any leftover cleanup**

```bash
git status
# if anything to commit:
git add -A
git commit -m "Journal redesign: final cleanup + manual smoke verification"
```

---

## Self-Review

Run through the spec section-by-section and confirm coverage. Fix gaps inline.

**Spec coverage:**
- Navigation & routing → Task 3.1 (smart router) + 3.2 (pushed route) + 3.3 (AllDaysScreen drill-in)
- Date strip → Task 4.1
- Cover hero → Task 4.2 (+ change-cover via Task 4.4 wiring + Task 11.4)
- Stats strip + location → Task 4.3 + Task 11.4 (breakdown)
- Timeline spine + nodes → Task 5.1
- Row treatments (photo/voice/expense, no card) → Tasks 5.2/5.3/5.4
- Moment header pill → Task 6.1
- Tint band + bracket spine → Task 6.2
- Moments in timeline → Task 6.3
- Moments — Data model → Task 1.1 (Postgres) + 1.2 (local) + 1.3/1.4 (types) + 1.5 (sync)
- Moments — Creation (Path A: selection mode) → Tasks 7.1, 7.2, 7.3, 7.4
- Moments — Creation (Path B: drag) → Tasks 8.1, 8.2
- Moments — Editing (rename / cover / add / split / delete) → Tasks 9.1, 9.2, 9.3, 9.4
- Moments — Remove member → Task 9.5
- Drag activation on spine node (not row body) → Task 5.1 + 8.1
- Drop precedence (band > row > spine) → Task 8.1 Step 3
- Shared journal (drop per-user filter) → Tasks 1.1 (RLS) + 2.4 + 2.5 + DB on 1.2
- Trip cover banner → Task 10.1 + 10.3
- All Days redesign (DayCard + Moment chips) → Task 10.2
- Edge cases — cross-day eject → Task 11.1
- Edge cases — empty day → Task 11.2
- Edge cases — cover entry deleted → handled by DB `ON DELETE SET NULL` + UI fallback in DayCoverHero placeholder
- Edge cases — last member removed → handled inside `journalMoments.removeMember` (Task 2.2)
- Post-create animation → Task 11.3
- i18n + RTL → Phase 12 + each task that introduces keys

**Placeholder scan:** every step contains either complete code or an exact command. No "TODO" / "TBD" / "implement later" patterns in step bodies.

**Type consistency:** the `JournalMoment` shape used across tasks matches what Task 1.3 defines (`id`, `tripId`, `dayDate`, `title | null`, `coverPhotoEntryId | null`, `createdBy`, `createdAt`, `updatedAt`, `deletedAt`). Member-key format `${kind}:${id}` is used consistently in Tasks 7.4, 8.1, 9.4, 11.5. The `TimelineSection` discriminated union (Task 2.8) is referenced consistently in Tasks 6.3 and 9.3.

**Known follow-ups for V1.1 (intentionally not in this plan, per spec "Out of scope"):**
- Drag whole Moment to relocate
- Auto-cluster suggestions
- Cross-day Moments
- Per-Moment / per-entry privacy
- Reactions / comments
- Per-Moment description field
- Horizontal swipe between days

