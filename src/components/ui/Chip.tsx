import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityProps,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export interface ChipProps extends AccessibilityProps {
  label: string;
  icon?: IconName;
  onPress?: PressableProps['onPress'];
  // Visual modes:
  // - default: surface bg, hairline border, secondary text
  // - active: tinted background + colored border (use `tint` for color)
  // - dashed: dashed border, accent fg (CTA-shaped, e.g. "+ Invite")
  // - solid: full-color background, white label (active "All" chip)
  variant?: 'default' | 'active' | 'dashed' | 'solid';
  // When `active` or `solid`, the tint color used for fill/border. Default
  // is the accent. Pass a category color to scope a filter chip.
  tint?: string;
  tintSoft?: string;
  // Trailing count badge (e.g. "All · 47" rendered as label + count).
  count?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

// Pill chip. Used for filter chips, action chips, suggestion chips, and
// inline tags.
export function Chip({
  label,
  icon,
  onPress,
  variant = 'default',
  tint,
  tintSoft,
  count,
  testID,
  style,
  ...a11y
}: ChipProps) {
  const theme = useTheme();
  const accentFill = tint ?? theme.accent;
  const accentSoft = tintSoft ?? theme.accentSoft;
  const labelColor =
    variant === 'solid' ? '#FFFFFF'
    : variant === 'active' ? accentFill
    : variant === 'dashed' ? theme.accent
    : theme.textSecondary;
  const bg =
    variant === 'solid' ? accentFill
    : variant === 'active' ? accentSoft
    : 'transparent';
  const borderColor =
    variant === 'solid' ? 'transparent'
    : variant === 'active' ? accentFill
    : variant === 'dashed' ? theme.accent
    : theme.border;

  const inner = (
    <View style={styles.row}>
      {icon ? <Icon name={icon} size={13} color={labelColor} stroke={1.8} /> : null}
      <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
        {label}
        {count !== undefined ? ` · ${count}` : ''}
      </Text>
    </View>
  );

  const styleArr: StyleProp<ViewStyle> = [
    styles.base,
    {
      backgroundColor: bg,
      borderColor,
      borderWidth: variant === 'solid' ? 0 : borderWidth.hairline,
      borderStyle: variant === 'dashed' ? 'dashed' : 'solid',
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
        style={({ pressed }) => [styleArr, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View testID={testID} {...a11y} style={styleArr}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 7,
    borderRadius: sizing.radiusPill,
    alignSelf: 'flex-start',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 1 },
  label: { fontSize: 12, fontWeight: '600', lineHeight: 14 },
});
