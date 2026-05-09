import { StyleSheet, Text, View } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { ExpenseSplit, ExpenseWithPhotos } from '@/types/expense';
import { formatAmount } from '@/utils/currency';

import { FieldCard } from './FieldCard';

export function ExpenseSplitBreakdown({
  expense,
  splits,
  userSplit,
  splitMemberNames,
  currentUserId,
}: {
  expense: ExpenseWithPhotos;
  splits: ExpenseSplit[];
  userSplit: ExpenseSplit | null;
  splitMemberNames: Record<string, string>;
  currentUserId: string | null;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (!expense.isSplit || splits.length === 0) return null;

  return (
    <FieldCard title={t('split.betweenPeople', { count: splits.length })}>
      <Text style={[styles.fieldSub, { color: theme.textSecondary }]}>
        {t('split.total', {
          amount: formatAmount(Math.abs(expense.amount), expense.currency),
        })}
      </Text>
      <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
        {splits.map((s) => {
          const name =
            s.userId === currentUserId
              ? t('expenseDetail.you')
              : splitMemberNames[s.userId] || s.userId.slice(0, 6);
          return (
            <View key={s.id} style={styles.splitRow}>
              <Text
                style={{ color: theme.text, flex: 1, fontWeight: '600' }}
                numberOfLines={1}
              >
                {name}
              </Text>
              {s.isPayer ? (
                <View style={[styles.badge, { backgroundColor: theme.greenSoft }]}>
                  <Text style={[styles.badgeText, { color: theme.green }]}>
                    {t('split.paid')}
                  </Text>
                </View>
              ) : null}
              <Text style={{ color: theme.text, fontWeight: '700' }}>
                {formatAmount(s.amount, expense.currency)}
              </Text>
            </View>
          );
        })}
      </View>
      {userSplit ? (
        <Text
          style={[
            styles.yourShare,
            { color: theme.accent, marginTop: spacing.sm },
          ]}
        >
          {t('split.yourShare', {
            amount: formatAmount(userSplit.amount, expense.currency),
          })}
        </Text>
      ) : null}
    </FieldCard>
  );
}

const styles = StyleSheet.create({
  fieldSub: { ...typography.secondary, marginTop: 2 },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: sizing.radiusChip,
  },
  badgeText: { ...typography.micro },
  yourShare: { ...typography.body, fontSize: 15, fontWeight: '700' },
});
