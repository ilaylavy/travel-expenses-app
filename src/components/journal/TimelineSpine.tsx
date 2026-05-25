// Vertical accent thread behind the spine-node column. Absolutely positioned
// inside the timeline container — the parent provides height via its
// position: 'relative' wrapper around the spine + the row column.
//
// Lesson #5: the spine is ONE line through the entire timeline (it runs
// behind Moment bands too). Don't draw a second inner spine inside a Moment.
// The Moment "bracket" sits on the SAME x-position as this spine and renders
// as a thicker, more saturated segment over the same vertical range.

import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

import { NODE_COLUMN_WIDTH } from './SpineNode';

interface Props {
  thickness?: number;
  opacity?: number;
}

// Half of the node column (32) - half of spine thickness (1). The result
// (31) puts the 2px-wide spine centered under the dot, which is also
// centered in the node column.
export const SPINE_X = Math.round(NODE_COLUMN_WIDTH / 2) - 1;

export function TimelineSpine({ thickness = 2, opacity = 0.28 }: Props) {
  const theme = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        styles.spine,
        {
          width: thickness,
          backgroundColor: theme.accent,
          opacity,
          insetInlineStart: SPINE_X,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  spine: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    borderRadius: 1,
  },
});
