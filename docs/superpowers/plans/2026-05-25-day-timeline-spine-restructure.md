# Day Timeline Spine Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-layer spine composition (one absolutely-positioned outer line + a thicker bracket inside Moment bands) with a single segment-aware vertical line composed of per-row slices. The new spine thickens cleanly across Moments, terminates at the first and last node (no dangling tail), and visibly anchors every row — including the Moment pill — to itself.

**Architecture:** Move spine rendering out of the global `<TimelineSpine />` and the `<MomentTintBand>` bracket and into per-row `<SpineSlice>` segments owned by `SpineNode` (for solo/member rows) and `MomentHeader` (for pill rows). Each slice fills its row's vertical extent and spills into the row's bottom padding, so consecutive slices visually merge. DayScreen computes `capTop`/`capBottom`/`thickness` per row from the section structure and passes them down. Row `marginBottom` becomes `paddingBottom` so the slice can extend through the gap. Member-row indentation is removed so member dots sit on the same x as solo dots.

**Tech Stack:** React Native (Expo SDK 52+), TypeScript, StyleSheet. No new dependencies.

**Worktree:** This plan must execute in `.claude/worktrees/journal-frontend-redo` (where the journal redesign code lives). Verify with `git branch --show-current` → `claude/journal-frontend-redo` before starting any task.

---

## Reference geometry

These constants and offsets are referenced throughout the plan. They derive from the existing layout in `src/components/journal/SpineNode.tsx`:

- `NODE_COLUMN_WIDTH = 64` — width of the left column in every row (SpineNode and MomentHeader gutter).
- `SPINE_CENTER = 32` — x-coordinate (within the column) where the spine's center should sit. = `Math.round(NODE_COLUMN_WIDTH / 2)`.
- Solo dot: 9px filled accent at `paddingTop: 8` of the SpineNode column. Dot center y = `8 + 9 = 17` from column top.
- Member dot: 8px hollow ring at the same y = 17.
- Pill row vertical center (in `MomentHeader.tsx`): pill content height ≈ 36px (`paddingVertical: 8` × 2 + 22px glyph disc + a hair of slack). Use `pillCenterY = 22` for cap split.
- Thin slice width: 2px. Thick slice width: 4px. Both rounded.
- Slice x positioning (so the center stays at `SPINE_CENTER = 32` regardless of thickness):
  - thin: `insetInlineStart = SPINE_CENTER - 1 = 31` (spans 31–33, center 32)
  - thick: `insetInlineStart = SPINE_CENTER - 2 = 30` (spans 30–34, center 32)

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/journal/SpineSlice.tsx` | Create | New primitive: a vertical line segment for one row, parameterized by `thickness`, `capTop`, `capBottom`, `dotCenterY`. Also exports `SpineBranch` for horizontal stubs. |
| `src/components/journal/SpineNode.tsx` | Modify | Render a `<SpineSlice>` behind the existing dot + label. Accept `thickness`, `capTop`, `capBottom` props and forward them. |
| `src/components/journal/TimelineSpine.tsx` | Delete | Replaced by per-row slices. |
| `src/components/journal/MomentTintBand.tsx` | Modify | Remove the bracket overlay (lines 45-56). Keep the soft tint. |
| `src/components/journal/MomentHeader.tsx` | Modify | Replace the empty 64px gutter with a thick `<SpineSlice>` + horizontal `<SpineBranch>` so the pill anchors to the spine. Accept `capTop`, `capBottom` props. |
| `src/components/journal/timeline/ExpenseTimelineRow.tsx` | Modify | Accept and forward new spine props. Remove `indented` style. Switch `marginBottom: 18` → `paddingBottom: 18` so slice extends through the gap. |
| `src/components/journal/timeline/PhotoEntryRow.tsx` | Modify | Same as ExpenseTimelineRow. |
| `src/components/journal/timeline/VoiceClipRow.tsx` | Modify | Same as ExpenseTimelineRow. |
| `src/components/journal/DayScreen.tsx` | Modify | Remove `<TimelineSpine />`. Compute `capTop`/`capBottom`/`thickness` per rendered row from the sections array. Thread them through `renderRow` and the Moment branch. |

No new tests for visual changes. The structural correctness checks are `npx tsc --noEmit` and the existing `npx jest src/utils/journalTimeline.test.ts`. Verification of the visual result happens manually by running `npx expo start` and inspecting in the dev client (Android emulator preferred — the project ships as APK).

---

## Task 1: Create the `SpineSlice` primitive

**Files:**
- Create: `src/components/journal/SpineSlice.tsx`

This is a pure presentational component — no state, no measurement. It paints a vertical line segment within an absolutely-positioned `View`. Caller is responsible for putting it inside a `position: 'relative'` parent that fills the desired row height.

`SpineBranch` (also exported from this file) paints a short horizontal stub from the spine column out toward the body. Used by `MomentHeader` to visibly attach the pill to the spine.

- [ ] **Step 1: Write the component file**

```tsx
// src/components/journal/SpineSlice.tsx
//
// Per-row vertical spine segment. Replaces the global <TimelineSpine /> +
// the <MomentTintBand /> bracket with a single, row-owned line that the
// caller composes per row.
//
// Geometry rationale: NODE_COLUMN_WIDTH = 64 from SpineNode. The spine's
// center stays at SPINE_CENTER = 32 regardless of thickness, so the inset
// is computed as SPINE_CENTER - floor(width/2). This keeps the line
// centered on the dots when thickness changes between rows (solo → moment
// member). RTL is handled by `insetInlineStart` (logical edge).

import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

import { NODE_COLUMN_WIDTH } from './SpineNode';

export const SPINE_CENTER = Math.round(NODE_COLUMN_WIDTH / 2); // 32

const THIN_WIDTH = 2;
const THICK_WIDTH = 4;
const THIN_OPACITY = 0.35;
const THICK_OPACITY = 0.85;

interface SliceProps {
  thickness: 'thin' | 'thick';
  capTop: boolean;
  capBottom: boolean;
  // y-offset (from row top) of the dot center. Determines where capTop /
  // capBottom truncate the line so it ends exactly under/over the dot
  // rather than at the row edge. Default 17 matches SpineNode's dot.
  dotCenterY?: number;
}

