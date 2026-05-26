import {
  Pressable,
  StyleSheet,
  type AccessibilityProps,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { borderWidth, sizing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export interface IconButtonProps extends AccessibilityProps {
  name: IconName;
  onPress?: PressableProps['onPress'];
  size?: number; // outer container size
  iconSize?: number; // glyph size; defaults to ~50% of outer
  color?: string;
  // "outlined" = surface + 1px border (default header treatment)
  // "ghost" = transparent
  // "filled" = solid accent (settings sheet trigger, etc.)
  variant?: 'outlined' | 'ghost' | 'filled' | 'soft';
  stroke?: number;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

// 36×36 (default) icon-only button. Used in headers, list rows, modal
// trails, FAB-adjacent positions. Square with 12px corners — the brand
// `radiusIcon` token.
export function IconButton({
  name,
  onPress,
  size = sizing.headerButton,
  iconSize,
  color,
  variant = 'outlined',
  stroke = 1.8,
  disabled,
  testID,
  style,
  ...a11y
}: IconButtonProps) {
  const theme = useTheme();
  const glyph = iconSize ?? Math.round(size * 0.45);
  const glyphColor =
    color ?? (variant === 'filled' ? '#FFFFFF' : variant === 'soft' ? theme.accent : theme.textSecondary);
  const bg =
    variant === 'filled' ? theme.accent
    : variant === 'soft' ? theme.accentSoft
    : variant === 'ghost' ? 'transparent'
    : 'transparent';
  const borderColor =
    variant === 'outlined' ? theme.border : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      {...a11y}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: sizing.headerButtonRadius,
          backgroundColor: bg,
          borderColor,
          borderWidth: variant === 'outlined' ? borderWidth.hairline : 0,
          opacity: disabled ? 0.4 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
        style,
      ]}
    >
      <Icon name={name} size={glyph} color={glyphColor} stroke={stroke} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
