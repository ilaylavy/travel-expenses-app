import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

export type StatsPeriod = '7d' | '30d' | 'trip';

interface PeriodSelectorProps {
  value: StatsPeriod;
  onChange: (next: StatsPeriod) => void;
}

interface Segment {
  id: StatsPeriod;
  labelKey: string;
}

const SEGMENTS: Segment[] = [
  { id: '7d', labelKey: 'stats.periodLast7' },
  { id: '30d', labelKey: 'stats.periodLast30' },
  { id: 'trip', labelKey: 'stats.periodTrip' },
];

// Three-segment selector that scopes the Stats screen's period-sensitive
// stats (total, daily avg, by-category, by-day, top expenses). The budget
// block stays trip-wide regardless.
export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.shell,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {SEGMENTS.map((s) => {
        const active = s.id === value;
        return (
          <Pressable
            key={s.id}
            onPress={() => onChange(s.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.segment,
              active && { backgroundColor: theme.accent },
              { transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: active ? '#FFFFFF' : theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {t(s.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: sizing.radiusInput,
    borderWidth: borderWidth.hairline,
    marginBottom: spacing.md,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: spacing.md - 2,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.1 },
});
