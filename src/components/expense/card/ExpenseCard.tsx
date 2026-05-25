import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryIcon } from '@/components/CategoryIcon';
import { Icon } from '@/components/Icon';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Category } from '@/types/category';
import type { ExpenseWithPhotos } from '@/types/expense';
import { getCategoryDisplayName } from '@/utils/category';
import { formatAmount } from '@/utils/currency';

interface ExpenseCardProps {
  expense: ExpenseWithPhotos;
  category: Category | null;
  homeCurrency: string;
  onPress?: () => void;
  // In shared trips, the logger's display name. Omit on solo trips.
  loggedByName?: string | null;
  isSelfLogged?: boolean;
  // For split expenses, the current user's share. When provided, replaces
  // the full expense amount in the right-hand column. The full amount is
  // still visible in the expense detail screen.
  userShareAmount?: number;
  userShareConverted?: number;
  // When the card is shown inside a single-day context (e.g., the journal
  // day timeline) for a spread expense, callers can pass the pre-computed
  // per-day fraction. The card displays this as the primary amount instead
  // of the full expense total — so a €400 / 4-day hotel reads €100 on each
  // day it appears, with the MULTI-DAY badge clarifying the context.
  perDayAmount?: number;
  perDayConverted?: number;
}

function ExpenseCardInner({
  expense,
  category,
  homeCurrency,
  onPress,
  loggedByName,
  isSelfLogged,
  userShareAmount,
  userShareConverted,
  perDayAmount,
  perDayConverted,
}: ExpenseCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const showConverted = expense.currency !== homeCurrency;
  // Display priority: per-day amount (if provided and expense is spread)
  // > user's split share > full expense amount.
  const displayAmount = perDayAmount ?? userShareAmount ?? expense.amount;
  const displayConverted = perDayConverted ?? userShareConverted ?? expense.convertedAmount;
  const primary = formatAmount(displayAmount, expense.currency);
  const secondary = showConverted ? formatAmount(displayConverted, homeCurrency) : null;

  const title =
    expense.note?.trim() || (category ? getCategoryDisplayName(category, t) : '') || '—';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      {category ? (
        <CategoryIcon category={category} size={40} radius={sizing.radiusIcon} />
      ) : (
        // Defensive — shouldn't happen since rows always have a category
        <View style={[styles.iconFallback, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
          <Icon name="other" size={20} color={theme.accent} stroke={1.8} />
        </View>
      )}

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
            <View style={[styles.badge, styles.badgeRow, { backgroundColor: theme.bgSoft }]}>
              <Icon
                name={expense.paymentMethod === 'cash' ? 'cash' : 'card'}
                size={11}
                color={theme.textSecondary}
                stroke={1.8}
              />
              <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
                {paymentLabel(expense.paymentMethod, t)}
              </Text>
            </View>
          ) : null}
          {expense.photos.length > 0 ? (
            <View style={[styles.badge, styles.badgeRow, { backgroundColor: theme.bgSoft }]}>
              <Icon name="photo" size={11} color={theme.textSecondary} stroke={1.8} />
              <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
                {expense.photos.length}
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
            <View style={[styles.badge, styles.badgeRow, { backgroundColor: theme.bgSoft }]}>
              <Icon name="exclude" size={10} color={theme.textMuted} stroke={2} />
              <Text style={[styles.badgeText, { color: theme.textMuted }]}>
                {t('expenseDetail.badgeExcluded')}
              </Text>
            </View>
          ) : null}
          {expense.isPrivate ? (
            <View style={[styles.badge, styles.badgeRow, { backgroundColor: theme.bgSoft }]}>
              <Icon name="lock" size={10} color={theme.textMuted} stroke={2} />
              <Text style={[styles.badgeText, { color: theme.textMuted }]}>
                {t('expense.privateBadge')}
              </Text>
            </View>
          ) : null}
          {expense.isSplit ? (
            <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.badgeText, { color: theme.accent }]}>
                {t('split.badge')}
              </Text>
            </View>
          ) : null}
          {loggedByName && !isSelfLogged ? (
            <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.badgeText, { color: theme.accent }]}>
                {loggedByName}
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

function paymentLabel(method: string, t: (key: string) => string): string {
  // stats.* keys exist in en.json/he.json with the plain "Cash" / "Credit"
  // labels (no emoji prefix). The icon is rendered separately by the badge.
  if (method === 'cash') return t('stats.paymentCash');
  if (method === 'credit') return t('stats.paymentCredit');
  if (method === 'debit') return t('stats.paymentDebit');
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
    borderWidth: borderWidth.hairline,
  },
  iconFallback: {
    width: sizing.categoryIconMedium,
    height: sizing.categoryIconMedium,
    borderRadius: sizing.radiusIcon,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flex: 1, minWidth: 0, gap: spacing.xs },
  title: { ...typography.itemTitle, fontSize: 15 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  meta: { ...typography.secondary, fontSize: 12 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: sizing.radiusPill,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  badgeText: { ...typography.micro, fontSize: 10 },
  right: { alignItems: 'flex-end', gap: 3 },
  amount: { ...typography.amountSmall, fontSize: 15 },
  // caption is shared with non-numeric copy elsewhere; tabular is intent-specific here.
  amountSecondary: { ...typography.caption, fontVariant: ['tabular-nums'] },
});
