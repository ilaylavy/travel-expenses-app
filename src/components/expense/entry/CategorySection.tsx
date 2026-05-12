import { Pressable, StyleSheet, Text } from 'react-native';

import { CategoryGrid } from '@/components/expense/category/CategoryGrid';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Category } from '@/types/category';

import { Section } from './Section';

export function CategorySection({
  visibleCategories,
  selectedId,
  onSelect,
  hasMore,
  expanded,
  onToggleExpanded,
}: {
  visibleCategories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  hasMore: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Section title={t('expense.categorySection')}>
      <CategoryGrid
        categories={visibleCategories}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      {hasMore ? (
        <Pressable
          onPress={onToggleExpanded}
          style={({ pressed }) => [
            styles.categoryMoreButton,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          <Text style={[styles.categoryMoreText, { color: theme.accent }]}>
            {expanded
              ? t('expense.categoryShowLess')
              : t('expense.categoryShowMore')}
          </Text>
        </Pressable>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  categoryMoreButton: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    marginTop: spacing.xs,
  },
  categoryMoreText: { ...typography.micro, fontWeight: '700' },
});
