import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { Category } from '@/types/category';
import { getCategoryColor, getCategorySoftColor } from '@/utils/categoryColor';

interface CategoryFilterChipsProps {
  categories: Category[];
  selectedIds: Set<string>;
  onToggle: (categoryId: string) => void;
  onClear: () => void;
  allLabel: string;
  // When true, adds a drop shadow so the chips read as floating over a map.
  elevated?: boolean;
}

export function CategoryFilterChips({
  categories,
  selectedIds,
  onToggle,
  onClear,
  allLabel,
  elevated = false,
}: CategoryFilterChipsProps) {
  const theme = useTheme();
  const allActive = selectedIds.size === 0;
  const chipBase = [styles.chip, elevated && styles.chipElevated];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.container}
    >
      <Pressable
        onPress={onClear}
        style={[
          ...chipBase,
          {
            backgroundColor: allActive ? theme.accent : theme.surface,
            borderColor: allActive ? theme.accent : theme.border,
          },
        ]}
      >
        <Text
          style={[
            styles.text,
            { color: allActive ? '#FFFFFF' : theme.textSecondary },
          ]}
        >
          {allLabel}
        </Text>
      </Pressable>
      {categories.map((c) => {
        const active = selectedIds.has(c.id);
        const color = getCategoryColor(c.color, theme);
        const soft = getCategorySoftColor(c.color, theme);
        return (
          <Pressable
            key={c.id}
            onPress={() => onToggle(c.id)}
            style={[
              ...chipBase,
              {
                backgroundColor: active ? soft : theme.surface,
                borderColor: active ? color : theme.border,
              },
            ]}
          >
            <Text style={styles.emoji}>{c.emoji}</Text>
            <Text
              style={[
                styles.text,
                { color: active ? color : theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {c.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 0 },
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: sizing.radiusChip,
    borderWidth: 1.5,
  },
  chipElevated: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  emoji: { fontSize: 14 },
  text: { fontSize: 13, fontWeight: '700', maxWidth: 120 },
});
