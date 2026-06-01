# Journal redesign — day-led, shared, Moments-curated

**Date:** 2026-05-24
**Status:** Draft
**Author:** Ilay + Claude (brainstorming session)

## Motivation

The current journal frontend (Phase-3 implementation, see `2026-05-23-trip-journal-design.md`) is functionally complete on the backend but visually and ergonomically weak. Concrete pain points the user has called out and verified during this brainstorm:

- The top-level `Today / All Days` toggle stacks on top of the `DayNav` chevron row, doubling up controls for the same axis (day selection).
- Every timeline row (photo entry, voice clip, expense) is wrapped in an identical hairline-bordered `theme.surface` card. The screen reads like a spreadsheet — there's no visual signal that says "this is a photo memory" vs "this is what you spent."
- `DaySummaryCard` is small (~120px cover) and crowded — hero photo competes with the day label, total, three count chips, and the location editor all stacked vertically.
- The `TimestampGutter` on one edge + the `≡` drag handle on the other edge make every row a cramped 3-column layout.
- The timeline doesn't actually feel like a timeline — no connecting thread, no chronological rhythm.
- The journal is per-user (photo entries and voice clips are filtered by `currentUserId` in `listEntriesForDay` / `listClipsForDay`), but for a shared trip the user wants a single shared journal that everyone contributes to.
- There's no way to group related entries into a meaningful "moment" — e.g., lunch at one café being 3 photos + 1 voice note + 1 expense, scrollable as a single labeled unit.

## Goals

- Replace the toggle + chevron stack with a smart-routed entry (Today or All Days based on whether the trip is currently active) and a sticky horizontal date-pill strip for day switching.
- Make the day screen feel like a travel album: edge-to-edge cover photo led, content-shaped rows (no uniform card wrapper), vertical accent timeline thread on the inline-start edge.
- Introduce **Moments** — user-curated groupings of entries that render as labeled, bracketed segments on the spine. Created either via a new `Create Moment` row in the FAB add-menu (selection mode) or via drag-and-drop (drop one row on another, drop on an existing Moment to join).
- Migrate journal entries from per-user to **shared by trip**, matching the existing model for expenses. Anyone on the trip can add/edit/delete any entry; attribution is shown but not enforced.
- Preserve every existing capture flow (photo picker, voice recorder, add-expense screen) and the existing soft-delete + sync-queue patterns.

## Non-goals

- Auto-clustering (e.g., grouping entries within a 30-min window automatically). User-confirmed: pure manual Moments only.
- A separate `is_private` flag on photo entries or voice clips. V1 keeps expense privacy as-is; new entry types are shared with no per-entry override.
- Cross-day Moments (a Moment that spans midnight). Out of scope; would require a different membership model.
- Permission gates on edit/delete (e.g., "only the creator can delete"). Anyone on the trip can do anything to anything, last-write-wins on conflicts.
- Empty Moments (Moment shells with no members). A Moment must always have ≥1 member; removing the last member auto-deletes the Moment.
- Reactions, comments, or any social layer on entries or Moments.
- Replacing the `LocationEditor`, `TimestampEditor`, `TranscriptEditor`, or `TimelineItemActions` components beyond what the new layout requires. Their internals are out of scope; their consumption sites change.

## Navigation & routing

The Journal tab becomes a smart router:

- **If the trip is currently active** (`trip.startDate ≤ todayIsoDate() ≤ trip.endDate`): the tab opens directly on the **Day screen** for today.
- **Otherwise** (trip is in the future, ended in the past, or `trip.endDate` is null and `todayIsoDate() < trip.startDate`): the tab opens on the **All Days screen**.
- The current `Today / All Days` toggle in `app/(main)/trip/[id]/(tabs)/journal.tsx` is deleted.

Cross-navigation:

- From the Day screen, a small "All days" icon button in the top-end corner of the screen header pushes the All Days screen.
- From All Days, tapping any day card pushes the Day screen for that date. The pushed Day screen has a back button on the inline-start (matching the app-wide back pattern); the smart-routed Day screen (no push) has no back button.

Day cursor lives on the Day screen and is initialized to the routed day. The current `dayDate` lifting from `JournalScreen` into a controlled prop on `TodayView` is replaced by the new screen architecture — see Implementation Notes.

## Day screen

