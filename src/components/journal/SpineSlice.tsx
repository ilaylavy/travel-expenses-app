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

import { DOT_CENTER_Y, NODE_COLUMN_WIDTH } from './SpineNode';

export const SPINE_CENTER = Math.round(NODE_COLUMN_WIDTH / 2); // 32

const THIN_WIDTH = 2;
const THICK_WIDTH = 4;
const THIN_OPACITY = 0.4;
const THICK_OPACITY = 0.75;

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
  dotCenterY = DOT_CENTER_Y,
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
        styles.bar,
        {
          insetInlineStart: inset,
          width,
          backgroundColor: theme.accent,
          opacity,
          borderRadius: width / 2,
          top: capTop ? dotCenterY : 0,
          ...(capBottom ? { height: dotCenterY } : { bottom: 0 }),
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
        styles.bar,
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
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
  },
});
