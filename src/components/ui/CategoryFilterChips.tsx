import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { CategoryIcon } from '@/components/CategoryIcon';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Category } from '@/types/category';
import {
  getCategoryColor,
  getCategoryDisplayName,
  getCategoryIconName,
  getCategorySoftColor,
} from '@/utils/category';

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
  const { t } = useTranslation();
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
        accessibilityRole="button"
        accessibilityState={{ selected: allActive }}
        style={[
          ...chipBase,
          {
            backgroundColor: allActive ? theme.accent : 'transparent',
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
        const iconName = getCategoryIconName(c);
        return (
          <Pressable
            key={c.id}
            onPress={() => onToggle(c.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              ...chipBase,
              {
                backgroundColor: active ? soft : 'transparent',
                borderColor: active ? color : theme.border,
              },
            ]}
          >
            {iconName ? (
              <Icon name={iconName} size={13} color={active ? color : theme.textSecondary} stroke={1.8} />
            ) : (
              // User-custom category — preserve the emoji it was saved with.
              <View style={styles.glyphWrap}>
                <CategoryIcon category={c} size={16} withContainer={false} />
              </View>
            )}
            <Text
              style={[
                styles.text,
                { color: active ? color : theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {getCategoryDisplayName(c, t)}
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
    gap: spacing.xs + 1,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 7,
    borderRadius: sizing.radiusPill,
    borderWidth: borderWidth.hairline,
  },
  chipElevated: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  glyphWrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 12, fontWeight: '600', maxWidth: 120 },
});