```
┌───────────────────────────────────────────────────────┐
│ [←]  21  22  23  ▣24  25  26  27        [All days]   │  ← sticky date strip
├───────────────────────────────────────────────────────┤
│                                                       │
│      [   edge-to-edge cover photo (~280px tall)   ]   │  ← cover hero
│      [   dark gradient at the bottom              ]   │
│      Thursday, May 24                                 │  ← overlay text
│      Alfama · Day 3 of 7                              │
│                                                       │
├───────────────────────────────────────────────────────┤
│  ₪ 312                          📸 12 · 🎤 3 · 💳 4   │  ← stats strip
│  Alfama · Lisbon                                      │  ← location line
├───────────────────────────────────────────────────────┤
│   │                                                   │
│   ●  9:15    [breakfast photo full-width]             │
│   │                                                   │
│   ●  9:45    [▶ voice chip — alfama walk]             │
│   │                                                   │
│   ●  10:00   [4-photo grid]                           │
│   │                                                   │
│   ●  11:30   [expense card — Cafe €4.50]              │
│   │                                                   │
│   ┃ ┌────────────────────────────────────┐            │
│   ┃ │ ✦ Lunch at Café Nicola · 12:40-13:20│           │ ← Moment pill
│   ┃ └────────────────────────────────────┘            │
│   ┃   ◌  12:42  [▶ voice chip — pastel de nata]       │
│   ┃   ◌  12:50  [3-photo grid]                        │
│   ┃   ◌  13:20  [expense card — €18]                  │
│   │                                                   │
│   ●  14:30   [single beach photo]                     │
│                                                       │
└──────────────────────────────────────────────[ + ]────┘  ← FAB
```

### Date strip (sticky)

- One horizontal `ScrollView` of date pills, one per trip day. Each pill shows the day-of-month (large) + a 2-letter weekday (small) — e.g., `24 Th`.
- The active day's pill is filled with `theme.accent`; other pills are outlined-only with `theme.border`. Past days are subtly dimmed (~70% opacity).
- Tapping a pill swaps the Day screen content to that date (no horizontal swipe between days in V1 — the strip is the gesture surface).
- Sticky at the top of the screen as the user scrolls the day content. Auto-scrolls horizontally so the active pill stays in view.
- When the Day screen was reached via push from All Days, the back button sits to the inline-start of the strip; otherwise the strip starts flush with the inline-start.
- An `All days` icon button sits at the inline-end of the strip row.
- RTL: `flexDirection: row` mirrors the strip automatically; the back button stays on the inline-start, which becomes the visual right in RTL.

### Cover hero

