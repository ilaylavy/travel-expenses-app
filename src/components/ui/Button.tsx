import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
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

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends AccessibilityProps {
  label: string;
  onPress?: PressableProps['onPress'];
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  fullWidth?: boolean;
  // Use the brand FAB gradient on the primary variant (login CTA, FAB,
  // first-time hero CTAs). Default false — most primaries are flat accent.
  gradient?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// Primary action button. Three sizes, four variants. Use the `gradient`
// flag for the brand-moment CTAs (login, sign up, first-time hero, FAB).
// Default primary is flat indigo — the design system reserves gradients
// for brand surfaces only.
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  leadingIcon,
  trailingIcon,
  fullWidth = true,
  gradient = false,
  style,
  testID,
  ...a11y
}: ButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';
  const isDestructive = variant === 'destructive';
  const sizeStyle = SIZE_STYLES[size];
  const labelColor =
    variant === 'ghost' ? theme.accent
    : isDestructive ? theme.red
    : variant === 'secondary' ? theme.text
    : '#FFFFFF';
  const bg =
    variant === 'ghost' ? 'transparent'
    : isDestructive ? 'transparent'
    : variant === 'secondary' ? theme.surface
    : theme.accent;
  const borderColor =
    isDestructive ? theme.red
    : variant === 'secondary' ? theme.border
    : variant === 'ghost' ? 'transparent'
    : 'transparent';

  const inner = (
    <View style={[styles.row, { gap: sizeStyle.gap }]}>
      {loading ? (
        <ActivityIndicator color={labelColor} size="small" />
      ) : (
        <>
          {leadingIcon ? <Icon name={leadingIcon} size={sizeStyle.iconSize} color={labelColor} stroke={2.2} /> : null}
          <Text
            style={[
              styles.label,
              {
                color: labelColor,
                fontSize: sizeStyle.fontSize,
                letterSpacing: sizeStyle.letterSpacing,
              },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {trailingIcon ? <Icon name={trailingIcon} size={sizeStyle.iconSize} color={labelColor} stroke={2.2} /> : null}
        </>
      )}
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      {...a11y}
      style={({ pressed }) => [
        styles.base,
        {
          height: sizeStyle.height,
          paddingHorizontal: sizeStyle.paddingX,
          borderRadius: sizing.radiusButton,
          borderWidth: variant === 'secondary' || isDestructive ? borderWidth.hairline : 0,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.4 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          backgroundColor: isPrimary && gradient ? 'transparent' : bg,
          borderColor,
          // Accent glow only on solid primary, not gradient (gradient owns
          // its own shadow), not on secondary/ghost/destructive.
          shadowColor: isPrimary && !gradient ? theme.accent : undefined,
          shadowOpacity: isPrimary && !gradient ? 0.2 : 0,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: isPrimary && !gradient ? 4 : 0,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {isPrimary && gradient && !disabled ? (
        <LinearGradient
          colors={theme.fabGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {inner}
    </Pressable>
  );
}

interface SizeStyle {
  height: number;
  paddingX: number;
  fontSize: number;
  letterSpacing: number;
  iconSize: number;
  gap: number;
}

const SIZE_STYLES: Record<ButtonSize, SizeStyle> = {
  sm: { height: 36, paddingX: spacing.md, fontSize: 13, letterSpacing: 0.1, iconSize: 14, gap: spacing.xs + 2 },
  md: { height: 44, paddingX: spacing.lg, fontSize: 14, letterSpacing: 0.1, iconSize: 16, gap: spacing.sm },
  lg: { height: 52, paddingX: spacing.lg, fontSize: 15, letterSpacing: 0.1, iconSize: 18, gap: spacing.sm },
};

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '700' },
});
