import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export type ErrorBannerTone = 'error' | 'warning';

interface ErrorBannerProps {
  message: string;
  tone?: ErrorBannerTone;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

// Compact inline banner for error and warning states (offline, save failed,
// validation errors). Tinted background, matching foreground text, leading
// icon. Used in form headers and the top of failing screens.
export function ErrorBanner({ message, tone = 'error', icon, style }: ErrorBannerProps) {
  const theme = useTheme();
  const palette =
    tone === 'warning'
      ? { bg: theme.orangeSoft, fg: theme.orange }
      : { bg: theme.redSoft, fg: theme.red };
  const iconName: IconName = icon ?? (tone === 'warning' ? 'exclude' : 'exclude');

  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }, style]}>
      <Icon name={iconName} size={16} color={palette.fg} stroke={2} />
      <Text style={[styles.text, { color: palette.fg }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    borderRadius: sizing.radiusInput,
  },
  text: { ...typography.secondary, fontWeight: '600', flex: 1 },
});
