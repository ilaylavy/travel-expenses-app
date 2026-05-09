import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Trip } from '@/types/trip';
import { formatAmount } from '@/utils/currency';
import { isValidIsoDate } from '@/utils/date';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoToUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function tripTotalDays(trip: Trip): number | null {
  if (!trip.endDate || !isValidIsoDate(trip.startDate) || !isValidIsoDate(trip.endDate)) {
    return null;
  }
  return Math.round((isoToUtc(trip.endDate) - isoToUtc(trip.startDate)) / MS_PER_DAY) + 1;
}

interface ExpenseStatsStripProps {
  trip: Trip;
  totalSpent: number;
  dailyAverage: number;
  daysElapsed: number;
  budgetHome: number | null;
  budgetRemaining: number | null;
  expenseCount: number;
}

export function ExpenseStatsStrip({
  trip,
  totalSpent,
  dailyAverage,
  daysElapsed,
  budgetHome,
  budgetRemaining,
  expenseCount,
}: ExpenseStatsStripProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const totalDays = tripTotalDays(trip);
  const currency = trip.homeCurrency;

  const dayLabel = totalDays
    ? t('expenses.statsDayOf', { current: daysElapsed, total: totalDays })
    : t('expenses.statsDayN', { current: daysElapsed });

  const hasBudget = budgetHome !== null && budgetHome > 0;
  const remaining = budgetRemaining ?? 0;
  const remainingPct = hasBudget ? remaining / (budgetHome as number) : 0;
  const spentPct = hasBudget ? 1 - remainingPct : 0;

  const remainingColor = (() => {
    if (!hasBudget) return theme.text;
    if (remainingPct > 0.3) return theme.green;
    if (remainingPct >= 0.1) return theme.orange;
    return theme.red;
  })();

  return (
    <View style={[styles.wrap, { borderColor: theme.border }]}>
      <LinearGradient
        colors={theme.cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.row}>
          <View style={[styles.item, { borderRightColor: theme.borderLight, borderRightWidth: 1 }]}>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('expenses.statsTotal')}
            </Text>
            <Text style={[styles.value, { color: theme.text }]} numberOfLines={1}>
              {formatAmount(totalSpent, currency)}
            </Text>
            <View style={styles.subSlot} />
          </View>

          <View style={[styles.item, { borderRightColor: theme.borderLight, borderRightWidth: 1 }]}>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('expenses.statsDailyAvg')}
            </Text>
            <Text style={[styles.value, { color: theme.text }]} numberOfLines={1}>
              {formatAmount(dailyAverage, currency)}
            </Text>
            <View style={styles.subSlot}>
              <Text style={[styles.sub, { color: theme.textMuted }]} numberOfLines={1}>
                {dayLabel}
              </Text>
            </View>
          </View>

          <View style={styles.item}>
            {hasBudget ? (
              <>
                <Text style={[styles.label, { color: theme.textMuted }]}>
                  {t('expenses.statsBudgetLeft')}
                </Text>
                <Text style={[styles.value, { color: remainingColor }]} numberOfLines={1}>
                  {formatAmount(remaining, currency)}
                </Text>
                <View style={styles.subSlot}>
                  <BudgetBar spentPct={spentPct} theme={theme} />
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.label, { color: theme.textMuted }]}>
                  {t('expenses.statsExpenses')}
                </Text>
                <Text style={[styles.value, { color: theme.text }]} numberOfLines={1}>
                  {expenseCount}
                </Text>
                <View style={styles.subSlot} />
              </>
            )}
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

interface BudgetBarProps {
  spentPct: number;
  theme: ReturnType<typeof useTheme>;
}

function BudgetBar({ spentPct, theme }: BudgetBarProps) {
  const clamped = Math.max(0, Math.min(1, spentPct));
  const fillWidth = `${clamped * 100}%` as const;

  if (clamped > 0.9) {
    return (
      <View style={[styles.bar, { backgroundColor: theme.bgSoft }]}>
        <View
          style={{
            width: fillWidth,
            height: '100%',
            backgroundColor: theme.red,
            borderRadius: 6,
          }}
        />
      </View>
    );
  }

  const colors = clamped > 0.7 ? theme.gradient2 : theme.gradient1;
  return (
    <View style={[styles.bar, { backgroundColor: theme.bgSoft }]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: fillWidth, height: '100%', borderRadius: 6 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  card: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  row: { flexDirection: 'row' },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 2,
  },
  label: {
    ...typography.micro,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  value: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  subSlot: { height: 14, justifyContent: 'center', width: '100%', alignItems: 'center' },
  sub: { fontSize: 10, fontWeight: '500' },
  bar: {
    height: 4,
    width: '90%',
    borderRadius: 6,
    overflow: 'hidden',
  },
});
