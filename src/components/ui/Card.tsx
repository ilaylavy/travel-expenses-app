import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type Padding = 'none' | 'sm' | 'md' | 'lg';

const PADDING: Record<Padding, number> = {
  none: 0,
  sm: spacing.md,
  md: spacing.lg,
  lg: spacing.xl,
};

export interface CardProps extends AccessibilityProps {
  children: React.ReactNode;
  // Outer card radius. Defaults to brand outer (22px).
  radius?: number;
  // Inner contents are also rounded — switch on for nested cards.
  inner?: boolean;
  padding?: Padding;
  // Surface depth — `surface` is the standard card; `bgSoft` is the
  // quieter inner-card treatment (used inside other cards).
  tone?: 'surface' | 'bgSoft' | 'surfaceRaised';
  // Hide the 1px border. Default: borders on.
  borderless?: boolean;
  // Optional accent treatment: when "accent", border + soft fill use the
  // accent. When "success" / "danger" the equivalent semantic color.
  accent?: 'accent' | 'success' | 'danger' | null;
  onPress?: PressableProps['onPress'];
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

// The brand card — 22px outer radius (or 18px when inner), 1px low-contrast
// border, surface background. The most-used container in the app. When
// `onPress` is provided the card becomes a Pressable with a scale press
// animation.
export function Card({
  children,
  radius,
  inner = false,
  padding = 'md',
  tone = 'surface',
  borderless = false,
  accent = null,
  onPress,
  testID,
  style,
  ...a11y
}: CardProps) {
  const theme = useTheme();
  const bg =
    tone === 'bgSoft' ? theme.bgSoft
    : tone === 'surfaceRaised' ? theme.surfaceRaised
    : theme.surface;
  const accentColor =
    accent === 'accent' ? theme.accent
    : accent === 'success' ? theme.green
    : accent === 'danger' ? theme.red
    : null;
  const accentSoft =
    accent === 'accent' ? theme.accentSoft
    : accent === 'success' ? theme.greenSoft
    : accent === 'danger' ? theme.redSoft
    : null;

  const cardStyle: StyleProp<ViewStyle> = [
    {
      backgroundColor: accentSoft ?? bg,
      borderRadius: radius ?? (inner ? sizing.radiusCardInner : sizing.radiusCard),
      borderWidth: borderless ? 0 : borderWidth.hairline,
      borderColor: accentColor ?? theme.border,
      padding: PADDING[padding],
    },
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        testID={testID}
        accessibilityRole="button"
        {...a11y}
        style={({ pressed }) => [
          cardStyle,
          { transform: [{ scale: pressed ? 0.99 : 1 }] },
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} {...a11y} style={cardStyle}>
      {children}
    </View>
  );
}

export const cardStyles = StyleSheet.create({
  // Common interior content patterns reused by callers.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowBaseline: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
});
