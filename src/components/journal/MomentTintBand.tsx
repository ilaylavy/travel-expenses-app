// Wrapper around a Moment's member rows. Adds:
//   - A soft accent tint behind the rows (≈5% accent fill) so they read as
//     a single unit visually.
//   - A thicker, more saturated bracket on the spine column for the
//     Moment's vertical span — visually "swallowing" the thin outer spine.
//
// Lesson #5: position the bracket using the SAME SPINE_X constant the
// outer TimelineSpine uses, NOT a literal pixel value, so the bracket
// overlaps the outer spine exactly. Adding paddingHorizontal to this
// wrapper would silently offset the bracket — don't.

import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

import { SPINE_X } from './TimelineSpine';

const BRACKET_THICKNESS = 4;

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
      {/* Bracket — same x as the outer spine, ~2x thicker, full accent
          opacity. Sits in front of the tint but behind interactive content
          via pointerEvents=none. */}
      <View
        pointerEvents="none"
        style={[
          styles.bracket,
          {
            backgroundColor: theme.accent,
            insetInlineStart: SPINE_X - 1,
            width: BRACKET_THICKNESS,
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
  bracket: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 2,
    opacity: 0.9,
  },
  contentWrap: {
    paddingTop: 8,
    paddingBottom: 4,
  },
});
