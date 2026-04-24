import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StatsSectionCard } from '@/components/stats/StatsSectionCard';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Category } from '@/types/category';
import type { ExpenseWithPhotos } from '@/types/expense';
import { getCategorySoftColor } from '@/utils/categoryColor';
import { formatAmount } from '@/utils/currency';
import { formatDay } from '@/utils/date';
import { href } from '@/utils/nav';

interface Props {
  expenses: ExpenseWithPhotos[];
  categoriesById: Record<string, Category>;
  tripId: string;
  currency: string;
}

export function TopExpensesCard({ expenses, categoriesById, tripId, currency }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  if (expenses.length === 0) return null;

  return (
    <StatsSectionCard title={t('stats.topExpenses')}>
      <View style={styles.list}>
        {expenses.map((e) => {
          const cat = categoriesById[e.categoryId];
          const emoji = cat?.emoji ?? '•';
          const soft = cat ? getCategorySoftColor(cat.color, theme) : theme.accentSoft;
          const title = e.note?.trim() || e.placeName || cat?.name || '—';
          return (
            <Pressable
              key={e.id}
              onPress={() =>
                router.push(href(`/trip/${tripId}/expense/${e.id}`))
              }
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.icon, { backgroundColor: soft }]}>
                <Text style={styles.emoji}>{emoji}</Text>
              </View>
              <View style={styles.middle}>
                <Text
                  style={[styles.title, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
                <Text style={[styles.date, { color: theme.textMuted }]}>
                  {formatDay(e.expenseDate)}
                </Text>
              </View>
              <Text style={[styles.amount, { color: theme.text }]}>
                {formatAmount(e.convertedAmount, currency)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </StatsSectionCard>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
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
  emoji: { fontSize: 18 },
  middle: { flex: 1, gap: 2 },
  title: { ...typography.body, fontWeight: '600' },
  date: { ...typography.caption },
  amount: { ...typography.amountSmall },
});
