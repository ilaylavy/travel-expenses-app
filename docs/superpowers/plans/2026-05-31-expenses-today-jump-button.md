# Expenses "Jump to Today" button — Implementation Plan

> **⚠️ Superseded (2026-06-01) — not the shipped approach.** This plan was executed, but the jump proved unreliable (today is buried far down a virtualized list; `scrollToLocation` can't reach unmeasured far rows). The shipped solution instead collapses future-dated expenses under an "Upcoming" header. Kept for the historical record — see PR #24 and the spec's superseded note.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating "Today" pill to the Expenses tab that jumps the list past the future-dated expenses straight to today's section, and transforms into the existing "back to top" circle once the user has scrolled away from the top.

**Architecture:** Screen-local change to `app/(main)/trip/[id]/(tabs)/index.tsx`. A memoized `todayTargetIndex` is derived from the already-grouped `sections` (the first section whose `date <= todayIsoDate()`, which is the today section when present, otherwise the most-recent past day). A `scrollToToday()` callback uses `SectionList.scrollToLocation`, backed by an `onScrollToIndexFailed` retry for the rare case where the target isn't yet measured. The single floating button becomes a three-state control driven by the existing `showScrollTop` flag plus `todayTargetIndex`.

**Tech Stack:** React Native 0.81 + Expo 54, Expo Router, TypeScript strict, `expo-haptics`. Existing in-file helpers: `Animated.SectionList` with `listRef`, `showScrollTop` state, `scrollToTop`, `Icon`, `useTheme`, `useTranslation`, `useIsRTL`.

**Spec:** `docs/superpowers/specs/2026-05-31-expenses-today-jump-button-design.md`

**Commit policy for this run:** Do NOT auto-commit. The user will review this plan and then trigger execution; commits happen only on explicit request. Skip every `git commit` step.

---

## File Structure

| File | Action |
|---|---|
| `src/i18n/locales/en.json` | Modify — add `expensesList.jumpToToday` = `"Today"` |
| `src/i18n/locales/he.json` | Modify — add `expensesList.jumpToToday` = `"היום"` |
| `app/(main)/trip/[id]/(tabs)/index.tsx` | Modify — `todayIsoDate` import; `todayTargetIndex` memo; `scrollToToday`; `handleScrollToIndexFailed`; `onScrollToIndexFailed` prop; three-state button; `todayPill` + `todayPillText` styles |

No new files. No DB / types / store / sync changes.

---

## Task 1: Add the `jumpToToday` i18n key

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/he.json`

- [ ] **Step 1: Add the English string.**

In `src/i18n/locales/en.json`, inside the `"expensesList"` object, the current start is:

```json
  "expensesList": {
    "searchPlaceholder": "Search notes and places",
    "filterAll": "All",
    "scrollToTop": "Scroll to top",
```

Add a `jumpToToday` line directly after `scrollToTop`:

```json
  "expensesList": {
    "searchPlaceholder": "Search notes and places",
    "filterAll": "All",
    "scrollToTop": "Scroll to top",
    "jumpToToday": "Today",
```

- [ ] **Step 2: Add the Hebrew string.**

In `src/i18n/locales/he.json`, inside `"expensesList"`, the current start is:

```json
    "searchPlaceholder": "חיפוש בהערות ומקומות",
    "filterAll": "הכל",
    "scrollToTop": "גלילה למעלה",
```

Add directly after `scrollToTop`:

```json
    "searchPlaceholder": "חיפוש בהערות ומקומות",
    "filterAll": "הכל",
    "scrollToTop": "גלילה למעלה",
    "jumpToToday": "היום",
```

- [ ] **Step 3: Verify JSON is valid.**

Run: `npx tsc --noEmit`
Expected: PASS (also confirms the JSON parses, since locales are imported as typed modules).

---

## Task 2: Add target-index + scroll callbacks in the screen

**Files:**
- Modify: `app/(main)/trip/[id]/(tabs)/index.tsx`

- [ ] **Step 1: Import `todayIsoDate`.**

Find the date-utils import (currently line 54):

```ts
import { formatDayWithYear } from '@/utils/date';
```

Replace with:

```ts
import { formatDayWithYear, todayIsoDate } from '@/utils/date';
```

- [ ] **Step 2: Add `todayTargetIndex` memo after `sections`.**

Find the `sections` memo (currently lines 409–412):

```ts
  const sections = useMemo<ExpenseDateGroup[]>(
    () => groupExpensesByDate(filteredExpenses, getShareForExpense),
    [filteredExpenses, getShareForExpense],
  );
```

Immediately **after** that block, add:

```ts
  // First section at or before today. Because groups are date-descending,
  // this is the "today" section when one exists, otherwise the most-recent
  // past day ("closest to now"). -1 when empty or all-future.
  const todayTargetIndex = useMemo(() => {
    const today = todayIsoDate();
    return sections.findIndex((s) => s.date <= today);
  }, [sections]);
```

- [ ] **Step 3: Add `scrollToToday` and `handleScrollToIndexFailed`.**

Directly **after** the `todayTargetIndex` memo from Step 2, add:

```ts
  const scrollToToday = useCallback(
    (animated = true) => {
      if (todayTargetIndex < 0) return;
      listRef.current?.scrollToLocation({
        sectionIndex: todayTargetIndex,
        itemIndex: 0, // 0 targets the section header ("Today" row)
        viewOffset: 0,
        animated,
      });
    },
    [todayTargetIndex],
  );

  // Resilience for a not-yet-measured target (no getItemLayout): scroll to an
  // approximate offset so the intervening rows render, then retry once.
  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      listRef.current
        ?.getScrollResponder()
        ?.scrollTo({ y: info.averageItemLength * info.index, animated: false });
      setTimeout(() => {
        if (todayTargetIndex < 0) return;
        listRef.current?.scrollToLocation({
          sectionIndex: todayTargetIndex,
          itemIndex: 0,
          viewOffset: 0,
          animated: true,
        });
      }, 80);
    },
    [todayTargetIndex],
  );
```

`useCallback`, `useMemo`, and `useRef` are already imported (line 4); `listRef` is already declared at line 179.

- [ ] **Step 4: Type-check.**

Run: `npx tsc --noEmit`
Expected: PASS. (`scrollToToday`/`handleScrollToIndexFailed` are currently unused — that's fine; ESLint may warn, which Task 4 resolves by wiring them. If you prefer a clean intermediate, do Task 3 + Task 4 before re-running lint.)

---

## Task 3: Wire `onScrollToIndexFailed` onto the list

**Files:**
- Modify: `app/(main)/trip/[id]/(tabs)/index.tsx`

- [ ] **Step 1: Pass the handler to `Animated.SectionList`.**

Find the `Animated.SectionList` opening props (currently lines 625–631):

```tsx
        <Animated.SectionList
          ref={listRef as React.Ref<SectionList<ExpenseListItem, ExpenseDateGroup>>}
          onScroll={onScroll}
          scrollEventThrottle={16}
          sections={sections}
          keyExtractor={(item) => item.key}
          stickySectionHeadersEnabled
```

Add `onScrollToIndexFailed={handleScrollToIndexFailed}` right after `scrollEventThrottle={16}`:

```tsx
        <Animated.SectionList
          ref={listRef as React.Ref<SectionList<ExpenseListItem, ExpenseDateGroup>>}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          sections={sections}
          keyExtractor={(item) => item.key}
          stickySectionHeadersEnabled
```

- [ ] **Step 2: Type-check.**

Run: `npx tsc --noEmit`
Expected: PASS.

If `tsc` reports that `onScrollToIndexFailed` is not assignable to the `Animated.SectionList` props, it is inherited from the underlying `VirtualizedList`; spread it through a cast instead:

```tsx
          {...({ onScrollToIndexFailed: handleScrollToIndexFailed } as object)}
```

Place that spread among the other props (e.g. right after `scrollEventThrottle={16}`) and remove the plain `onScrollToIndexFailed=` line. Re-run `npx tsc --noEmit` → PASS.

---

## Task 4: Replace the floating button with the three-state control

**Files:**
- Modify: `app/(main)/trip/[id]/(tabs)/index.tsx`

- [ ] **Step 1: Replace the button block.**

Find the current scroll-to-top button block (lines 744–764):

```tsx
      {showScrollTop ? (
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            scrollToTop(true);
          }}
          style={({ pressed }) => [
            styles.scrollTop,
            isRTL ? styles.scrollTopLeft : styles.scrollTopRight,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
          accessibilityLabel={t('expensesList.scrollToTop')}
          accessibilityRole="button"
        >
          <Icon name="chevron-up" size={18} color={theme.accent} stroke={2.4} />
        </Pressable>
      ) : null}
```

Replace the **entire** block above with:

```tsx
      {showScrollTop ? (
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            scrollToTop(true);
          }}
          style={({ pressed }) => [
            styles.scrollTop,
            isRTL ? styles.scrollTopLeft : styles.scrollTopRight,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
          accessibilityLabel={t('expensesList.scrollToTop')}
          accessibilityRole="button"
        >
          <Icon name="chevron-up" size={18} color={theme.accent} stroke={2.4} />
        </Pressable>
      ) : todayTargetIndex > 0 ? (
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            scrollToToday(true);
          }}
          style={({ pressed }) => [
            styles.todayPill,
            isRTL ? styles.scrollTopLeft : styles.scrollTopRight,
            {
              backgroundColor: theme.accentSoft,
              borderColor: theme.accent,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
          accessibilityLabel={t('expensesList.jumpToToday')}
          accessibilityRole="button"
        >
          <Icon name="chevron-down" size={16} color={theme.accent} stroke={2.4} />
          <Text style={[styles.todayPillText, { color: theme.accent }]}>
            {t('expensesList.jumpToToday')}
          </Text>
        </Pressable>
      ) : null}
```

`Pressable`, `Text`, `Icon`, `Haptics`, `theme`, `t`, `isRTL` are all already in scope on this screen.

- [ ] **Step 2: Add the pill styles.**

Find the `scrollTop` / `scrollTopRight` / `scrollTopLeft` style entries at the end of the `StyleSheet.create({ ... })` block (lines 908–923):

```ts
  scrollTop: {
    position: 'absolute',
    bottom: 160, // stacks just above the + FAB (FAB at bottom: 90, height: 62)
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  scrollTopRight: { right: 28 },
  scrollTopLeft: { left: 28 },
```

Immediately **after** `scrollTopLeft` (and before the closing `});` of the StyleSheet), add:

```ts
  todayPill: {
    position: 'absolute',
    bottom: 160, // same slot as the scroll-to-top circle
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.lg,
    borderRadius: sizing.radiusPill,
    borderWidth: borderWidth.hairline,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  todayPillText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
```

`spacing`, `sizing`, and `borderWidth` are already imported (line 31).

- [ ] **Step 3: Type-check.**

Run: `npx tsc --noEmit`
Expected: PASS.

---

## Task 5: Type-check + lint the whole change

**Files:**
- (no changes)

- [ ] **Step 1: Type-check.**

Run: `npx tsc --noEmit`
Expected: PASS, no new errors.

- [ ] **Step 2: Lint the touched file.**

Run: `npx eslint "app/(main)/trip/[id]/(tabs)/index.tsx"`
Expected: PASS, or only pre-existing warnings (no new errors). In particular, `scrollToToday` and `handleScrollToIndexFailed` must no longer be flagged as unused (they're wired in Tasks 3–4).

---

## Task 6: Manual verification

**Files:**
- (no changes)

Run the app and walk the spec's scenarios. Use a trip that has at least one **future-dated** expense plus expenses today.

- [ ] **Step 1: Start the dev server.**

Run: `npx expo start`

- [ ] **Step 2: Pill appears + jumps to today.**

Open the trip's Expenses tab. With future expenses present, confirm the accent **"↓ Today"** pill shows at the bottom-right (bottom-left in RTL), above the + FAB. Tap it → the list scrolls down so the **Today** section header is at the top of the list area.

- [ ] **Step 3: Transform to back-to-top.**

After the jump (now scrolled > 300px), confirm the pill has become the neutral **chevron-up circle**. Tap it → the list returns to the very top (future expenses visible again) and the control becomes the "Today" pill again.

- [ ] **Step 4: "Closest to now" fallback.**

On a trip with future + past expenses but **nothing dated today**, tap Today → confirm it lands on the most-recent past day (e.g. yesterday), not on a future day.

- [ ] **Step 5: No future expenses → no pill.**

On a trip whose newest expense is today or earlier, confirm **no** pill shows at the top. Scroll down → the chevron-up circle appears as before.

- [ ] **Step 6: Filter interaction.**

Apply a category filter that excludes today's expenses → confirm Today still jumps to the nearest non-future section in the filtered list (no crash, no jump to a future row).

- [ ] **Step 7: RTL + themes.**

Switch device language to Hebrew → confirm the pill mirrors to the **left** edge and reads **"היום"** with the chevron on the correct side. Toggle light and dark mode → confirm the pill (`accentSoft` bg / `accent` border+text) and the circle (`surface` bg / `border`) both look correct.

---

## Self-Review

- [x] **Spec coverage:** i18n key → Task 1; `todayTargetIndex` + `scrollToToday` + `handleScrollToIndexFailed` → Task 2; `onScrollToIndexFailed` wiring → Task 3; three-state button + pill styles → Task 4; type/lint gates → Task 5; every "Testing notes" scenario → Task 6. ✓
- [x] **Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". Every code step shows full code; every run step shows the command + expected result. The one tunable (`viewOffset: 0`) is a concrete value with an on-device note in the spec. ✓
- [x] **Type consistency:** `todayTargetIndex` (memo), `scrollToToday(animated)`, `handleScrollToIndexFailed(info)`, style keys `todayPill` / `todayPillText`, and i18n key `expensesList.jumpToToday` are spelled identically across every task and match the spec. ✓
- [x] **Commit policy:** No `git commit` steps; review-then-execute per user instruction. ✓