export function SpineSlice({
  thickness,
  capTop,
  capBottom,
  dotCenterY = 17,
}: SliceProps) {
  const theme = useTheme();
  // Single-node row: dot says everything, no need for a line.
  if (capTop && capBottom) return null;

  const width = thickness === 'thin' ? THIN_WIDTH : THICK_WIDTH;
  const opacity = thickness === 'thin' ? THIN_OPACITY : THICK_OPACITY;
  const inset = SPINE_CENTER - Math.floor(width / 2);

  // top/bottom semantics:
  //  - capTop  true  → slice starts at dotCenterY (no upper extension)
  //  - capBottom true → slice ends at dotCenterY (no lower extension)
  //  - both false   → slice spans the full row including paddingBottom
  return (
    <View
      pointerEvents="none"
      style={[
        styles.base,
        {
          insetInlineStart: inset,
          width,
          backgroundColor: theme.accent,
          opacity,
          top: capTop ? dotCenterY : 0,
          ...(capBottom
            ? { height: dotCenterY - (capTop ? dotCenterY : 0) }
            : { bottom: 0 }),
        },
      ]}
    />
  );
}

interface BranchProps {
  thickness: 'thin' | 'thick';
  // y-offset of the row's anchor point (dot center for SpineNode rows,
  // pill center for MomentHeader). The horizontal stub aligns to this y.
  anchorY: number;
  // Stub length, measured from spine center toward the body. Default 18px
  // gives a clear "attached to spine" read without trying to fully bridge
  // the gap to the body card.
  length?: number;
}

