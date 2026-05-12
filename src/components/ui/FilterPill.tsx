import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

interface FilterPillProps {
  label: string;
  summary: string;
  active: boolean;
  onPress: () => void;
  // When provided and > 0, a small accent dot with the count appears
  // next to the label so active filters scan instantly.
  activeCount?: number;
}

export function FilterPill({ label, summary, active, onPress, activeCount }: FilterPillProps) {
  const theme = useTheme();
  // When active, the summary already carries the meaningful state — drop
  // the redundant "Category: " prefix. When inactive, summary is "All …"
  // which is also redundant with the label, so show the label alone.
  const text = active ? summary : label;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: active ? theme.accentSoft : theme.surface,
          borderColor: active ? theme.accent : theme.border,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      {active && activeCount && activeCount > 0 ? (
        <View style={[styles.dot, { backgroundColor: theme.accent }]}>
          <Text style={styles.dotText}>{activeCount}</Text>
        </View>
      ) : null}
      <Text
        style={[
          styles.pillText,
          { color: active ? theme.accent : theme.textSecondary },
        ]}
        numberOfLines={1}
      >
        {text} ▾
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // 12/7 padding is intentional compact-pill geometry; tighter than spacing.md.
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: sizing.radiusChip,
    borderWidth: borderWidth.hairline,
  },
  pillText: { fontSize: 12, fontWeight: '600', maxWidth: 200 },
  dot: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: sizing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
});
