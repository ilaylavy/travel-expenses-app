import { Pressable, StyleSheet, Text, View } from 'react-native';

import { sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { Category } from '@/types/category';
import { getCategoryColor, getCategorySoftColor } from '@/utils/categoryColor';

interface CategoryGridProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
  onAddPress?: () => void;
  addLabel?: string;
  columns?: number;
}

export function CategoryGrid({
  categories,
  selectedId,
  onSelect,
  onAddPress,
  addLabel,
  columns = 4,
}: CategoryGridProps) {
  const theme = useTheme();
  const items: Array<
    { kind: 'category'; category: Category } | { kind: 'add' }
  > = categories.map((category) => ({ kind: 'category' as const, category }));
  if (onAddPress) items.push({ kind: 'add' });

  const cellStyle = [styles.cell, { flexBasis: `${100 / columns}%` as const }];

  return (
    <View style={styles.grid}>
      {items.map((item, index) => {
        if (item.kind === 'add') {
          return (
            <View key="add" style={cellStyle}>
              <Pressable
                onPress={onAddPress}
                style={({ pressed }) => [
                  styles.inner,
                  styles.add,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[styles.addIcon, { color: theme.accent }]}>＋</Text>
                {addLabel && (
                  <Text
                    style={[styles.addLabel, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {addLabel}
                  </Text>
                )}
              </Pressable>
            </View>
          );
        }
        const { category } = item;
        const selected = category.id === selectedId;
        const color = getCategoryColor(category.color, theme);
        const soft = getCategorySoftColor(category.color, theme);
        return (
          <View key={category.id} style={cellStyle}>
            <Pressable
              onPress={() => onSelect(category.id)}
              style={({ pressed }) => [
                styles.inner,
                {
                  backgroundColor: selected ? soft : theme.surface,
                  borderColor: selected ? color : theme.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={styles.emoji}>{category.emoji}</Text>
              <Text
                style={[styles.name, { color: selected ? color : theme.text }]}
                numberOfLines={1}
              >
                {category.name}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs / 2 },
  cell: { padding: spacing.xs / 2 },
  inner: {
    borderRadius: sizing.radiusButton,
    borderWidth: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 64,
  },
  emoji: { fontSize: 24, lineHeight: 28 },
  name: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  add: { borderStyle: 'dashed' },
  addIcon: { fontSize: 22, fontWeight: '700', lineHeight: 24 },
  addLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
});
