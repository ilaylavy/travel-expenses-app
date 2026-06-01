# Journal Frontend — Fresh Build Brief

> Paste this into your new session, or just say "read FRONTEND_REDO_BRIEF.md" and let the agent take it from here.

## What's in this worktree

This is a clean checkout containing the **backend foundation** for the journal redesign. The UI is in its pre-redesign state — the old `TodayView` / `ChapterView` are still in `src/components/journal/`. Your job is to replace them.

What's already done (don't redo any of this):

- **DB**: `journal_moments` table + `moment_id` columns on `journal_photo_entries`, `voice_clips`, `expenses`. `trips.cover_photo_storage_path` column. SQLite migration v9 + Supabase migrations committed.
- **Sync**: `journal_moments` registered in push/pull/typeCoercion/conflictResolver. `moment_id` carried through entry tables. `cover_photo_storage_path` carried through sync apply.
- **Queries**: Full `journalMoments` CRUD — `listMomentsForDay`, `listMomentsForTrip`, `createMoment`, `addMember`, `removeMember`, `updateMomentTitle`, `updateMomentCover`, `deleteMoment`, `splitMomentAfter`. Per-user SELECT filter dropped from `journal_photo_entries` and `voice_clips` (shared journal).
- **Utils**: `buildDayTimeline` returns `TimelineSection[]` (`{kind:'solo'|'moment'}`), with `flattenSections` back-compat. `computeReorderTimestamp` for drag-reorder timestamps.
- **Hooks**: `useDayMoments`, `useTripCover`, `useDaySummary` (shared model), `useDaySummaries` (with `momentCount` + `momentTitles`).
- **Types**: `JournalMoment`, `JournalMomentWithMemberIds`, `TimelineSection`, all entry types carry `momentId`.

## Required reading (in order)

1. **`docs/superpowers/specs/2026-05-24-journal-redesign-design.md`** — approved design spec. Smart routing, Day screen chrome, All Days screen, Moments visual, creation flows, sharing model.
2. **`docs/superpowers/plans/2026-05-24-journal-redesign.md`** — original implementation plan. Phases 3–12 are the frontend work. Phase 1 + 2 are already done.

## Lessons learned (from two rounds of device testing — must not repeat)

1. **Anchor uploads to the day the user is viewing.** Photos and voice clips should land on the current `dayDate`, NOT be clamped to the trip range. For photos with EXIF, preserve the time-of-day on the user's chosen day. You will need a `combineDateWithTimeOfDay(dayDate, exifTaken | null): string` helper in `src/utils/date.ts` — write it (~15 lines, splits the date string and combines with `Date` constructor).

2. **No duplicate back/nav paths.** When the Day screen is reachable from All Days, show ONLY the back arrow. The "≡ All Days" button should not appear when a back arrow is already there.

3. **All Days order is ASCENDING by date.** Day 1 first, not the most recent day. In `src/db/queries/journalDays.native.ts`'s `listDaySummaries` CTE, the final `ORDER BY d.day_date` needs `ASC` (the current code in this worktree has `DESC`).

4. **DateStrip needs top SafeArea.** Wrap the Day screen and All Days screen root in `<SafeAreaView edges={['top']}>` from `react-native-safe-area-context` (match the pattern in `app/(main)/trip/[id]/(tabs)/index.tsx`).

