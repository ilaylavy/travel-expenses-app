import { StyleSheet, Text, View } from 'react-native';

import { StatsSectionCard } from '@/components/stats/StatsSectionCard';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Category } from '@/types/category';
import { getCategoryColor, getCategorySoftColor } from '@/utils/categoryColor';
import { formatAmount } from '@/utils/currency';
import type { CategoryTotal } from '@/utils/statsAggregations';

interface Props {
  byCategory: CategoryTotal[];
  categoriesById: Record<string, Category>;
  currency: string;
}

export function CategoryBreakdownCard({ byCategory, categoriesById, currency }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (byCategory.length === 0) return null;

  return (
    <StatsSectionCard title={t('stats.categoryBreakdown')}>
      <View style={[styles.bar, { backgroundColor: theme.bgSoft }]}>
        {byCategory.map((c) => {
          const cat = categoriesById[c.categoryId];
          const color = cat ? getCategoryColor(cat.color, theme) : theme.accent;
          return (
            <View
              key={c.categoryId}
              style={{ flex: Math.abs(c.total), backgroundColor: color }}
            />
          );
        })}
      </View>

      <View style={styles.list}>
        {byCategory.map((c) => {
          const cat = categoriesById[c.categoryId];
          const color = cat ? getCategoryColor(cat.color, theme) : theme.accent;
          const soft = cat ? getCategorySoftColor(cat.color, theme) : theme.accentSoft;
          const name = cat?.name ?? t('stats.otherCategory');
          const emoji = cat?.emoji ?? '•';
          return (
            <View key={c.categoryId} style={styles.row}>
              <View style={[styles.icon, { backgroundColor: soft }]}>
                <Text style={styles.iconEmoji}>{emoji}</Text>
              </View>
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[styles.amount, { color: theme.text }]}>
                {formatAmount(c.total, currency)}
              </Text>
              <Text style={[styles.percent, { color }]}>{Math.round(c.percent)}%</Text>
            </View>
          );
        })}
      </View>
    </StatsSectionCard>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: sizing.categoryIconSmall,
    height: sizing.categoryIconSmall,
    borderRadius: sizing.radiusIcon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: { fontSize: 18 },
  name: { ...typography.body, flex: 1 },
  amount: { ...typography.amountSmall },
  percent: { ...typography.micro, minWidth: 42, textAlign: 'right' },
});
