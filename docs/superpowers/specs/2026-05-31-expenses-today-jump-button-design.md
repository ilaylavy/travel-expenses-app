# Expenses list — "Jump to Today" button

> **⚠️ Superseded (2026-06-01).** The "Jump to Today" button described below was implemented but proved unreliable at runtime: with many future-dated expenses, today sits far down a virtualized `SectionList` (observed at row 120), and `scrollToLocation` cannot reach unmeasured far rows without `getItemLayout`. It was replaced by collapsing future-dated expenses under an "Upcoming" header so today is the first row on open. Kept for the design + debugging record. See PR #24.

**Status:** superseded (was: approved)
**Date:** 2026-05-31
**Worktree:** `journal-frontend-redo`

## Goal

On the Expenses tab, future-dated expenses sort to the very top of the list, which means every time the user opens the screen they have to scroll down past the upcoming entries to reach **today's** expenses. Add a floating button that jumps the list straight to today. When the user has already scrolled away from the top, that same button transforms into the existing "back to top" control.

## Background

The Expenses screen is `app/(main)/trip/[id]/(tabs)/index.tsx` — an `Animated.SectionList` of expenses grouped by day.

- Sections come from `groupExpensesByDate()` (`src/utils/expenseGrouping.ts`), which sorts groups **date-descending**: `groups.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))`. So **future days are at the top**, today sits in the middle, past days below.
- Each group already carries `kind: 'today' | 'yesterday' | 'date'`, tagged via `todayIsoDate()` from `@/utils/date`.
- **Half of this feature already exists.** The screen has:
  - `showScrollTop` state, toggled by a `scrollY` listener at a 300px threshold (lines 176, 210–216).
  - `scrollToTop(animated)` using `listRef.current?.getScrollResponder()?.scrollTo({ y: 0 })` (lines 181–183). `SectionList` has no `scrollToOffset`, which is why scroll-to-top goes through the scroll responder.
  - A floating chevron-up button rendered when `showScrollTop` is true (lines 744–764), stacked above the FAB and RTL-mirrored (`styles.scrollTop` + `scrollTopRight`/`scrollTopLeft`).

The missing half is jumping **down** to today.

## Why earlier attempts at this failed

Jumping to a specific section in a `SectionList` has exactly one correct API: `scrollToLocation({ sectionIndex, itemIndex })`. The likely failure modes of prior attempts:

1. **`itemIndex` math.** To land on a section's *header* row you pass `itemIndex: 0`. Off-by-one mistakes either throw an out-of-range error or land on the wrong row.
2. **Unmeasured target → silent under-scroll.** With no `getItemLayout`, if the target section hasn't been measured yet, `scrollToLocation` scrolls "as far as it can" and stops short — it *looks* like nothing happened. The resilience hook is `onScrollToIndexFailed`.
3. **Guessing a pixel offset.** Trying `scrollTo({ y })` instead requires a known pixel offset, which is impossible with variable-height expense cards (notes, photos, badges, split chips all change row height). Dead end.

In practice the today section sits just under a handful of future rows, so it is almost always already measured and `scrollToLocation` lands cleanly; the `onScrollToIndexFailed` retry is a safety net for the "many future expenses" case.

## Scope

### In scope

1. Compute a single `todayTargetIndex` from `sections`: the first section with `date <= todayIsoDate()`. Because sections are date-descending, this is the today section when one exists, otherwise the most-recent past day ("closest to now").
2. Add `scrollToToday()` using `listRef.current?.scrollToLocation(...)`.
3. Add an `onScrollToIndexFailed` handler (loop-safe retry) to the list.
4. Replace the single-mode floating button with a three-state control:
   - scrolled down → existing chevron-up circle → back to top;
   - near top **and** `todayTargetIndex > 0` → new accent **"Today" pill** → jump to today;
   - near top with nothing above today → hidden.
5. Add i18n key `expensesList.jumpToToday` to `en.json` ("Today") and `he.json` ("היום").

### Out of scope

- **No auto-scroll on open.** The user chose button-only; the screen still opens at the top.
- No change to section ordering, grouping, or the future-at-top design.
- No DB / types / store / sync changes — this is screen-local UI only.
- The 300px scroll-to-top threshold and its button are unchanged.

## Behavior

| Scroll position | Future expenses above today? | Button shown | Tap action |
|---|---|---|---|
| Near top (`!showScrollTop`) | Yes (`todayTargetIndex > 0`) | **"↓ Today" pill** | `scrollToToday()` |
| Near top (`!showScrollTop`) | No (`todayTargetIndex <= 0`) | none | — |
| Scrolled down (`showScrollTop`) | — | chevron-up circle | `scrollToTop(true)` |

Tapping **Today** scrolls the list down past the 300px threshold, so the `scrollY` listener flips `showScrollTop` to true and the control auto-transforms into the back-to-top circle — the "transform" with no extra wiring.

Minor accepted edge: if today is **less than 300px** below the top (only a row or two of future expenses), tapping Today won't cross the threshold, so the pill stays a pill. Harmless — you're already looking at today.

## UI design

Same floating slot above the FAB, RTL-mirrored. Only the "Today" state is new; the back-to-top circle is unchanged.

```
  Near top (future above):        Scrolled down:

      ╭───────────╮                   ╭─────╮
      │  ↓ Today  │                   │  ↑  │
      ╰───────────╯                   ╰─────╯
      accent pill                   neutral circle
   accentSoft bg / accent border   surface bg / border

            ╭─────╮  ← + FAB (unchanged), below both
            │  +  │
            ╰─────╯
```