5. **The spine is ONE line.** Do not draw a thicker spine inside Moment bands — the outer `TimelineSpine` already runs through them. **Watch out for layout padding:** if your `timelineWrap` has `paddingHorizontal: 14`, any child component drawing its own spine at `left: 30` will be offset 14px from the outer spine at `left: 30` (because the child's left=30 is relative to its padded container). Pick ONE position model and stick to it.

6. **Long-press on photos must bubble through PhotoGrid.** Individual photo `Pressable.onPress` absorbs touches — long-press on a photo won't trigger the row's `onLongPress` unless you wire `onLongPress` on each photo tile inside `PhotoGrid` too. Add `onLongPress?: () => void` and `onPhotoLongPress?: (index: number) => void` props on PhotoGrid and pass through to each photo Pressable.

7. **Photo entries can have multiple photos.** The user needs:
   - Add more photos to an existing entry
   - Remove a single photo from a multi-photo entry
   - Long-press a SINGLE photo for photo-specific actions (set its entry as cover; remove just that one)
   When the last photo is removed, cascade soft-delete the parent entry.
   
   `journal_photos` has no `deleted_at` column — it's a hard-delete pattern (mirror `expense_photos`). Add a `journalPhotos.deletePhoto(photoId)` query + a `journal_photos` delete branch in `pushChanges.native.ts` that does `deletePhotoFromStorage('journal-photo', ...)` then `.delete()` against Supabase.

8. **Spread expenses span days.** An expense with `spreadStartDate` / `spreadEndDate` set (e.g., a 3-night hotel) must appear on EVERY day in its range, not just `expenseDate`. Both the per-day SQL in `journalDays.native.ts:listDaySummaries` AND the DayScreen's per-day filter need range checks: `dayDate BETWEEN COALESCE(spread_start_date, expense_date) AND COALESCE(spread_end_date, expense_date)`.

9. **Spread expense badge.** Show a "MULTI-DAY" pill on the expense card when `spreadStartDate` or `spreadEndDate` is set (the existing `expense/card/ExpenseCard.tsx` already does this — make sure your new ExpenseTimelineRow keeps using ExpenseCard so the badge renders).

10. **DayCard chips: all three counts.** Show `💳 N · 📸 N · 🎤 N · {amount}` on each day card. `DaySummary.expenseCount` is already on the type.

11. **Signed URLs are expensive.** `useSignedJournalPhotoUrl` calls the `r2-media-url` Edge Function for each storage path. With a 40-day trip and All Days mounted cold, you fire 40+ parallel calls. Two fixes:
    - **In-flight dedup in `photoService.{native,web}.ts`** for `getSignedPhotoUrl`: track pending fetches per-key in a `Map<string, Promise<...>>` so concurrent cache misses for the same path share one Edge Function call.
    - **Cap AllDaysScreen FlatList eager rendering**: `initialNumToRender={8} windowSize={5}` so off-screen DayCards don't fire signed-URL requests before the user scrolls there.

12. **Cover hero placeholder + long-press both open the same picker.** Don't design separate flows for set-cover vs change-cover — one picker handles both, with a "Clear cover" row at the top.

13. **Selection-mode tap interception.** When in Moment-selection mode, the row body should toggle selection on ANY tap — use a transparent `<Pressable style={StyleSheet.absoluteFill} onPress={onToggle} />` overlay on top of inner Pressables (caption editor, play button, etc.) rather than trying to disable each inner handler individually.

14. **Selection mode has two purposes.** Creating a NEW Moment AND adding/removing entries on an EXISTING Moment. Use state like `selectionPurpose: { kind: 'create' } | { kind: 'addToMoment'; momentId: string }` so the confirm-action handler branches correctly. For 'addToMoment', diff current members vs selected → addMember for new, removeMember for dropped.

15. **Day cover and Moment cover are entry-referenced.** `journal_days.cover_photo_entry_id` references an ENTRY (and the display picks the first photo of that entry). If you want to support picking a SPECIFIC photo from a multi-photo entry as cover, that's a schema change — add `cover_photo_id` alongside `cover_photo_entry_id` and prefer it when set. V1 in the previous session left this entry-based.

16. **Expense filter must keep is_private check.** Even though the journal is shared, expenses still respect per-user `is_private`. Keep the `(!e.isPrivate || e.userId === currentUserId)` clause in the DayScreen filter.

17. **i18n: real Hebrew, not empty strings.** CLAUDE.md says "leave he.json empty" but the user overrides that — fill in Hebrew translations at write-time alongside English.

## Deferred: Phase 8 (drag-to-create Moments)

The previous session deferred drag-based Moment creation because it requires custom gesture handling (replacing the simple ScrollView with `Gesture.Pan()` + per-row layout measurement + drop-target hit-testing + ScrollView-vs-Pan conflict resolution). V1 ships with **selection-mode creation only** (FAB → Create Moment → tap entries → name + save). The drag flow is its own future project.

You should NOT attempt Phase 8 in this build. Stop at Phase 7's end + Phases 9–12.

## Optional backend tweaks to bring forward

The previous session shipped a few backend-only improvements AFTER `43da7a9` (the cut point for this worktree). They're not present here. If you want them — `git cherry-pick <sha>` from `claude/goofy-maxwell-958a8f` in the sibling worktree, or just port the changes manually:

| SHA | What |
|---|---|
| `b7dcb57` | Flip `listDaySummaries` ORDER BY to ASC (covers Lesson #3) |
| `95403d7` | `supabase/migrations/20260525120000_journal_shared_rls.sql` (RLS migration — DO NOT push to remote DB until app is shipped) |
| `c1e298b` | `deletePhoto` cascade — soft-delete entry when last photo is removed (covers Lesson #7) |
| `7de8ba6` | `journalPhotoEntries.web.ts.createEntry` actual implementation (the current one in this worktree is a stub that doesn't upload to Storage) |
| `7aae136` | `combineDateWithTimeOfDay` helper in `src/utils/date.ts` (covers Lesson #1) |
| `54a1f62` | In-flight dedup for `getSignedPhotoUrl` in `photoService.{native,web}.ts` + AllDaysScreen FlatList cap (covers Lesson #11) |
| `48f417a` | `listDaySummaries` spread-expense range check in SQL (covers Lesson #8, backend half) |

You may find it cleaner to just write these fresh as you go rather than cherry-pick from an in-progress branch.

## How to start

1. **Read** the spec, the plan, and this brief.
2. **Optional brainstorm**: confirm any design decisions with the user before touching code (the spec is approved, but you might surface edge cases).
3. **Execute**: Phase 3 (Navigation skeleton) → Phase 4 (Day chrome) → Phase 5 (Timeline spine + rows) → Phase 6 (Moments visual) → Phase 7 (Moment creation via selection) → skip Phase 8 → Phase 9 (Moment editing) → Phase 10 (All Days redesign) → Phase 11 (edge cases / polish) → Phase 12 (i18n + RLS).
4. **Verify after each phase**: `npx tsc --noEmit` clean, `npx jest src/utils/journalTimeline.test.ts` 13/13 passing.

The spec and plan are still authoritative for behavior. This brief just adds the practical lessons that aren't in either.
