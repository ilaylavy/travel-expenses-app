import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export interface ScreenHeaderProps {
  // Center title — sentence case, weight 700.
  title?: string;
  // Optional small subtitle below the title.
  subtitle?: string;
  // Left button. Defaults to a back-chevron when `onBack` is provided.
  onBack?: () => void;
  // Drop the back button entirely (root screens). Default false.
  hideBack?: boolean;
  // Leading slot (replaces the back button). Use for non-back leading icons.
  leading?: React.ReactNode;
  // Trailing slot — typically 1-3 IconButtons.
  trailing?: React.ReactNode;
  // When passed, the leading slot becomes a tinted avatar + title row
  // (used on the Trip dashboard / map / ask headers).
  leadingNode?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

// Compact header — leading slot, centered title (or left-aligned when a
// leading node is present), trailing slot. Used by every modal and
// stack screen.
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  hideBack,
  leading,
  trailing,
  leadingNode,
  style,
}: ScreenHeaderProps) {
  const theme = useTheme();
  const showBack = !hideBack && onBack;
  return (
    <View style={[styles.row, style]}>
      <View style={styles.side}>
        {leading ?? (showBack ? (
          <IconButton name="chevron-left" onPress={onBack} accessibilityLabel="Back" iconSize={18} />
        ) : null)}
      </View>

      <View style={[styles.center, leadingNode ? styles.centerLeft : null]}>
        {leadingNode ? (
          <View style={styles.leadingRow}>
            {leadingNode}
            <View style={styles.titleStack}>
              {title ? (
                <Text style={[styles.titleSmall, { color: theme.text }]} numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text style={[styles.subtitle, { color: theme.textMuted }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.titleStack}>
            {title ? (
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text style={[styles.subtitle, { color: theme.textMuted }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        )}
      </View>

      <View style={[styles.side, styles.sideEnd]}>{trailing}</View>
    </View>
  );
}

// Convenience: title that wraps a category-tinted avatar / chip. The
// header's leading node uses this internally — exporting so screens
// can reuse the same layout in custom headers.
export function HeaderSparkle({ color }: { color?: string }) {
  return <Icon name="sparkles" size={18} color={color} stroke={2} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    minHeight: 56,
  },
  side: { minWidth: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sideEnd: { justifyContent: 'flex-end' },
  center: { flex: 1, alignItems: 'center' },
  centerLeft: { alignItems: 'flex-start' },
  titleStack: { alignItems: 'center', justifyContent: 'center' },
  leadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.itemTitle, letterSpacing: -0.3 },
  titleSmall: { ...typography.itemTitle, fontSize: 16 },
  subtitle: { ...typography.caption, marginTop: 2 },
});
