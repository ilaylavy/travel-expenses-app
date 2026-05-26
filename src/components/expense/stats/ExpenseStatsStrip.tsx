import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
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

// Trip-dashboard hero. The brand moment — indigo monochrome gradient,
// white type. Matches the design system's `.hero` card (the one card
// surface that owns a gradient).
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

  // Used to tint the "budget left" amount in the bottom cell — the bar
  // itself stays white-on-white per the design system. Color only leaks
  // into the cell value (subtle), not the bar (which would clash).
  const budgetTone: 'ok' | 'warn' | 'alert' = (() => {
    if (!hasBudget) return 'ok';
    if (remainingPct > 0.3) return 'ok';
    if (remainingPct >= 0.1) return 'warn';
    return 'alert';
  })();
  const remainingCellColor =
    budgetTone === 'ok' ? 'rgba(255,255,255,0.96)'
    : budgetTone === 'warn' ? '#FFE9A8'
    : '#FFB3B3';

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={theme.gradient1}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { shadowColor: theme.accent }]}
      >
        {/* Decorative discs (design-system .hero .disc) — soft white
            circles for depth without color noise. */}
        <View style={[styles.disc, styles.discTop]} />
        <View style={[styles.disc, styles.discBottom]} />

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>
            {t('expenses.statsTotal')}
          </Text>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
            {formatAmount(totalSpent, currency)}
          </Text>

          {hasBudget ? (
            <View style={styles.heroBudget}>
              <View style={styles.heroBar}>
                <View style={[styles.heroBarFill, { width: `${spentPct * 100}%` }]} />
              </View>
              <Text style={styles.heroBudgetText}>
                {t('expenses.statsBudgetUsed', {
                  pct: spentPctLabel,
                  total: formatAmount(budgetHome as number, currency),
                  defaultValue: `${spentPctLabel} of ${formatAmount(budgetHome as number, currency)}`,
                })}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.cell}>
            <Text style={styles.cellLabel}>
              {t('expenses.statsDailyAvg')}
            </Text>
            <Text style={styles.cellValue} numberOfLines={1}>
              {formatAmount(dailyAverage, currency)}
            </Text>
            <Text style={styles.cellSub} numberOfLines={1}>
              {dayLabel}
            </Text>
          </View>

          <View style={styles.cellDivider} />

          <View style={styles.cell}>
            {hasBudget ? (
              <>
                <Text style={styles.cellLabel}>
                  {t('expenses.statsBudgetLeft')}
                </Text>
                <Text style={[styles.cellValue, { color: remainingCellColor }]} numberOfLines={1}>
                  {formatAmount(remaining, currency)}
                </Text>
                <Text style={styles.cellSub} numberOfLines={1}>
                  {t('expenses.statsBudgetRemaining', {
                    pct: remainingPctLabel,
                    defaultValue: `${remainingPctLabel} left`,
                  })}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.cellLabel}>
                  {t('expenses.statsExpenses')}
                </Text>
                <Text style={styles.cellValue} numberOfLines={1}>
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

const styles = StyleSheet.create({
  wrap: {
    borderRadius: sizing.radiusCard,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  card: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 6,
    overflow: 'hidden',
  },
  disc: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  discTop: { width: 160, height: 160, top: -50, right: -40 },
  discBottom: { width: 100, height: 100, bottom: -30, left: '30%', backgroundColor: 'rgba(255,255,255,0.04)' },
  hero: { gap: spacing.xs },
  heroLabel: {
    ...typography.micro,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroAmount: { ...typography.amountHero, color: '#FFFFFF' },
  heroBudget: { marginTop: spacing.md, gap: spacing.sm },
  heroBar: {
    height: 5,
    width: '100%',
    borderRadius: sizing.radiusPill,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroBarFill: {
    height: '100%',
    borderRadius: sizing.radiusPill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  heroBudgetText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  cell: { flex: 1, gap: 2 },
  cellDivider: {
    width: 1,
    marginHorizontal: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  cellLabel: {
    ...typography.micro,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cellValue: { ...typography.amountMedium, color: '#FFFFFF' },
  cellSub: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
    fontVariant: ['tabular-nums'],
  },
  cellSubSpacer: { height: typography.caption.fontSize + 2 },
});
