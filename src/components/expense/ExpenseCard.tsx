import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Category } from '@/types/category';
import type { ExpenseWithPhotos } from '@/types/expense';
import { getCategoryColor, getCategorySoftColor } from '@/utils/categoryColor';
import { formatAmount } from '@/utils/currency';

interface ExpenseCardProps {
  expense: ExpenseWithPhotos;
  category: Category | null;
  homeCurrency: string;
  onPress?: () => void;
}

function ExpenseCardInner({ expense, category, homeCurrency, onPress }: ExpenseCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const color = category ? getCategoryColor(category.color, theme) : theme.accent;
  const softColor = category ? getCategorySoftColor(category.color, theme) : theme.accentSoft;

  const showConverted = expense.currency !== homeCurrency;
  const primary = formatAmount(expense.amount, expense.currency);
  const secondary = showConverted
    ? formatAmount(expense.convertedAmount, homeCurrency)
    : null;

  const title = expense.note?.trim() || category?.name || '—';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.borderLight,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: softColor }]}>
        <Text style={styles.emoji}>{category?.emoji ?? '•'}</Text>
      </View>

      <View style={styles.middle}>
        <Text
          style={[
            styles.title,
            { color: theme.text },
            expense.isExcludedFromDailyMetrics && { color: theme.textMuted },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <View style={styles.metaRow}>
          {expense.placeName ? (
            <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
              {expense.placeName}
            </Text>
          ) : null}
          {expense.paymentMethod ? (
            <View style={[styles.badge, { backgroundColor: theme.bgSoft }]}>
              <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
                {paymentLabel(expense.paymentMethod)}
              </Text>
            </View>
          ) : null}
          {expense.photos.length > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.bgSoft }]}>
              <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
                📎 {expense.photos.length}
              </Text>
            </View>
          ) : null}
          {expense.isRefund ? (
            <View style={[styles.badge, { backgroundColor: theme.greenSoft }]}>
              <Text style={[styles.badgeText, { color: theme.green }]}>
                {t('expenseDetail.badgeRefund')}
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
          {expense.isExcludedFromDailyMetrics ? (
            <View style={[styles.badge, { backgroundColor: theme.bgSoft }]}>
              <Text style={[styles.badgeText, { color: theme.textMuted }]}>
                {t('expenseDetail.badgeExcluded')}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.right}>
        <Text
          style={[
            styles.amount,
            { color: expense.isRefund ? theme.green : theme.text },
          ]}
          numberOfLines={1}
        >
          {expense.isRefund ? '+' : ''}
          {primary}
        </Text>
        {secondary ? (
          <Text style={[styles.amountSecondary, { color: theme.textMuted }]} numberOfLines={1}>
            ≈ {secondary}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function paymentLabel(method: string): string {
  if (method === 'cash') return '💵 Cash';
  if (method === 'credit') return '💳 Credit';
  if (method === 'debit') return '💳 Debit';
  return method;
}

export const ExpenseCard = memo(ExpenseCardInner);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: sizing.radiusCardInner,
    borderWidth: 1,
  },
  icon: {
    width: sizing.categoryIconMedium,
    height: sizing.categoryIconMedium,
    borderRadius: sizing.radiusIcon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 20 },
  middle: { flex: 1, minWidth: 0, gap: 4 },
  title: { ...typography.itemTitle },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  meta: { ...typography.secondary },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: sizing.radiusChip,
  },
  badgeText: { ...typography.micro },
  right: { alignItems: 'flex-end', gap: 2 },
  amount: { ...typography.amountSmall },
  amountSecondary: { ...typography.caption },
});
