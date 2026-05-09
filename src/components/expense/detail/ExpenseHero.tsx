import { StyleSheet, Text, View } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Category } from '@/types/category';
import type { ExpenseSplit, ExpenseWithPhotos } from '@/types/expense';
import type { Trip } from '@/types/trip';
import {
  getCategoryColor,
  getCategoryDisplayName,
  getCategorySoftColor,
} from '@/utils/category';
import { formatAmount } from '@/utils/currency';

export function ExpenseHero({
  expense,
  trip,
  category,
  userSplit,
}: {
  expense: ExpenseWithPhotos;
  trip: Trip;
  category: Category | null;
  userSplit: ExpenseSplit | null;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  const color = category ? getCategoryColor(category.color, theme) : theme.accent;
  const softColor = category
    ? getCategorySoftColor(category.color, theme)
    : theme.accentSoft;

  const showConverted = expense.currency !== trip.homeCurrency;
  // For split expenses where the user has a share row, the hero shows the
  // user's share (matches the expense list). The full amount is still
  // visible in the Split section as "Total: ...".
  const heroAmountValue =
    expense.isSplit && userSplit ? userSplit.amount : expense.amount;
  const heroConvertedValue =
    expense.isSplit && userSplit && expense.amount !== 0
      ? expense.convertedAmount * (userSplit.amount / expense.amount)
      : expense.convertedAmount;
  const primaryAmount = formatAmount(Math.abs(heroAmountValue), expense.currency);
  const convertedAmount = formatAmount(
    Math.abs(heroConvertedValue),
    trip.homeCurrency,
  );

  return (
    <View
      style={[
        styles.hero,
        { backgroundColor: theme.surface, borderColor: theme.borderLight },
      ]}
    >
      <View style={[styles.categoryIcon, { backgroundColor: softColor }]}>
        <Text style={styles.categoryEmoji}>{category?.emoji ?? '•'}</Text>
      </View>
      {category ? (
        <Text style={[styles.categoryName, { color }]}>
          {getCategoryDisplayName(category, t)}
        </Text>
      ) : null}
      <Text
        style={[
          styles.amount,
          { color: expense.isRefund ? theme.green : theme.text },
        ]}
      >
        {expense.isRefund ? '+' : ''}
        {primaryAmount}
      </Text>
      {showConverted ? (
        <Text style={[styles.amountConverted, { color: theme.textMuted }]}>
          ≈ {convertedAmount}
        </Text>
      ) : null}
      <View style={styles.badgeRow}>
        {expense.isRefund ? (
          <View style={[styles.badge, { backgroundColor: theme.greenSoft }]}>
            <Text style={[styles.badgeText, { color: theme.green }]}>
              {t('expenseDetail.badgeRefund')}
            </Text>
          </View>
        ) : null}
        {expense.isExcludedFromDailyMetrics ? (
          <View style={[styles.badge, { backgroundColor: theme.bgSoft }]}>
            <Text style={[styles.badgeText, { color: theme.textMuted }]}>
              {t('expenseDetail.badgeExcluded')}
            </Text>
          </View>
        ) : null}
        {expense.spreadStartDate && expense.spreadEndDate ? (
          <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.badgeText, { color: theme.accent }]}>
              {t('expenseDetail.badgeMultiDay')}
            </Text>
          </View>
        ) : null}
        {expense.isPrivate ? (
          <View style={[styles.badge, { backgroundColor: theme.bgSoft }]}>
            <Text style={[styles.badgeText, { color: theme.textMuted }]}>
              🔒 {t('expense.privateBadge')}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: sizing.radiusCard,
    borderWidth: 1,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryIcon: {
    width: sizing.categoryIconLarge,
    height: sizing.categoryIconLarge,
    borderRadius: sizing.radiusIcon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: { fontSize: 24 },
  categoryName: { ...typography.subtitle, letterSpacing: 0.3 },
  amount: { ...typography.amountLarge, marginTop: spacing.xs },
  amountConverted: { ...typography.subtitle },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: sizing.radiusChip,
  },
  badgeText: { ...typography.micro },
});
