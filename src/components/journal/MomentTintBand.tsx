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
