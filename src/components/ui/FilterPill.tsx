import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
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
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: active ? theme.accentSoft : 'transparent',
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
        {text}
      </Text>
      <Icon
        name="chevron-down"
        size={11}
        color={active ? theme.accent : theme.textMuted}
        stroke={2}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 7,
    borderRadius: sizing.radiusPill,
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