**"Today" pill** — mirrors the active-tab "accentSoft pill" pattern from the design system:
- 46px tall (matches the circle height for a clean swap), `borderRadius: sizing.radiusPill` (22), `borderWidth.hairline`.
- `backgroundColor: theme.accentSoft`, `borderColor: theme.accent`.
- Row: `<Icon name="chevron-down" size={16} color={theme.accent} stroke={2.4} />` + `Text` `t('expensesList.jumpToToday')` at 14/700, `color: theme.accent`. `flex-direction: row` mirrors automatically in RTL.
- Same shadow as `styles.scrollTop`. Horizontal anchor reuses `scrollTopRight` / `scrollTopLeft` (`right: 28` / `left: 28`); `bottom: 160` like the circle so they occupy the same slot.
- Press scale `0.94` and `Haptics.impactAsync(Light)`, matching the existing button.

## Implementation design — `app/(main)/trip/[id]/(tabs)/index.tsx`

### Target index (memoized)

```ts
const todayTargetIndex = useMemo(() => {
  const today = todayIsoDate();
  return sections.findIndex((s) => s.date <= today);
}, [sections]);
```

`findIndex` returns `-1` when every section is future (rare) or the list is empty. The pill shows only when `todayTargetIndex > 0` (index `0` means today/most-recent is already the top section, so there's nothing to jump past).

Add `todayIsoDate` to the existing date import:
`import { formatDayWithYear, todayIsoDate } from '@/utils/date';`

### `scrollToToday`

```ts
const scrollToToday = useCallback((animated = true) => {
  const idx = todayTargetIndex;
  if (idx < 0) return;
  listRef.current?.scrollToLocation({
    sectionIndex: idx,
    itemIndex: 0,     // 0 targets the section header ("Today" row)
    viewOffset: 0,    // tune on-device if the sticky header clips
    animated,
  });
}, [todayTargetIndex]);
```

`scrollToLocation` is a `SectionList` instance method; it is available on `listRef.current` for the same reason `getScrollResponder()` already works there (the ref resolves to the underlying list instance through `Animated.createAnimatedComponent`).

### `onScrollToIndexFailed` (resilience)

Passed to the `Animated.SectionList`. Loop-safe: scroll to an approximate offset (which forces the intervening rows to render and measure), then retry once on the next tick.

```ts
const handleScrollToIndexFailed = useCallback(
  (info: { index: number; averageItemLength: number }) => {
    listRef.current
      ?.getScrollResponder()
      ?.scrollTo({ y: info.averageItemLength * info.index, animated: false });
    // one retry after layout settles
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

Single retry — no re-arming loop. If `onScrollToIndexFailed` is not accepted on `SectionList`'s prop type, it is inherited from the underlying `VirtualizedList`; pass it through (cast the prop object if `tsc` objects).

### Button render

Replace the current `{showScrollTop ? (<Pressable .../>) : null}` block (lines 744–764) with a three-way:

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

### New styles

```ts
todayPill: {
  position: 'absolute',
  bottom: 160,
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

(`scrollTopRight` / `scrollTopLeft` already provide the horizontal anchor and are reused as-is.)

## Files touched

| File | Change |
|---|---|
| `app/(main)/trip/[id]/(tabs)/index.tsx` | `todayIsoDate` import; `todayTargetIndex` memo; `scrollToToday`; `handleScrollToIndexFailed`; `onScrollToIndexFailed` on the list; three-state button; `todayPill` + `todayPillText` styles |
| `src/i18n/locales/en.json` | Add `expensesList.jumpToToday`: `"Today"` |
| `src/i18n/locales/he.json` | Add `expensesList.jumpToToday`: `"היום"` |

No new files. No DB, types, store, or sync changes.

## Edge cases

| Case | Behavior |
|---|---|
| No future expenses (today already at top) | `todayTargetIndex === 0` → pill hidden; back-to-top still works once scrolled |
| No expense dated exactly today, but future + past exist | `todayTargetIndex` lands on the most-recent past day ("closest to now") |
| Empty list / all filtered away | `sections` empty → `findIndex` = -1 → pill hidden |
| Filters/search active | `sections` recompute from the filtered set; target re-derives correctly; if today is filtered out, jumps to nearest non-future filtered section |
| Today is < 300px below top | Tap doesn't cross threshold; pill stays a pill (already viewing today) — accepted |
| Many future expenses, today not yet measured | `onScrollToIndexFailed` scrolls approximate then retries once |
| Hebrew / RTL | Pill uses `flex-direction: row` (auto-mirrors); horizontal anchor flips via `scrollTopLeft`; no hardcoded left/right |
| Dark + light theme | Pill uses `theme.accentSoft` / `theme.accent`; circle uses `theme.surface` / `theme.border` — both themed |

## i18n strings

`en.json` — inside `expensesList`, after `"scrollToTop"`:

```json
"jumpToToday": "Today",
```

`he.json` — inside `expensesList`, after `"scrollToTop"`:

```json
"jumpToToday": "היום",
```

## Testing notes

Manual (no automated test for this UI):

1. Trip with a few **future** expenses + expenses today → open Expenses → confirm "↓ Today" pill shows at top → tap → list jumps to the Today section header.
2. After the jump, confirm the pill has transformed into the chevron-up circle → tap → returns to top.
3. Trip with future + past but **nothing today** → tap Today → lands on the most-recent past day.
4. Trip with **no future** expenses → confirm no pill at top (today already visible); scroll down → chevron-up circle appears.
5. Apply a category filter that removes today's expenses → confirm Today still targets the nearest non-future section.
6. Hebrew locale → confirm the pill mirrors to the left edge and reads "היום"; both dark and light themes look correct.
7. (If reachable) a trip with many future expenses so today is far down → confirm the jump still lands on Today (exercises `onScrollToIndexFailed`).
