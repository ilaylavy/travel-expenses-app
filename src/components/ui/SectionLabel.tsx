import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export interface SectionLabelProps {
  children: string;
  // Optional inline count chip (e.g. "Owes you · 2").
  count?: number;
  // Decorative dot before the label (e.g. green dot for "Owes you").
  dotColor?: string;
  // Trailing slot — typically an action chip ("Edit", "Manage").
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

// All-caps section divider used between major card groups. Matches the
// design system's `.section-h` token: micro type, accent dot, optional
// count bubble.
export function SectionLabel({ children, count, dotColor, trailing, style }: SectionLabelProps) {
  const theme = useTheme();
  return (
    <View style={[styles.row, style]}>
      <View style={styles.left}>
        {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
        <Text style={[styles.label, { color: theme.textSecondary }]}>{children.toUpperCase()}</Text>
        {typeof count === 'number' ? (
          <View style={[styles.count, { backgroundColor: theme.bgSoft, borderColor: theme.border }]}>
            <Text style={[styles.countText, { color: theme.textMuted }]}>{count}</Text>
          </View>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm + 2,
    gap: spacing.sm,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 999 },
  label: { ...typography.micro, letterSpacing: 0.5 },
  count: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: sizing.radiusPill,
    borderWidth: 1,
  },
  countText: { fontSize: 10, fontWeight: '700', lineHeight: 12, fontVariant: ['tabular-nums'] },
});
