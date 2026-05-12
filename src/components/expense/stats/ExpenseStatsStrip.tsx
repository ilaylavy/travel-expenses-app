import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
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
  const spentPct = hasBudget ? Math.max(0, Math.min(1, 1 - remainingPct)) : 0;
  const spentPctLabel = `${Math.round(spentPct * 100)}%`;
  const remainingPctLabel = `${Math.round(Math.max(0, remainingPct) * 100)}%`;

  const budgetTone: 'ok' | 'warn' | 'alert' = (() => {
    if (!hasBudget) return 'ok';
    if (remainingPct > 0.3) return 'ok';
    if (remainingPct >= 0.1) return 'warn';
    return 'alert';
  })();

  const remainingColor =
    budgetTone === 'ok' ? theme.green : budgetTone === 'warn' ? theme.orange : theme.red;

  return (
    <View style={[styles.wrap, { borderColor: theme.border }]}>
      <LinearGradient
        colors={theme.cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.hero}>
          <Text style={[styles.heroLabel, { color: theme.textMuted }]}>
            {t('expenses.statsTotal')}
          </Text>
          <Text
            style={[styles.heroAmount, { color: theme.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatAmount(totalSpent, currency)}
          </Text>

          {hasBudget ? (
            <View style={styles.heroBudget}>
              <View style={[styles.heroBar, { backgroundColor: theme.bgSoft }]}>
                <BudgetFill spentPct={spentPct} tone={budgetTone} theme={theme} />
              </View>
              <Text style={[styles.heroBudgetText, { color: theme.textSecondary }]}>
                {t('expenses.statsBudgetUsed', {
                  pct: spentPctLabel,
                  total: formatAmount(budgetHome as number, currency),
                  defaultValue: `${spentPctLabel} of ${formatAmount(budgetHome as number, currency)}`,
                })}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />

        <View style={styles.row}>
          <View style={styles.cell}>
            <Text style={[styles.cellLabel, { color: theme.textMuted }]}>
              {t('expenses.statsDailyAvg')}
            </Text>
            <Text style={[styles.cellValue, { color: theme.text }]} numberOfLines={1}>
              {formatAmount(dailyAverage, currency)}
            </Text>
            <Text style={[styles.cellSub, { color: theme.textMuted }]} numberOfLines={1}>
              {dayLabel}
            </Text>
          </View>

          <View style={[styles.cellDivider, { backgroundColor: theme.borderLight }]} />

          <View style={styles.cell}>
            {hasBudget ? (
              <>
                <Text style={[styles.cellLabel, { color: theme.textMuted }]}>
                  {t('expenses.statsBudgetLeft')}
                </Text>
                <Text style={[styles.cellValue, { color: remainingColor }]} numberOfLines={1}>
                  {formatAmount(remaining, currency)}
                </Text>
                <Text style={[styles.cellSub, { color: theme.textMuted }]} numberOfLines={1}>
                  {t('expenses.statsBudgetRemaining', {
                    pct: remainingPctLabel,
                    defaultValue: `${remainingPctLabel} left`,
                  })}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.cellLabel, { color: theme.textMuted }]}>
                  {t('expenses.statsExpenses')}
                </Text>
                <Text style={[styles.cellValue, { color: theme.text }]} numberOfLines={1}>
                  {expenseCount}
                </Text>
                <View style={styles.cellSubSpacer} />
              </>
            )}
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

interface BudgetFillProps {
  spentPct: number;
  tone: 'ok' | 'warn' | 'alert';
  theme: ReturnType<typeof useTheme>;
}

function BudgetFill({ spentPct, tone, theme }: BudgetFillProps) {
  const fillWidth = `${spentPct * 100}%` as const;
  if (tone === 'alert') {
    return (
      <View
        style={{
          width: fillWidth,
          height: '100%',
          backgroundColor: theme.red,
          borderRadius: sizing.radiusPill,
        }}
      />
    );
  }
  const colors = tone === 'warn' ? theme.gradient2 : theme.gradient1;
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ width: fillWidth, height: '100%', borderRadius: sizing.radiusPill }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: sizing.radiusCard,
    borderWidth: borderWidth.base,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  card: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
    paddingBottom: spacing.lg,
  },
  hero: {
    gap: spacing.xs,
  },
  heroLabel: {
    ...typography.micro,
    textTransform: 'uppercase',
  },
  heroAmount: {
    ...typography.amountHero,
  },
  heroBudget: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  heroBar: {
    height: 6, // bar geometry, intentional
    width: '100%',
    borderRadius: sizing.radiusPill,
    overflow: 'hidden',
  },
  heroBudgetText: {
    ...typography.caption,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: borderWidth.hairline,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cell: {
    flex: 1,
    gap: spacing.xs / 2, // 2px optical tighten between label/value/sub
  },
  cellDivider: {
    width: borderWidth.hairline,
    marginHorizontal: spacing.lg,
  },
  cellLabel: {
    ...typography.micro,
    textTransform: 'uppercase',
  },
  cellValue: {
    ...typography.amountMedium,
  },
  cellSub: {
    ...typography.caption,
    fontVariant: ['tabular-nums'],
  },
  cellSubSpacer: {
    height: typography.caption.fontSize + 2,
  },
});