- Edge-to-edge — no horizontal padding, no rounded outer corners. Total height ~280px on a typical phone (adjust to keep a comfortable proportion; precise number is implementer's call).
- Source: `summary.coverStoragePath`, rendered through `useSignedJournalPhotoUrl`. If null, render a `LinearGradient` from `theme.gradient1` (matches today's `DaySummaryCard` fallback) with a centered `theme.accentSoft`-filled circle containing a small `📸` glyph and the text "Tap to set a cover photo" — tap opens a picker showing only this day's photo-entries; selecting one calls `journalDays.setCoverPhotoEntry(tripId, dayDate, entryId)`.
- A bottom-anchored `rgba(0,0,0,0.0)` → `rgba(0,0,0,0.55)` linear gradient ensures the overlay text is legible regardless of photo content.
- Overlay text, inline-start aligned, ~24px from the bottom edge of the photo:
  - Line 1 (large, 28px, weight 800, white): `Today` if `isToday`, else the human-readable date (`formatReadableDate(dayDate)`).
  - Line 2 (small, 12px, weight 500, white at 80% opacity): the effective location concatenated with `journal.dayOfTotal` — e.g., `Alfama · Day 3 of 7`. Falls back to just the day-of-trip text if no location.
- Long-press anywhere on the cover opens a sheet with `Change cover photo` (opens the same picker as the placeholder) and `Clear cover photo` (sets `cover_photo_entry_id` to null).

### Stats strip

- A single horizontal row directly below the cover, with `paddingHorizontal: 18`, `paddingVertical: 12`, no card background.
- Inline-start side: `formatAmount(totalConvertedAmount, homeCurrency)` in size 22, weight 800. Tappable → opens a small bottom sheet with the day's spending broken down by category (one row per category with name + amount). Implementer note: the category breakdown can reuse the existing `dailyTotals` util or be computed inline from `expensesForDay`.
- Inline-end side: three count chips in a row, separated by a thin `·` glyph: `📸 N · 🎤 N · 💳 N`. Each chip is tappable and scrolls the timeline (`scrollToIndex` on the underlying list) to the first entry of that type. Chips are not filters — there's no filter mode.
- The location line lives immediately below the strip, in body-size muted text. Auto-detected location displays with no decoration; user-overridden location displays in primary text color with a tiny edit-pencil glyph at the end. Tap opens the existing `LocationEditor`.
- A 1px `theme.accent` at 30% opacity divider sits below the location line, before the timeline begins.

## Timeline spine + Moments

### Spine geometry

- A vertical 2px line in `theme.accent` at 30% opacity runs down the inline-start of the timeline area, indented `paddingHorizontal: 18` + an additional 12px to leave room for the nodes.
- The spine starts a few pixels below the divider under the location line and extends to the last node + 12px padding below the bottom-most entry. It does not extend to the screen bottom.
- For each entry, a node (a small circle) sits on the spine, vertically centered on the top of the entry's body. The time label renders between the node and the entry's body.
- Solo entries: filled circle (●) 8px diameter, `theme.accent` fill.
- Moment-member entries: hollow circle (◌) 6px diameter, `theme.accent` stroke 1.5px, transparent fill.
- Moment header position: a thicker spine segment (4px) in solid `theme.accent` color spans the vertical range from the Moment header's top to the bottom of its last member's row. This is the "bracket" that visually contains the Moment.

### Time labels

- Render to the inline-end of each node, in 11px muted text. Format follows the user's locale's short time (e.g., `12:40 pm` in English, `12:40` in Hebrew).
- The time shown is the entry's `occurredAt` for photo entries and voice clips, and `${expense.expenseDate}T${expense.expenseTime}` for expenses (existing pattern in `ExpenseTimelineRow`).
- "Logged by" attribution (small `by [name]` muted tag) renders directly under the time label, but **only when the trip is shared AND the entry was logged by someone other than the current user**. Your own entries don't show the tag. For expenses, reuse the existing `loggedByName` lookup; for photo entries and voice clips, look up the name from `tripMembers` by `user_id`.

### Row treatments (no uniform card wrapper)

The existing `PhotoEntryRow`, `VoiceClipRow`, and `ExpenseTimelineRow` wrap their bodies in identical `theme.surface` + hairline border cards. That wrapper is removed in this redesign.

- **Photo entry row** — the body is the photo grid itself, no card. Single photo: full-width image, 14px corner radius. 2 photos: side-by-side 1×2 grid. 3-4 photos: 2×2 grid (3 photos = 2-then-1 layout). 5+ photos: 3-column grid with overflow stacking; cap at ~6 visible, with the rest indicated by a `+N` overlay on the last visible tile. Caption renders below the grid in body-size primary text — tap to enter inline-edit (existing pattern: `TextInput` with `onBlur` commit).
- **Voice clip row** — body is a horizontal **chip**: `borderRadius: 22`, `theme.accentSoft` background, containing (inline-start to inline-end) a round play/pause button (`theme.accent` fill, 28px diameter), a thin duration-derived waveform bar (decorative, no actual amplitude — render N evenly-spaced bars where N is proportional to `clip.durationSec`, height varies on a sine-style pattern for visual rhythm), and the duration tag `0:23` in muted text. The transcript renders below the chip in body text up to 3 lines, tappable to open `TranscriptEditor`. Pending state: render `ActivityIndicator + "Transcribing…"` in the transcript area; failed state: red transcript text "Transcription failed — tap to retry", retry calls the existing `transcribe-voice` function invocation.
- **Expense row** — keep the existing `ExpenseCard` as-is. It's the only card-shaped row by design — expenses are a different visual register and the contrast is useful. The `TimestampGutter` is removed from this row (replaced by the spine + time label); `ExpenseTimelineRow` becomes a thin wrapper that places `ExpenseCard` next to the spine node + time label.

### The Moment header pill

- Hangs off the spine to the inline-end side, at the moment's start position.
- Shape: rounded pill (`borderRadius: 22`), background = `theme.accentSoft`, 1px `theme.accent` border, `paddingHorizontal: 12`, `paddingVertical: 6`.
- Content layout (inline-start → inline-end):
  1. `✦` glyph (`theme.accent` color, weight 800)
  2. Title text (weight 700, primary text color). Empty title → render `journal.untitledMoment` ("Untitled Moment") in muted color, italicized.
  3. Time range `12:40 – 13:20` (small, muted, derived from first/last member `occurredAt`).
  4. Member count badge `3` (tiny accent-filled circle with white number).
  5. Optional chevron (`v` / `^`) at the inline-end for collapse state.
- Tap → opens Moment options sheet (see "Editing Moments" below).
- Long-press → enters drag-to-relocate mode for the entire Moment (V1.1 — out of scope for V1; the pill does not start a drag in V1).
- Collapsed state: all member rows are hidden; a strip just below the pill shows up to 3 photo thumbnails from the Moment's photo-entry members + the text `N entries`. Tap the strip or the pill to expand.

### Moment member visual rhythm

- Member rows render with the same body content as solo rows (photo grid / voice chip / expense card).
- They are indented 12px inward from the main spine (their nodes sit on the bracket spine segment, not the main spine).
- A 4% opacity `theme.accent` fill renders behind the member rows, spanning from the pill's bottom edge to the last member's bottom edge, with a soft 4px corner radius at top and bottom, ~14px wide. This is the "tint band" that signals "you're inside a Moment."

## Moments — model

A Moment is a user-curated grouping of trip-journal entries that occurred on the same day. Pure manual creation (no auto-clustering). Shared across all trip members.

### Data model

New table:

```sql
create table public.journal_moments (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_date date not null,                                      -- YYYY-MM-DD, single day
  title text,                                                  -- nullable; UI shows "Untitled Moment" if null
  cover_photo_entry_id uuid references public.journal_photo_entries(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                                       -- soft delete
);
create index on public.journal_moments(trip_id, day_date) where deleted_at is null;
```

Add a nullable `moment_id` FK to each entry type:

```sql
alter table public.journal_photo_entries
  add column moment_id uuid references public.journal_moments(id) on delete set null;
alter table public.voice_clips
  add column moment_id uuid references public.journal_moments(id) on delete set null;
alter table public.expenses
  add column moment_id uuid references public.journal_moments(id) on delete set null;
create index on public.journal_photo_entries(moment_id) where deleted_at is null and moment_id is not null;
create index on public.voice_clips(moment_id) where deleted_at is null and moment_id is not null;
create index on public.expenses(moment_id) where deleted_at is null and moment_id is not null;
```

Each entry belongs to ≤1 Moment. `on delete set null` ensures that hard-deleting a Moment (shouldn't happen in app flow — we soft-delete) leaves the entries intact.

Mirror these changes in the local SQLite schema (`src/db/schema.ts`) and add corresponding migrations in both `supabase/migrations/` and `src/db/migrations.ts`.

### Sharing semantics

- The whole journal becomes **shared by trip** — drop the `currentUserId` filter from `listEntriesForDay` and `listClipsForDay`. The `user_id` column stays as attribution metadata.
- RLS policies on Supabase: every trip member can SELECT / INSERT / UPDATE / DELETE photo entries, voice clips, and moments for trips they belong to. Mirror the existing pattern used by `expenses`.
- No `is_private` flag on photo entries or voice clips in V1. Expense `is_private` continues to work as-is (private expenses still hide from other members' timelines and from AI queries).
- Realtime: the existing Supabase realtime subscription pattern picks up Moment changes. New tables and new columns need to be added to the realtime publication.

### Membership invariants

- A Moment has ≥1 member at all times. Creation: the API/app forces at least one member at create-time (selection mode requires ≥1 selected; drag-to-group is inherently ≥2).
- Removing the last member triggers an app-level soft-delete of the Moment (set `deleted_at`, write to sync queue). Implementer note: do this atomically with the member-removal — see "Edge cases" below.
- Cross-day Moments are disallowed. If a member's timestamp is edited via `TimestampEditor` and lands on a different day, the entry is automatically ejected from the Moment (its `moment_id` is set to null) and the user is shown a brief toast: `journal.momentMemberEjectedCrossDay` ("Moved to [new date] — removed from [Moment name]").

## Moments — creating

### Path A: via the FAB add-menu

The existing `AddMenuSheet` (currently 3 rows: Photos / Voice / Expense) gains a fourth row:

```
┌──────────────────────────────┐
│  📸  Add photos              │
│  🎤  Record voice            │
│  💳  Add expense             │
│  ✦   Create Moment           │  ← new
└──────────────────────────────┘
```

Tap `Create Moment`:

1. Sheet dismisses, the Day screen enters **selection mode**.
2. A semi-transparent banner slides up from the bottom: `Tap entries to add to your Moment  •  0 selected  [Cancel]  [Create Moment]`. The Create button is disabled at 0.
3. Each row on the timeline shows a check circle to the inline-end of its node (between the node and the entry body). Tapping the row or the check toggles inclusion; selected rows render an `theme.accent` outline around the body and the check is filled.
4. As entries are selected, the banner count updates live.
5. Tap `Create Moment` → a name sheet appears: a `TextInput` for the title (auto-focused, placeholder `Name your Moment (optional)`) and a `Set cover photo` button (opens a picker showing only the selected photo-entry members, defaulting to "first photo member" already-selected). Save → the Moment is persisted, the timeline re-renders with the new pill + tint band, selection mode exits.
6. Cancel: dismisses the banner without persisting anything.

If the day is empty (`timeline.length === 0`), the `Create Moment` row in the add-menu is rendered but disabled, with a muted helper text `Add a photo, voice, or expense first`.

### Path B: drag-to-group

Long-press any entry row to begin dragging (the row lifts via the existing `react-native-draggable-flatlist` mechanism, with a slight scale and shadow as today). The drop target determines the action — resolved in this precedence order (first match wins):

1. **Drop on a Moment's header pill or anywhere on its tint band** → the dragged row joins that Moment as a new member. No naming prompt. The row's `moment_id` is set to the target Moment's id; if the row was previously a member of a different Moment, its previous `moment_id` is overwritten in the same transaction. Visual: the target tint band briefly pulses to acknowledge.
2. **Drop on top of a solo row's body** (a row not currently in any Moment) → the target row glows with a `theme.accent` ring while you hover (`borderWidth: 2`, `borderColor: theme.accent`, `borderRadius: 14`). Release → both rows become a new Moment. A small inline name input appears at the new Moment's header (auto-focused, `TextInput` overlaying the pill area); tap the check tick or hit return to commit; tap X to abort (deletes the just-created Moment, members go back to solo). The new Moment's `cover_photo_entry_id` defaults to the first photo-entry member.
3. **Drop on empty spine space** (gap between rows, or above the first / below the last row) → row reorders. Same as today: the row's timestamp is recomputed via `computeReorderTimestamp` and persisted. If the dragged row was a Moment member and the drop position falls outside its current Moment's vertical span (and didn't match rule 1 above — i.e., didn't land on another Moment's tint band), the row is also ejected from its Moment in the same transaction (`moment_id` set to null).

If after a reorder/eject the source Moment is left with zero members, the source Moment is soft-deleted in the same transaction (the same invariant as removing the last member via the long-press action).

Hover feedback teaches the user the rules — no docs or onboarding needed.

**Drag activation**: the existing ugly `≡` drag handle is removed. Drag is initiated by **long-press on the entry's spine node** (the dot/circle on the spine). The visible dot is small (6–8px), but its touch target is enlarged to ~36pt square centered on the dot. The time label, which sits to the inline-end of the node, is included in the same enlarged touch target. This keeps the row body free for content interaction:

| Surface | Tap | Long-press |
| --- | --- | --- |
| Spine node + time-label area | (no-op) | **Start drag** |
| Row body (photo grid / voice chip / expense card) | Default content action (open photo gallery, toggle playback, open expense detail) | Open `TimelineItemActions` sheet |
| Caption text / transcript text inside a row | Enter inline edit | (no-op — text input absorbs) |
| Moment header pill | Open `MomentOptionsSheet` | (no-op in V1; reserved for "drag whole Moment" in V1.1) |

So drag never accidentally fires while you're tapping a caption, playing a voice clip, or opening an expense — those interactions live on the row body, drag lives on the spine node.

## Moments — editing

Tap a Moment's header pill to open the **Moment options sheet** (a bottom sheet):

- **Title** — `TextInput` inline-editable, commits on blur.
- **Cover photo** — current cover thumbnail (or "No cover" placeholder); tap `Change cover` to open a picker showing only the Moment's photo-entry members. Tap `Clear cover` to remove.
- **Add entries** — opens selection mode with current members pre-selected. Adding members updates the Moment; deselecting existing members removes them.
- **Split here…** — enters split mode: every member row shows an inline `Split after` button between itself and the next member. Tap one → confirms via a small inline confirmation (`Split into "Lunch (1)" and "Lunch (2)"?  [Cancel]  [Split]`). On confirm: the first half retains the original title + cover; the second half is created as a new Moment with title `[original title] (2)` and `cover_photo_entry_id = null`.
- **Delete Moment** — destructive (red text). Confirms via OS-standard alert. On confirm: the Moment is soft-deleted (`deleted_at = now()`), all members' `moment_id` is set to null. Members stay as solo entries on the timeline.

Per-member actions (via long-press on a member row, which extends the existing `TimelineItemActions` sheet with one new entry):

- **Remove from Moment** — sets the member's `moment_id` to null. If this was the last member, the Moment is also soft-deleted in the same transaction.

Reordering within a Moment uses the existing drag pattern — entries stay inside the bracket as long as the drop position is within the Moment's vertical span.

## All Days screen

Replaces the current `ChapterView` + `DayCard` layout.

```
┌───────────────────────────────────────────┐
│ [←] Journal · Lisbon                      │  ← screen header
├───────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐  │
│  │ [   trip cover banner (~180px)   ]  │  │
│  │ Lisbon · May 22 – May 28            │  │
│  │ 7 days · ₪ 2,840 · 84 photos        │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │ ┌──────┐ Day 3 · Thu, May 24        │  │
│  │ │ cover│ Alfama · ₪ 312             │  │
│  │ │ photo│ 📸 12 · 🎤 3 · 💳 4         │  │
│  │ └──────┘ ✦ Lunch at Nicola ·       │  │
│  │          ✦ Sunset walk · +1         │  │
│  └─────────────────────────────────────┘  │
│  ┌─────────────────────────────────────┐  │
│  │ [Day 2 …]                           │  │
│  └─────────────────────────────────────┘  │
│  [more day cards …]                       │
└───────────────────────────────────────────┘
```

- **Trip header banner** at the top of the scroll — wider hero treatment. Cover is `trip.coverPhotoStoragePath` (new column on `trips`, nullable; falls back to the cover of the first day with one; falls back to `theme.gradient1` placeholder). Long-press to change cover via picker showing all photo entries across the trip.
- Subtitle row under the trip banner: `<trip name> · <date range>`. Below that: `<N days> · <total spent> · <total photo count>`.
- **Day cards** (vertical scroll, newest day first):
  - Cover thumbnail (96px square) on the inline-start.
  - Right column: `Day N · <weekday>, <date>` (weight 800, 14px), location + total spent (muted, 11px), three count chips, then a horizontal `flexWrap: 'wrap'` row of Moment chips (`✦ <title>` pills, max 3 visible with a `+N` overflow chip if more).
  - Tap any card → push the Day screen for that date (with back button).
  - Empty days (no entries) still render but at 70% opacity, with a single muted `No entries` line in place of the chips.

## Capture FAB

The FAB itself is unchanged from the current `JournalFab.tsx` (position, size, gradient, glow, RTL mirroring). The `AddMenuSheet` gains the `Create Moment` row described in "Moments — creating, Path A."

Post-create animation: after a photo, voice, or expense is created, the new entry's row briefly animates in on the spine (~250ms fade-in + 8px upward translate). Implementer note: this can be driven by `Animated` on the row's first mount, gated by a recent-create timestamp passed down from `TodayView`.

## Edge cases & behaviors

- **Sync conflict on Moment title** — last-write-wins by `updated_at`. Matches the existing pattern in `conflictResolver.native.ts`.
- **Sync conflict on membership** — if user A adds an entry to Moment X locally while user B (offline) is removing the same entry, last-write-wins on the entry's `moment_id` column.
- **Member's timestamp edited across days** — the member is automatically ejected (`moment_id = null`) and the user is toasted. See "Membership invariants."
- **Removing the last member from a Moment** — the Moment is soft-deleted in the same sync-queue transaction as the member-removal. The sync push step batches these into a single push if possible.
- **Cover photo entry deleted** — the Moment's `cover_photo_entry_id` is set to null (handled by `on delete set null` at the DB level; the app then falls back to "first photo member" in the UI).
- **Drag a Moment member onto a different Moment's pill** — the member moves over; if its previous Moment now has no remaining members, that Moment is soft-deleted.
- **Empty day** — the spine renders as a short (60px) dotted vertical line centered horizontally in the timeline area, with a centered `theme.accentSoft` circle containing a `+` glyph, under the line text `Nothing logged yet — tap + to start your day`. Tap the circle to open the FAB add-menu.
- **Trip-active routing edge** — if `trip.endDate` is null (open-ended trip): treat as active if `todayIsoDate() >= trip.startDate`. If `trip.startDate` is null (shouldn't happen in valid data): fall back to All Days.

## i18n & RTL

### New translation keys (`src/i18n/locales/en.json` + `he.json`)

Add to the existing `journal.*` namespace:

- `journal.allDays` — `All days`
- `journal.allDaysTitle` — `Journal · {{tripName}}`
- `journal.createMoment` — `Create Moment`
- `journal.createMomentDisabled` — `Add a photo, voice, or expense first`
- `journal.untitledMoment` — `Untitled Moment`
- `journal.momentSelectionBanner` — `Tap entries to add to your Moment`
- `journal.momentSelectionCount_one` — `{{count}} selected`
- `journal.momentSelectionCount_other` — `{{count}} selected`
- `journal.momentNamePlaceholder` — `Name your Moment (optional)`
- `journal.momentSetCover` — `Set cover photo`
- `journal.momentChangeCover` — `Change cover`
- `journal.momentClearCover` — `Clear cover`
- `journal.momentAddEntries` — `Add entries`
- `journal.momentSplit` — `Split here…`
- `journal.momentSplitConfirm` — `Split into "{{a}}" and "{{b}}"?`
- `journal.momentDelete` — `Delete Moment`
- `journal.momentDeleteConfirm` — `Delete this Moment? Entries will stay as solo items.`
- `journal.momentMemberRemove` — `Remove from Moment`
- `journal.momentMemberEjectedCrossDay` — `Moved to {{date}} — removed from {{momentName}}`
- `journal.momentTimeRange` — `{{start}} – {{end}}`
- `journal.momentCount_one` — `{{count}} entry`
- `journal.momentCount_other` — `{{count}} entries`
- `journal.coverChangeSheet` — `Change cover photo`
- `journal.coverClear` — `Clear cover photo`
- `journal.coverPlaceholder` — `Tap to set a cover photo`
- `journal.dayEmpty` — `Nothing logged yet — tap + to start your day`
- `journal.loggedBy` — `by {{name}}`
- `journal.tripSubtitle` — `{{days}} days · {{spent}} · {{photos}} photos`

Per project memory (`feedback_i18n_hebrew_parity.md`), fill in real Hebrew translations alongside the English values at write-time, not later.

### RTL

- The date strip uses `flexDirection: row` → mirrors automatically in RTL.
- The spine sits on the inline-start of the timeline — in RTL, it visually moves to the right. Nodes, time labels, and Moment pills follow the same logical edge.
- The cover-photo overlay text is `textAlign: 'start'` (logical) so it aligns to the visual inline-start in both modes.
- The FAB anchors to bottom-inline-end via the existing `isRTL` check in `JournalFab`.
- The back-button on the pushed Day screen sits at the visual inline-start of the date strip via flex order.

## Migration notes

### DB migrations

1. **Supabase migration** — create `journal_moments` table, add `moment_id` columns to `journal_photo_entries` / `voice_clips` / `expenses`, add indexes, update RLS policies for shared journal access (drop per-user SELECT filters on photo entries and voice clips), add new tables/columns to the realtime publication.
2. **Add `cover_photo_storage_path text` to `trips`** (nullable) to back the All Days trip-level banner. Mirror on local SQLite. Long-press the banner opens a picker (all photo entries across the trip) → sets this column.
3. **Local SQLite migration** — mirror the schema changes in `src/db/schema.ts` and `src/db/migrations.ts`.

### Query layer changes

- `src/db/queries/journalPhotoEntries.{native,web}.ts` — drop the `userId` filter from `listEntriesForDay`. Keep `user_id` as a returned column for attribution.
- `src/db/queries/voiceClips.{native,web}.ts` — same.
- New `src/db/queries/journalMoments.{native,web}.ts` — CRUD for Moments + queries to list Moments by day and to count members.
- `src/db/queries/expenses.{native,web}.ts` — add support for setting/clearing `moment_id` on an expense.
- `src/utils/journalTimeline.ts` — update `buildDayTimeline` to group members under their parent Moments in the rendered structure, while preserving solo entries inline.

### Sync changes

- New table type in `src/types/sync.ts` for `journal_moments`.
- `pushChanges.native.ts` and `pullChanges.native.ts` — register `journal_moments` for push/pull. For the new `moment_id` columns on `journal_photo_entries`, `voice_clips`, and `expenses`: the implementation plan must verify they're included in the existing per-table column lists used by push/pull (the codebase explicitly enumerates columns per table — see the existing constants in `pushChanges.native.ts` / `pullChanges.native.ts`) and add `moment_id` to each.
- Realtime subscription registration in the sync engine includes the new table.

### Component changes

- Replace `app/(main)/trip/[id]/(tabs)/journal.tsx` with the smart-router screen.
- New screen for the Day view (could be `DayScreen.tsx` under `src/components/journal/` or a pushed route under `app/(main)/trip/[id]/journal/[date].tsx`; implementer's choice based on how the back-button stacking works best with Expo Router).
- `TodayView.tsx` is heavily refactored — the spine + new row treatments + Moment rendering + selection mode all live here or in extracted sub-components. The drag/drop logic is rewritten to support the drop-target rules.
- `DaySummaryCard.tsx` is replaced by the new cover-hero + stats-strip combination (could be split into `DayCoverHero.tsx` + `DayStatsStrip.tsx`).
- `DayNav.tsx` is deleted (the date strip replaces it).
- New `DateStrip.tsx` component.
- `ChapterView.tsx` + `DayCard.tsx` are reworked — the day cards gain Moment chips, and the trip header banner is added.
- `JournalFab.tsx` + `AddMenuSheet.tsx` are extended with the `Create Moment` row.
- `PhotoEntryRow.tsx`, `VoiceClipRow.tsx`, `ExpenseTimelineRow.tsx` lose their card wrappers and `TimestampGutter` (the spine + time label replace it). The `≡` drag handle is removed; long-press on the row body initiates drag.
- New `MomentHeader.tsx` (the pill).
- New `MomentSelectionBanner.tsx` (the bottom banner that appears in selection mode).
- New `MomentNameSheet.tsx` (the title + cover sheet shown after selection mode).
- New `MomentOptionsSheet.tsx` (rename / change cover / split / delete).
- `TimelineItemActions.tsx` extends with the `Remove from Moment` action when the item is a Moment member.

### Existing-data migration

- All existing photo entries and voice clips currently belong to the user who created them. After dropping the per-user SELECT filter, all existing entries become visible to all trip members. No data migration needed beyond the RLS policy change.
- No existing Moments exist → no Moment data migration.

## Out of scope / Future

- **Auto-clustering** — could be added later as a "Suggest a Moment" hint above near-in-time entries.
- **Cross-day Moments** — would require a different membership model (e.g., a join table).
- **Per-Moment privacy** (a Moment only visible to its creator) — V1 is all-shared.
- **Per-entry privacy** for photo entries and voice clips — V1 has no such flag.
- **Reactions / comments on entries or Moments** — out of scope.
- **Moment cover collages** (showing a 2×2 mini-grid in the pill) — V1 shows one cover thumbnail only.
- **Drag a whole Moment** to relocate it — V1 only drags individual rows.
- **Day-screen horizontal swipe** between days — V1 uses tap-the-date-strip only.
- **Per-Moment description / notes field** — title + cover only in V1.

## Implementation order (rough)

1. DB schema + migrations (Supabase + local SQLite) + RLS update.
2. New query layer for Moments + drop per-user filters on existing queries.
3. New types in `src/types/journal.ts` + `src/types/sync.ts`.
4. Sync pipeline updates (push/pull/realtime for the new table + columns).
5. Smart-router on the Journal tab + new Day screen scaffold.
6. Date strip + cover hero + stats strip (visual replacement of `DayNav` + `DaySummaryCard`).
7. Spine + new row treatments (PhotoEntryRow / VoiceClipRow / ExpenseTimelineRow rebuilt without wrappers).
8. Moment header pill + tint band rendering.
9. AddMenuSheet `Create Moment` row + selection mode + name sheet.
10. Drag-and-drop with drop-target rules (reorder vs group vs join vs eject).
11. Moment options sheet (rename / change cover / split / delete) + per-member `Remove from Moment` action.
12. All Days screen redesign (trip header banner + new day cards with Moment chips).
13. i18n strings (en + he, per the parity-at-write-time rule).
14. Empty-state polish + post-create animation + sync-conflict toasts.
