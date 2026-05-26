import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatAmount } from '@/utils/currency';

import type { StatsPeriod } from './PeriodSelector';

interface StatsHeroProps {
  period: StatsPeriod;
  totalSpent: number;
  dailyAverage: number;
  // Budget block is always trip-wide — the percent reflects spend across
  // the whole trip, not the selected period.
  tripBudget: number | null;
  tripSpendShare: number;
  daysRemaining: number | null;
  currency: string;
}

// Stats screen brand hero — indigo monochrome gradient with the
// period-aware total, a one-line sub ($X/day · Y% of budget · N days
// left), and a budget bar. Matches design-system StatsScreen `.hero`.
export function StatsHero({
  period,
  totalSpent,
  dailyAverage,
  tripBudget,
  tripSpendShare,
  daysRemaining,
  currency,
}: StatsHeroProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const labelKey =
    period === '7d'
      ? 'stats.heroLabelLast7'
      : period === '30d'
        ? 'stats.heroLabelLast30'
        : 'stats.heroLabelTrip';

  const hasBudget = tripBudget !== null && tripBudget > 0;
  const spentPct = hasBudget
    ? Math.max(0, Math.min(1, tripSpendShare / (tripBudget as number)))
    : 0;
  const pctLabel = `${Math.round(spentPct * 100)}%`;

  const subParts: string[] = [
    t('stats.heroSubDailyAvg', {
      amount: formatAmount(dailyAverage, currency),
    }),
  ];
  if (hasBudget) {
    subParts.push(t('stats.heroSubBudget', { percent: pctLabel }));
  }
  if (daysRemaining !== null) {
    subParts.push(t('stats.heroSubDaysLeft', { count: daysRemaining }));
  }
  const subLine = subParts.join(' · ');

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={theme.gradient1}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { shadowColor: theme.accent }]}
      >
        <View style={[styles.disc, styles.discTop]} />
        <View style={[styles.disc, styles.discBottom]} />

        <Text style={styles.label}>{t(labelKey)}</Text>
        <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
          {formatAmount(totalSpent, currency)}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {subLine}
        </Text>

        {hasBudget ? (
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${spentPct * 100}%` }]} />
          </View>
        ) : null}
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
  discTop: { width: 160, height: 160, top: -40, right: -30 },
  discBottom: {
    width: 96,
    height: 96,
    bottom: -28,
    left: '28%',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  label: {
    ...typography.micro,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  amount: {
    ...typography.amountHero,
    color: '#FFFFFF',
    marginTop: spacing.xs,
  },
  sub: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '600',
    marginTop: spacing.xs + 2,
    fontVariant: ['tabular-nums'],
  },
  bar: {
    height: 5,
    width: '100%',
    borderRadius: sizing.radiusPill,
    overflow: 'hidden',
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  barFill: {
    height: '100%',
    borderRadius: sizing.radiusPill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
});
