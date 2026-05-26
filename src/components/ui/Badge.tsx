import {
  StyleSheet,
  Text,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export interface BadgeProps extends AccessibilityProps {
  label: string;
  icon?: IconName;
  // Visual tone — defaults to neutral (bg-soft + secondary text). Pass
  // semantic tones for status badges.
  tone?:
    | 'neutral'
    | 'accent'
    | 'success'
    | 'danger'
    | 'warning'
    | 'info'
    | 'transport'
    | 'split';
  // Optional explicit colors (overrides tone). Useful for category-tinted
  // badges where the color comes from the data.
  tint?: string;
  tintSoft?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// Inline tag pill — "Cash", "Refund", "+ Maya", "Excluded". Small (10px
// label, pill radius). Use sparingly inside row metadata. The design
// system reserves sentence case for badges — no all-caps.
export function Badge({ label, icon, tone = 'neutral', tint, tintSoft, style, testID, ...a11y }: BadgeProps) {
  const theme = useTheme();
  const [fg, bg] = tint && tintSoft
    ? [tint, tintSoft]
    : TONE_COLORS(theme)[tone];

  return (
    <View testID={testID} {...a11y} style={[styles.base, { backgroundColor: bg }, style]}>
      {icon ? <Icon name={icon} size={11} color={fg} stroke={2} /> : null}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function TONE_COLORS(theme: ReturnType<typeof useTheme>): Record<NonNullable<BadgeProps['tone']>, [string, string]> {
  return {
    neutral: [theme.textSecondary, theme.bgSoft],
    accent: [theme.accent, theme.accentSoft],
    success: [theme.green, theme.greenSoft],
    danger: [theme.red, theme.redSoft],
    warning: [theme.orange, theme.orangeSoft],
    info: [theme.blue, theme.blueSoft],
    transport: [theme.blue, theme.blueSoft],
    split: [theme.accent, theme.accentSoft],
  };
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: sizing.radiusPill,
    alignSelf: 'flex-start',
  },
  label: { fontSize: 10, fontWeight: '600', lineHeight: 12, letterSpacing: 0.2 },
});