export function SpineBranch({
  thickness,
  anchorY,
  length = 18,
}: BranchProps) {
  const theme = useTheme();
  const height = thickness === 'thin' ? THIN_WIDTH : THICK_WIDTH;
  const opacity = thickness === 'thin' ? THIN_OPACITY : THICK_OPACITY;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.branch,
        {
          insetInlineStart: SPINE_CENTER,
          width: length,
          height,
          top: anchorY - Math.floor(height / 2),
          backgroundColor: theme.accent,
          opacity,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    borderRadius: 1,
  },
  branch: {
    position: 'absolute',
    borderRadius: 1,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors from the new file. (Pre-existing errors elsewhere in the repo are unrelated to this change.)

- [ ] **Step 3: Commit**

```bash
git add src/components/journal/SpineSlice.tsx
git commit -m "Add SpineSlice + SpineBranch primitives for per-row spine"
```

---

## Task 2: Wire `SpineSlice` into `SpineNode` (keep global spine intact)

**Files:**
- Modify: `src/components/journal/SpineNode.tsx`

Add `thickness`, `capTop`, `capBottom` props to `SpineNode` and render a `<SpineSlice>` behind the dot/label. At this point the global `<TimelineSpine />` is still drawing, so visually you'll see the per-row slice overlapping the outer spine — they should look identical (same x, same color, similar opacity). This step is a pure refactor; nothing should look worse.

The root `<Pressable>` of SpineNode needs to be `position: 'relative'` and stretch to fill the row's full height so the absolutely-positioned slice can extend the full row height. Today it relies on default flex stretch behavior; we make this explicit by setting `alignSelf: 'stretch'`.

- [ ] **Step 1: Add the new props and import**

Modify `src/components/journal/SpineNode.tsx`:

Replace the imports block (lines 11-14) with:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

import { SpineSlice } from './SpineSlice';
```

Replace the `Props` interface (lines 20-30) with:

```tsx
interface Props {
  occurredAt: string;
  loggedByName?: string | null;
  variant: 'solo' | 'member';
  onDragStart?: () => void;
  selectable?: boolean;
  selected?: boolean;
  // Per-row spine parameters. The owning row decides these based on its
  // position in the section list (first / last) and whether it's inside a
  // Moment (thick).
  spineThickness?: 'thin' | 'thick';
  spineCapTop?: boolean;
  spineCapBottom?: boolean;
}
```

Replace the function signature (lines 32-39) with:

```tsx
export function SpineNode({
  occurredAt,
  loggedByName,
  variant,
  onDragStart,
  selectable,
  selected,
  spineThickness = 'thin',
  spineCapTop = false,
  spineCapBottom = false,
}: Props) {
```

- [ ] **Step 2: Render `<SpineSlice>` inside the root and stretch the column**

Inside the `return (`, replace the entire `<Pressable>` opening tag and its first child (currently lines 66-72) — that is, from `<Pressable` through `<View style={styles.dotWrap}>` — with:

```tsx
    <Pressable
      onLongPress={onDragStart}
      hitSlop={8}
      delayLongPress={300}
      accessibilityLabel={onDragStart ? t('journal.dragToReorder') : undefined}
      style={styles.root}
    >
      <SpineSlice
        thickness={spineThickness}
        capTop={spineCapTop}
        capBottom={spineCapBottom}
      />
      <View style={styles.dotWrap}>
```

(The rest of the JSX — the dot, the optional check ring, the time text, the by-name text, and the closing `</Pressable>` — is unchanged.)

Update the `styles.root` block (lines 131-135) to stretch and become a positioning container:

```tsx
  root: {
    width: NODE_COLUMN_WIDTH,
    alignItems: 'center',
    paddingTop: 8,
    alignSelf: 'stretch',
    position: 'relative',
  },
```

Also make sure the dot wrap renders ABOVE the slice (so the dot's glow isn't hidden by the line). Update `styles.dotWrap` (lines 136-142) to:

```tsx
  dotWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 4: Manual verification in dev client**

Run: `npx expo start --android`
Open the trip Journal tab → a day with at least 2 expenses and a Moment with 2+ members.
Expected: the timeline looks identical to before. The new per-row slices are drawing in the same column as the outer spine, at the same x and similar opacity, so they overlap invisibly. Member rows still look offset (the indent bug is still there). The Moment bracket still shows. The tail below the last row still shows. No regressions.

- [ ] **Step 5: Commit**

```bash
git add src/components/journal/SpineNode.tsx
git commit -m "Render per-row spine slice inside SpineNode (overlay with global)"
```

---

## Task 3: Switch row `marginBottom` → `paddingBottom` so slices connect through gaps

**Files:**
- Modify: `src/components/journal/timeline/ExpenseTimelineRow.tsx`
- Modify: `src/components/journal/timeline/PhotoEntryRow.tsx`
- Modify: `src/components/journal/timeline/VoiceClipRow.tsx`

Today each row has `marginBottom: 18`. The slice inside SpineNode extends to `bottom: 0` of the row, but margins are OUTSIDE the row box, so the slice doesn't cover the gap. Convert to `paddingBottom` so the gap becomes part of the row, and the slice (with `bottom: 0`) fills through it.

The body column inherits the padding too, which adds vertical whitespace between bodies — that's fine, the visual gap is the same as before (just owned by the row, not by the margin).

- [ ] **Step 1: Update `ExpenseTimelineRow.tsx` styles**

In `src/components/journal/timeline/ExpenseTimelineRow.tsx`, replace the `styles.row` block (lines 133-137) with:

```tsx
  row: {
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 18,
  },
```

- [ ] **Step 2: Update `PhotoEntryRow.tsx` styles**

In `src/components/journal/timeline/PhotoEntryRow.tsx`, replace the `styles.row` block (lines 156-160) with:

```tsx
  row: {
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 18,
  },
```

- [ ] **Step 3: Update `VoiceClipRow.tsx` styles**

In `src/components/journal/timeline/VoiceClipRow.tsx`, replace the `styles.row` block (lines 187-191) with:

```tsx
  row: {
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 18,
  },
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 5: Manual verification**

Reload the dev client. The vertical gap between rows should look the same as before. The per-row slice (still hidden behind the global spine) now visually fills through the gap — you won't see this difference yet because the global spine still draws over it.

- [ ] **Step 6: Commit**

```bash
git add src/components/journal/timeline/ExpenseTimelineRow.tsx src/components/journal/timeline/PhotoEntryRow.tsx src/components/journal/timeline/VoiceClipRow.tsx
git commit -m "Convert row marginBottom to paddingBottom for spine continuity"
```

---

## Task 4: Remove the global `<TimelineSpine />` from DayScreen

**Files:**
- Modify: `src/components/journal/DayScreen.tsx`
- Delete: `src/components/journal/TimelineSpine.tsx`

The per-row slices are now the sole source of the spine. Removing the global one reveals their actual coverage: continuous within the timeline, terminating at the top of the first row and bottom of the last row (no more tail). Caps haven't been wired yet, so the spine still extends to the row edges (which look slightly off above the first dot and below the last dot) — Task 5 fixes that.

`MomentTintBand` still has its bracket, which now coexists with the new thick slice (added in Task 6). We leave the bracket for now to keep the Moment range visually marked while iterating.

- [ ] **Step 1: Remove the import and JSX in DayScreen**

In `src/components/journal/DayScreen.tsx`:

Remove the import on line 54:

```tsx
import { TimelineSpine } from './TimelineSpine';
```

Remove the JSX usage at line 688 (inside `timelineWrap`). The current block at lines 685-688 reads:

```tsx
          {/* Lesson #5: the spine is one continuous line behind every row,
              including through Moments. MomentTintBand draws its thicker
              accent bracket OVER the spine for the Moment's vertical span. */}
          <TimelineSpine />
```

Replace it with a comment-only block:

```tsx
          {/* Spine: per-row slices via SpineSlice (inside SpineNode and
              MomentHeader). No global spine here — see SpineSlice.tsx and
              Lesson #5: spine is ONE line, ownership is per-row to handle
              caps + Moment thickness transitions cleanly. */}
```

- [ ] **Step 2: Delete the now-unused file**

```bash
git rm src/components/journal/TimelineSpine.tsx
```

- [ ] **Step 3: Search for any remaining imports**

Run: `npx tsc --noEmit`
Expected: No errors. (`MomentTintBand.tsx` currently imports `SPINE_X` from `TimelineSpine`; that import gets fixed in Task 7 when we remove the bracket. To keep this task green, we update the import preemptively.)

If the tsc check surfaces an import-not-found error for `SPINE_X` in `MomentTintBand.tsx`, update line 16 of `MomentTintBand.tsx` from:

```tsx
import { SPINE_X } from './TimelineSpine';
```

to:

```tsx
import { SPINE_CENTER } from './SpineSlice';
```

And update line 51 from:

```tsx
            insetInlineStart: SPINE_X - 1,
```

to:

```tsx
            insetInlineStart: SPINE_CENTER - Math.floor(BRACKET_THICKNESS / 2),
```

This preserves the bracket's existing position (still centered on the spine) without depending on the deleted file.

Re-run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Manual verification**

Reload the dev client.
Expected:
- The spine still appears as a continuous vertical line through the timeline (now from per-row slices).
- The bottom tail past the last row is **gone** — the spine ends at (or just past) the last dot.
- The little stub above the first dot is **gone**.
- A small visual artifact may show at the top of the very first row if its slice extends above its dot — Task 5 fixes that with `capTop`.
- Inside Moments, the thicker bracket from `MomentTintBand` still draws. Member dots are still indented off the spine (Task 7 fixes).
- The pill row still has no spine slice (only an empty gutter) — Task 8 fixes.

If anything looks broken (e.g., spine completely gone or wrong x), revert and re-check Task 2 + Task 3 wiring.

- [ ] **Step 5: Commit**

```bash
git add src/components/journal/DayScreen.tsx src/components/journal/MomentTintBand.tsx
git commit -m "Remove global TimelineSpine; per-row slices take over"
```

---

## Task 5: Compute and wire `capTop` / `capBottom` per row in DayScreen

**Files:**
- Modify: `src/components/journal/DayScreen.tsx`

`capTop` is true for the FIRST visible row of the timeline (so its slice starts at the dot center instead of row top). `capBottom` is true for the LAST visible row (so its slice ends at the dot center instead of row bottom).

The relevant unit is the rendered ROW, not the section. So we compute it by iterating through the `sections` array and tracking:
- `isFirstRow = (sectionIdx === 0) && (within a moment: memberIdx === 0)` for the first row
- `isLastRow = (sectionIdx === sections.length - 1) && (within a moment: memberIdx === members.length - 1, or collapsed → pill is the last row)` for the last row

For a solo section, the section IS one row, so `isFirstRow = (sIdx === 0)` and `isLastRow = (sIdx === sections.length - 1)`.

For a moment section: the pill is one row, then members are rows (unless collapsed). The pill is the first row if `sIdx === 0`. The last member is the last row if `sIdx === sections.length - 1` and not collapsed. If collapsed and `sIdx === sections.length - 1`, the pill IS the last row.

- [ ] **Step 1: Add cap computation helpers in DayScreen**

In `src/components/journal/DayScreen.tsx`, inside the `DayScreen` function body, before the `return (` (around line 638, after the `confirmSelection` definition ends but before `return (`), add:

```tsx
  // Per-row cap flags: capTop on the very first visible row, capBottom on
  // the very last. Computed here so the renderRow logic can stay simple.
  const totalSections = sections.length;
  const isFirstSection = (sIdx: number): boolean => sIdx === 0;
  const isLastSection = (sIdx: number): boolean => sIdx === totalSections - 1;
```

- [ ] **Step 2: Thread `capTop` / `capBottom` into `renderRow`**

Update the `renderRow` function signature (around line 431-434) from:

```tsx
  const renderRow = (
    item: TimelineItem,
    opts: { isMember: boolean },
  ): React.ReactNode => {
```

to:

```tsx
  const renderRow = (
    item: TimelineItem,
    opts: {
      isMember: boolean;
      spineCapTop?: boolean;
      spineCapBottom?: boolean;
    },
  ): React.ReactNode => {
```

In the three `return (` branches inside `renderRow` (`PhotoEntryRow`, `VoiceClipRow`, `ExpenseTimelineRow`), add three new props passed to each row component. Find each `return (` and add to the props (after `isMember={opts.isMember}`):

```tsx
          spineThickness={opts.isMember ? 'thick' : 'thin'}
          spineCapTop={opts.spineCapTop ?? false}
          spineCapBottom={opts.spineCapBottom ?? false}
```

So for `PhotoEntryRow` (lines 448-474), the call becomes:

```tsx
      return (
        <PhotoEntryRow
          key={`photo:${item.id}`}
          entry={item.entry as JournalPhotoEntryWithPhotos}
          loggedByName={loggedByName}
          isMember={opts.isMember}
          spineThickness={opts.isMember ? 'thick' : 'thin'}
          spineCapTop={opts.spineCapTop ?? false}
          spineCapBottom={opts.spineCapBottom ?? false}
          selectable={inSelection}
          selected={selected}
          onSelectToggle={toggleThis}
          animateIn={animateInKey === selectionKey}
          onCaptionChange={(next) => {
            void handleCaptionChange(item.id, next);
          }}
          onOpenPhoto={() => {
            /* gallery viewer wired later */
          }}
          onLongPress={() => {
            if (inSelection) return;
            setActionTarget(item);
          }}
          onPhotoLongPress={() => {
            if (inSelection) return;
            setActionTarget(item);
          }}
          onDragStart={() => undefined}
        />
      );
```

Make the analogous change to the `VoiceClipRow` block (lines 477-498) and the `ExpenseTimelineRow` block (lines 504-522).

- [ ] **Step 3: Pass cap flags from the `sections.map` site**

In the `sections.map((s) => {` block (around line 725), update the solo branch and the moment branch:

Replace the current solo branch (around lines 726-734):

```tsx
              if (s.kind === 'solo') {
                return (
                  <View
                    key={`solo:${s.id}`}
                    onLayout={handleRowLayout(`solo:${s.item.kind}:${s.item.id}`)}
                  >
                    {renderRow(s.item, { isMember: false })}
                  </View>
                );
              }
```

with (using the `sIdx` from `.map((s, sIdx) => ...)` — see next change):

```tsx
              if (s.kind === 'solo') {
                return (
                  <View
                    key={`solo:${s.id}`}
                    onLayout={handleRowLayout(`solo:${s.item.kind}:${s.item.id}`)}
                  >
                    {renderRow(s.item, {
                      isMember: false,
                      spineCapTop: isFirstSection(sIdx),
                      spineCapBottom: isLastSection(sIdx),
                    })}
                  </View>
                );
              }
```

Update the `sections.map` callback signature from `((s) => {` to `((s, sIdx) => {`.

Now the moment branch. Find the inner `{s.members.map((it, idx) => (` (around line 768). The members are rendered inside `<MomentTintBand>` via `<Fragment>`. Each member should get the per-row cap flags. Update the call to `renderRow` (currently `renderRow(it, { isMember: true })`) to:

```tsx
                        {renderRow(it, {
                          isMember: true,
                          spineCapTop: false, // pill above
                          spineCapBottom:
                            isLastSection(sIdx) && idx === s.members.length - 1,
                        })}
```

(Note: `s.members.map((it, idx) => (...))` already has `idx` in scope.)

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors. If there's a "Property 'spineThickness' does not exist" error on a row component, you haven't yet plumbed the new props through that row in Task 6. That's fine for this step — the props are optional in `SpineNode` so they just default. But the row components don't yet ACCEPT them. The TS error will appear here. Fix it preemptively: see Task 6 Step 1 for adding the props to each row component's interface and forwarding them to `SpineNode`.

If you'd rather complete Task 5 before any row changes, you can comment out the `spineThickness` / `spineCapTop` / `spineCapBottom` props in `renderRow` temporarily, finish Task 5, then uncomment them after Task 6. Either order is fine. Since the rest of this plan assumes they're wired, do Task 6 next.

- [ ] **Step 5: Commit**

```bash
git add src/components/journal/DayScreen.tsx
git commit -m "Compute capTop/capBottom + thickness per row in DayScreen"
```

---

## Task 6: Forward spine props through the three row components

**Files:**
- Modify: `src/components/journal/timeline/ExpenseTimelineRow.tsx`
- Modify: `src/components/journal/timeline/PhotoEntryRow.tsx`
- Modify: `src/components/journal/timeline/VoiceClipRow.tsx`

Each row component currently forwards `isMember` to SpineNode but nothing else spine-related. Add the three new props (`spineThickness`, `spineCapTop`, `spineCapBottom`), forward them to SpineNode.

- [ ] **Step 1: Update `ExpenseTimelineRow.tsx`**

In `src/components/journal/timeline/ExpenseTimelineRow.tsx`, add the three props to the `Props` interface (after `isMember?: boolean;` around line 30):

```tsx
  isMember?: boolean;
  spineThickness?: 'thin' | 'thick';
  spineCapTop?: boolean;
  spineCapBottom?: boolean;
```

Add them to the function signature destructuring (after `isMember,` around line 47):

```tsx
  isMember,
  spineThickness,
  spineCapTop,
  spineCapBottom,
```

Forward them to `<SpineNode>` (replace the existing `<SpineNode ... />` block around lines 92-99) with:

```tsx
      <SpineNode
        occurredAt={occurredAt}
        loggedByName={!isSelfLogged && loggedByName ? loggedByName : undefined}
        variant={isMember ? 'member' : 'solo'}
        onDragStart={onDragStart}
        selectable={selectable}
        selected={selected}
        spineThickness={spineThickness}
        spineCapTop={spineCapTop}
        spineCapBottom={spineCapBottom}
      />
```

- [ ] **Step 2: Update `PhotoEntryRow.tsx`**

Same three additions in `src/components/journal/timeline/PhotoEntryRow.tsx`:

Props interface (add after `isMember?: boolean;` around line 29):

```tsx
  isMember?: boolean;
  spineThickness?: 'thin' | 'thick';
  spineCapTop?: boolean;
  spineCapBottom?: boolean;
```

Function signature (add after `isMember,` around line 48):

```tsx
  isMember,
  spineThickness,
  spineCapTop,
  spineCapBottom,
```

Replace the `<SpineNode ... />` block (around lines 83-90):

```tsx
      <SpineNode
        occurredAt={entry.occurredAt}
        loggedByName={loggedByName ?? undefined}
        variant={isMember ? 'member' : 'solo'}
        onDragStart={onDragStart}
        selectable={selectable}
        selected={selected}
        spineThickness={spineThickness}
        spineCapTop={spineCapTop}
        spineCapBottom={spineCapBottom}
      />
```

- [ ] **Step 3: Update `VoiceClipRow.tsx`**

Same three additions in `src/components/journal/timeline/VoiceClipRow.tsx`:

Props interface (add after `isMember?: boolean;` around line 33):

```tsx
  isMember?: boolean;
  spineThickness?: 'thin' | 'thick';
  spineCapTop?: boolean;
  spineCapBottom?: boolean;
```

Function signature (add after `isMember,` around line 49):

```tsx
  isMember,
  spineThickness,
  spineCapTop,
  spineCapBottom,
```

Replace the `<SpineNode ... />` block (around lines 86-93):

```tsx
      <SpineNode
        occurredAt={clip.occurredAt}
        loggedByName={loggedByName ?? undefined}
        variant={isMember ? 'member' : 'solo'}
        onDragStart={onDragStart}
        selectable={selectable}
        selected={selected}
        spineThickness={spineThickness}
        spineCapTop={spineCapTop}
        spineCapBottom={spineCapBottom}
      />
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors. Cap props are now plumbed end-to-end.

- [ ] **Step 5: Manual verification**

Reload the dev client. Open a day with 3+ entries and at least one Moment with 2 members.
Expected:
- The very top of the spine no longer extends above the first dot — it starts AT the first dot's center.
- The very bottom of the spine no longer extends below the last dot — it ends AT the last dot's center.
- Moment members now have a THICKER slice (4px) at full accent opacity. This overlaps with the existing bracket from `MomentTintBand`, so the bracket looks slightly wider/messier inside the band. That's expected — Task 7 removes the bracket.
- Solo rows still have their thin (2px @ 35% opacity) slice.

- [ ] **Step 6: Commit**

```bash
git add src/components/journal/timeline/ExpenseTimelineRow.tsx src/components/journal/timeline/PhotoEntryRow.tsx src/components/journal/timeline/VoiceClipRow.tsx
git commit -m "Forward spine thickness + caps from rows to SpineNode"
```

---

## Task 7: Remove the bracket from `MomentTintBand` and the indent from member rows

**Files:**
- Modify: `src/components/journal/MomentTintBand.tsx`
- Modify: `src/components/journal/timeline/ExpenseTimelineRow.tsx`
- Modify: `src/components/journal/timeline/PhotoEntryRow.tsx`
- Modify: `src/components/journal/timeline/VoiceClipRow.tsx`

Now that member rows render their own thick slice via SpineNode, the bracket inside `MomentTintBand` is duplicative. Remove it. Keep the soft tint background — the tint is what visually groups the rows as a Moment.

Also kill the `indented` style on member rows. The brief's Lesson #5 specifies the spine is ONE line; the 12px indent shifts member rows (and their dots) rightward off the spine. Removing it puts the dots back on the spine.

- [ ] **Step 1: Strip the bracket from `MomentTintBand.tsx`**

Replace the entire contents of `src/components/journal/MomentTintBand.tsx` with:

```tsx
// Wrapper around a Moment's member rows. Adds a soft accent tint behind
// the rows so they read as a single unit visually.
//
// Lesson #5: the spine itself is rendered per-row (via SpineSlice inside
// SpineNode). This band does NOT draw a bracket — member rows render
// their own thick slice in the same x-column as solo slices, and the
// continuity comes from the cap/thickness props in DayScreen. Keeping a
// bracket here would double-draw the line and cause the thickness /
// position mismatch described in the spine-restructure plan.

import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface Props {
  children: React.ReactNode;
}

export function MomentTintBand({ children }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.band}>
      {/* Soft accent tint underneath everything — separate View so its
          opacity doesn't bleed into the children (avoid wrapping with
          `opacity` directly, which inherits to descendants on Android). */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: theme.accent,
            opacity: 0.05,
            borderRadius: 14,
          },
        ]}
      />
      <View style={styles.contentWrap}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    marginBottom: 10,
    position: 'relative',
    borderRadius: 14,
  },
  contentWrap: {
    paddingTop: 8,
    paddingBottom: 4,
  },
});
```

- [ ] **Step 2: Remove the `indented` style from `ExpenseTimelineRow.tsx`**

In `src/components/journal/timeline/ExpenseTimelineRow.tsx`:

Remove the conditional in the `Animated.View` style (line 88) — change from:

```tsx
      style={[
        styles.row,
        isMember && styles.indented,
        { opacity, transform: [{ translateY }] },
      ]}
```

to:

```tsx
      style={[styles.row, { opacity, transform: [{ translateY }] }]}
```

Remove the `indented` style block from the StyleSheet (line 138):

```tsx
  indented: { marginInlineStart: 12 },
```

— delete that line.

- [ ] **Step 3: Remove the `indented` style from `PhotoEntryRow.tsx`**

In `src/components/journal/timeline/PhotoEntryRow.tsx`:

Replace the `Animated.View` style block (around lines 77-81):

```tsx
      style={[
        styles.row,
        isMember && styles.indented,
        { opacity, transform: [{ translateY }] },
      ]}
```

with:

```tsx
      style={[styles.row, { opacity, transform: [{ translateY }] }]}
```

Delete the `indented` style block (lines 161-163):

```tsx
  indented: {
    marginInlineStart: 12,
  },
```

- [ ] **Step 4: Remove the `indented` style from `VoiceClipRow.tsx`**

In `src/components/journal/timeline/VoiceClipRow.tsx`:

Replace the `Animated.View` style block (around lines 80-84):

```tsx
      style={[
        styles.row,
        isMember && styles.indented,
        { opacity, transform: [{ translateY }] },
      ]}
```

with:

```tsx
      style={[styles.row, { opacity, transform: [{ translateY }] }]}
```

Delete the `indented` style block (line 192):

```tsx
  indented: { marginInlineStart: 12 },
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors. (You may see an unused-import warning for `SPINE_CENTER` in `MomentTintBand.tsx` if it was added in Task 4 Step 3 — remove that import line if so.)

- [ ] **Step 6: Manual verification**

Reload the dev client. Open the same day as before.
Expected:
- Member dots now sit on the same x as solo dots. The hollow rings line up with the filled dots.
- The Moment band still shows the soft accent tint background.
- The thick spine slice runs continuously through the member rows. The transition from thin (solo above) to thick (member) happens at the row boundary — visible as a clean thickness step.
- The pill row still has an empty gutter (no spine) — Task 8 fixes that and is the final visual fix.

If the member dots still look indented, double-check that the `isMember && styles.indented` was removed from all three row components.

- [ ] **Step 7: Commit**

```bash
git add src/components/journal/MomentTintBand.tsx src/components/journal/timeline/ExpenseTimelineRow.tsx src/components/journal/timeline/PhotoEntryRow.tsx src/components/journal/timeline/VoiceClipRow.tsx
git commit -m "Strip Moment bracket + member-row indent; spine is one line"
```

---

## Task 8: Anchor the Moment pill to the spine via a thick slice + horizontal branch

**Files:**
- Modify: `src/components/journal/MomentHeader.tsx`
- Modify: `src/components/journal/DayScreen.tsx`

The pill row currently renders a `<View style={styles.gutter} />` — an empty 64px column. Replace it with a `<View>` that renders a `<SpineSlice thickness="thick">` (fills the row's vertical extent) plus a `<SpineBranch thickness="thick" anchorY={pillCenterY}>` extending horizontally from the spine into the pill.

The branch is what visibly attaches the pill to the spine — without it the pill just sits beside the spine and the visual relationship is ambiguous.

Also forward `capTop` / `capBottom` from `MomentHeader` so a pill that's the very first row (moment is the first section) gets `capTop` and a pill that's the last row (collapsed moment as last section) gets `capBottom`. Pass these from DayScreen's moment branch.

- [ ] **Step 1: Add cap props to `MomentHeader.tsx` and render the spine slice**

Replace the entire contents of `src/components/journal/MomentHeader.tsx` with:

```tsx
// The pill that hangs off the spine and bookmarks a Moment on the day's
// timeline. Glyph + title + time range + member-count badge + chevron.
// Title taps open the MomentOptionsSheet (rename / cover / split / delete);
// chevron taps collapse/expand the Moment's member list.
//
// Spine: the row owns its own thick spine slice plus a horizontal branch
// stub from the spine to the pill's inline-start edge — together these
// visibly anchor the pill to the spine instead of letting it float beside.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { JournalMoment } from '@/types/journal';

import { NODE_COLUMN_WIDTH } from './SpineNode';
import { SpineBranch, SpineSlice } from './SpineSlice';

// Vertical anchor inside the pill row, used to align the horizontal
// branch and (when capped) to truncate the spine slice. Approximates the
// pill's vertical center given paddingVertical: 8 + glyphDisc 22 + a
// hair of slack.
const PILL_CENTER_Y = 22;

interface Props {
  moment: JournalMoment;
  startsAt: string;
  endsAt: string;
  memberCount: number;
  collapsed: boolean;
  onPress: () => void;
  onToggleCollapse: () => void;
  spineCapTop?: boolean;
  spineCapBottom?: boolean;
}

export function MomentHeader({
  moment,
  startsAt,
  endsAt,
  memberCount,
  collapsed,
  onPress,
  onToggleCollapse,
  spineCapTop = false,
  spineCapBottom = false,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const title = moment.title ?? t('journal.untitledMoment');
  const range = `${shortTime(startsAt)} – ${shortTime(endsAt)}`;

  return (
    <View style={styles.row}>
      {/* Gutter holds the thick spine slice + horizontal branch. The slice
          extends the full row height so it connects to the slices above
          and below; the branch sits at PILL_CENTER_Y and reaches into the
          pill. capTop/capBottom truncate the slice for first/last-row
          edge cases (collapsed moment as the only section, etc.). */}
      <View style={styles.gutter}>
        <SpineSlice
          thickness="thick"
          capTop={spineCapTop}
          capBottom={spineCapBottom}
          dotCenterY={PILL_CENTER_Y}
        />
        <SpineBranch thickness="thick" anchorY={PILL_CENTER_Y} length={18} />
      </View>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: theme.accentSoft,
            borderColor: theme.accent,
          },
          pressed && { opacity: 0.92 },
        ]}
      >
        <View style={[styles.glyphDisc, { backgroundColor: theme.accent }]}>
          <Text style={styles.glyph}>✦</Text>
        </View>
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
          <Text
            style={[styles.range, { color: theme.textMuted }]}
            numberOfLines={1}
          >
            {range}
          </Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: theme.accent }]}>
          <Text style={styles.countText}>{memberCount}</Text>
        </View>
        <Pressable
          onPress={onToggleCollapse}
          hitSlop={10}
          style={styles.chev}
        >
          <Text style={[styles.chevText, { color: theme.accent }]}>
            {collapsed ? '▸' : '▾'}
          </Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // paddingBottom (not marginBottom) so the gutter — which stretches to
    // row height — extends through the gap. The thick spine slice inside
    // the gutter therefore reaches the top of the first member row below
    // without a visible discontinuity.
    paddingBottom: 6,
  },
  gutter: {
    width: NODE_COLUMN_WIDTH,
    alignSelf: 'stretch',
    position: 'relative',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 1,
    marginInlineEnd: 12,
  },
  glyphDisc: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { color: '#fff', fontSize: 12, fontWeight: '800' },
  titleCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  range: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  chev: { paddingHorizontal: 4 },
  chevText: { fontSize: 14, fontWeight: '800' },
});
```

- [ ] **Step 2: Pass `spineCapTop` / `spineCapBottom` to `MomentHeader` from DayScreen**

In `src/components/journal/DayScreen.tsx`, find the `<MomentHeader ... />` call (around line 743). The current call doesn't pass cap props.

Replace the existing `<MomentHeader ... />` block (lines 743-754):

```tsx
                  <MomentHeader
                    moment={s.moment}
                    startsAt={s.startsAt}
                    endsAt={s.endsAt}
                    memberCount={s.members.length}
                    collapsed={collapsed}
                    onPress={() => {
                      if (inSelection) return;
                      setEditingMomentId(s.id);
                    }}
                    onToggleCollapse={() => toggleMomentCollapse(s.id)}
                  />
```

with:

```tsx
                  <MomentHeader
                    moment={s.moment}
                    startsAt={s.startsAt}
                    endsAt={s.endsAt}
                    memberCount={s.members.length}
                    collapsed={collapsed}
                    onPress={() => {
                      if (inSelection) return;
                      setEditingMomentId(s.id);
                    }}
                    onToggleCollapse={() => toggleMomentCollapse(s.id)}
                    spineCapTop={isFirstSection(sIdx)}
                    spineCapBottom={isLastSection(sIdx) && collapsed}
                  />
```

The pill is `capBottom` only when the moment is the last section AND collapsed (since when collapsed, the pill IS the last visible row; when expanded, the last member row is last).

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Manual verification**

Reload the dev client. Open the day with the Moment.
Expected:
- The thick spine slice now runs continuously through the pill row — visible above and below the pill.
- A short horizontal stub extends from the spine into the pill's left edge. The pill visibly "hangs off" the spine.
- The thickness transition at the top of the Moment (thin slice from solo row above → thick slice in pill row) is a clean step at the row boundary.
- The thickness transition at the bottom of the Moment (thick last member → thin slice below, if anything) is also clean.
- Collapse the moment. The pill should remain anchored to the spine. The spine should not extend below the pill if it's the last section.
- Expand again. Same continuity.

- [ ] **Step 5: Commit**

```bash
git add src/components/journal/MomentHeader.tsx src/components/journal/DayScreen.tsx
git commit -m "Anchor Moment pill to spine via thick slice + horizontal branch"
```

---

## Task 9: Visual polish — opacity, dot z-order, and end rounding

**Files:**
- Modify: `src/components/journal/SpineSlice.tsx`

After Tasks 1–8 the spine is structurally correct. This task tunes opacity and rounding to make it feel intentional.

Things to evaluate in the dev client side by side:
1. **Thin opacity** — current default `0.35`. Crank up to `0.5` if it reads too faint against the bg, or drop to `0.28` if too noisy. 0.35 is a starting point.
2. **Thick opacity** — current default `0.85`. The thick line is meant to assertively mark a Moment. If it reads too dark against the soft tint, drop to `0.7`.
3. **Round-cap visual** — `borderRadius: 1` on a 2px line gives a barely-visible round end. For the thick line (4px), use `borderRadius: 2` so the end-caps read as rounded, not square. Update the slice and branch styles to compute borderRadius from width.

The verification is "do the screenshots look better than the starting state". No unit test gates this.

- [ ] **Step 1: Round-cap from thickness; tune defaults**

In `src/components/journal/SpineSlice.tsx`, replace the constants block (lines 16-20 of the file written in Task 1):

```tsx
const THIN_WIDTH = 2;
const THICK_WIDTH = 4;
const THIN_OPACITY = 0.35;
const THICK_OPACITY = 0.85;
```

with:

```tsx
const THIN_WIDTH = 2;
const THICK_WIDTH = 4;
const THIN_OPACITY = 0.4;
const THICK_OPACITY = 0.75;
```

Replace the inline `borderRadius: 1` in `styles.base` and `styles.branch` (the StyleSheet block at the bottom of the file) with dynamic radii computed from the line dimension. Replace the styles block with:

```tsx
const styles = StyleSheet.create({
  base: {
    position: 'absolute',
  },
  branch: {
    position: 'absolute',
  },
});
```

Update the inline slice style (inside `SpineSlice`'s return) to include `borderRadius: width / 2`:

Find the `style={[ styles.base, { ... } ]}` block and add `borderRadius: width / 2` to the object, like so:

```tsx
      style={[
        styles.base,
        {
          insetInlineStart: inset,
          width,
          backgroundColor: theme.accent,
          opacity,
          borderRadius: width / 2,
          top: capTop ? dotCenterY : 0,
          ...(capBottom
            ? { height: dotCenterY - (capTop ? dotCenterY : 0) }
            : { bottom: 0 }),
        },
      ]}
```

Update the branch style similarly (add `borderRadius: height / 2`):

```tsx
      style={[
        styles.branch,
        {
          insetInlineStart: SPINE_CENTER,
          width: length,
          height,
          top: anchorY - Math.floor(height / 2),
          backgroundColor: theme.accent,
          opacity,
          borderRadius: height / 2,
        },
      ]}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Manual verification — compare with the starting state**

Reload the dev client. Open the same day used in earlier steps.
Expected:
- The thin spine should feel like a present-but-subtle backbone (not too loud).
- The thick spine over Moments should read clearly as a heavier accent without overwhelming the soft tint background.
- End-caps at the top of the first row and bottom of the last row are rounded, not flat.

If either opacity feels wrong, tweak `THIN_OPACITY` / `THICK_OPACITY` and re-verify. The plan numbers (0.4 / 0.75) are starting points; the visual judgment is the actual spec.

- [ ] **Step 4: Commit**

```bash
git add src/components/journal/SpineSlice.tsx
git commit -m "Tune spine opacities + round end-caps from line thickness"
```

---

## Task 10: Edge-case verification + final regression sweep

**Files:** None modified (verification only).

Verify the new spine handles every visual edge case in the journal. If any case looks wrong, file the fix as a follow-up — do not patch inline unless the breakage is trivial.

- [ ] **Step 1: Verify edge cases by navigating in the dev client**

For each case, take a screenshot and confirm the spine reads correctly. Use a day already containing the relevant content, or temporarily add/remove content via the FAB.

Cases:

1. **Empty day** — open a day with zero entries.
   Expected: the 3 stacked dots fade-out empty-state renders; no spine line visible (no rows to render slices).

2. **Single solo row** — day with exactly one expense, photo, or voice clip.
   Expected: just the dot. No line above or below — `capTop` and `capBottom` are both true → `SpineSlice` returns null.

3. **Multiple solo rows, no Moment** — day with 3+ solos, no Moments.
   Expected: thin line from the first dot center down to the last dot center, uninterrupted through the gaps between rows.

4. **Solo → Moment (expanded) → Solo** — typical case.
   Expected: thin slice → step up to thick at pill row → thick continues through members → step down to thin → continues to last solo's dot center.

5. **Day starts with a Moment** — first section is a Moment.
   Expected: thick slice with `capTop` truncated at pill center (no extension above the pill). Then continues to members below.

6. **Day ends with a Moment (expanded)** — last section is a Moment with members.
   Expected: thick slice continues through the last member; that last member has `capBottom` so the slice ends at its dot center.

7. **Day ends with a Moment (collapsed)** — last section is a Moment that's collapsed.
   Expected: thick slice continues into the pill row; pill has `capBottom` so the slice ends at pill center.

8. **Collapse and expand a Moment** — confirm the slice/branch behavior updates cleanly without leaving stray pixels.

9. **Selection mode** — start "Create Moment" selection mode from the FAB. Tap a row to toggle.
   Expected: check ring on the dot still works; spine still draws behind it.

10. **Drag mode** — long-press the dot of a row.
    Expected: drag activates as before (no regression). The dragged row's spine slice goes with it.

11. **RTL** — switch the app language to Hebrew (Settings → Language → עברית).
    Expected: spine mirrors to the right edge of the timeline. Dots align with the spine. Pill branch extends leftward (toward the pill on the right).

12. **Dark mode and light mode** — toggle theme.
    Expected: accent color from theme; the slice + branch both adopt the new theme accent without hardcoded values.

13. **Single-member Moment** — a Moment with exactly one member (rare; `buildDayTimeline` filters out zero-member moments, so 1 is the minimum). Confirm the thick slice connects the pill's center to the lone member's dot center cleanly. If this Moment is also the only section: pill has `capTop`, member has `capBottom`, slice spans `PILL_CENTER_Y` → member `dotCenterY` only.

14. **Day with only Moments (no solos)** — every section is a Moment. Confirm the spine is thick throughout and the first/last caps land on a pill (first) and a member or pill (last, depending on collapse).

15. **Two Moments back-to-back** — section[i] is a Moment and section[i+1] is also a Moment. Expect a visible spine gap of ≈22px between the bands (4px from band[i] `contentWrap.paddingBottom` + 10px from `band[i].marginBottom` + 8px from `band[i+1].contentWrap.paddingTop`). This is the same root cause as the band-tail limitation called out below, just larger. If this case appears in real data and looks bad, prioritize the band-tail follow-up.

16. **Splitting mode** — open a Moment's options sheet → tap Split → ✂ buttons appear between members. The vertical space taken by each split button has no spine slice (the slice belongs to rows, not to inter-row buttons). The break is plausibly intentional (signals "candidate split point"), but if it reads as a bug, the fix is to render a thick spine slice column behind each split button. Leave as-is for v1 and revisit if the visual is poor.

17. **Spread expense on multiple days** — an expense with `spreadStartDate`/`spreadEndDate` appears on every day in the range, including its own dedicated spine slice per day. Confirm it renders as a normal expense row on the spine on a non-`expenseDate` day with the MULTI-DAY badge intact.

- [ ] **Step 2: Run the type checker and unit tests for regression**

Run in parallel:

```bash
npx tsc --noEmit
npx jest src/utils/journalTimeline.test.ts
```

Expected:
- `tsc`: no new errors.
- `jest`: 13/13 tests pass (per the brief's `How to start` step 4).

- [ ] **Step 3: Final commit if you made any tweaks**

If you adjusted opacity or other tokens during Step 1's verification, commit the tweaks:

```bash
git add src/components/journal/SpineSlice.tsx
git commit -m "Final spine polish from edge-case review"
```

If no adjustments were needed, skip this step.

### Known v1 limitation

There's a residual gap in the spine at each Moment-band boundary:
- **~8px gap** above the first member (`MomentTintBand.contentWrap.paddingTop: 8`, between pill row's slice and first member's slice).
- **~14px gap** below the last member when another section follows (`contentWrap.paddingBottom: 4` + `band.marginBottom: 10`, between last member's slice and next section's slice).
- **~22px gap** if two Moments are back-to-back (case 15 in Step 1), since both ends compound.

Bridging cleanly requires head/tail spine slices that absolute-position past the band's bounds (a `bottom: -10` tail to spill into `marginBottom`, a `top: 0, height: 8` head inside `contentWrap`), plus a `hasNextSection` prop on `MomentTintBand` to omit the tail when the Moment is the last section. Not hard, but enough surface area (collapsed-vs-expanded interactions, RTL verification, opacity matching the per-row slices) to warrant a separate PR.

If Step 1 finds these gaps visually distracting — especially case 15 — open a follow-up issue titled `Bridge spine gaps across Moment band boundaries` rather than expanding this PR. If the gaps are invisible at production density, leave them.

---

## Done

The Day timeline spine is now:
- Composed of per-row slices owned by `SpineSlice` (no global absolute spine).
- Continuous through Moments (no bracket; thickness transitions handle the visual).
- Anchored to the Moment pill via a thick slice + horizontal branch stub.
- Capped cleanly at the first and last node (no stub above the first dot, no tail below the last).
- Aligned with all dots (no member indentation; dots sit on the spine x).

Open the PR when ready. Suggested title: `Restructure Day timeline spine: per-row slices, one continuous line`.
