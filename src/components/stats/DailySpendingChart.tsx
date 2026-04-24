import { StyleSheet, Text, View } from 'react-native';

import { StatsSectionCard } from '@/components/stats/StatsSectionCard';
import { spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatAmount } from '@/utils/currency';
import type { DailyTotal } from '@/utils/statsAggregations';

interface Props {
  byDay: DailyTotal[];
  average: number;
  currency: string;
}

const CHART_HEIGHT = 180;
const MIN_BAR_HEIGHT = 2;

export function DailySpendingChart({ byDay, average, currency }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (byDay.length === 0) return null;

  const maxValue = Math.max(...byDay.map((d) => Math.abs(d.total)), average, 1);
  const avgPct = Math.min(1, average / maxValue);
  const showBarLabels = byDay.length <= 7;
  const labelStride = byDay.length <= 10 ? 1 : Math.ceil(byDay.length / 10);

  return (
    <StatsSectionCard title={t('stats.dailySpending')}>
      <View style={styles.chartWrap}>
        <View
          style={[
            styles.averageLine,
            {
              bottom: CHART_HEIGHT * avgPct,
              borderColor: theme.textMuted,
            },
          ]}
        />
        <View style={[styles.bars, { height: CHART_HEIGHT }]}>
          {byDay.map((d, i) => {
            const pct = Math.abs(d.total) / maxValue;
            const h = Math.max(MIN_BAR_HEIGHT, Math.round(CHART_HEIGHT * pct));
            const isNegative = d.total < 0;
            return (
              <View key={d.date} style={styles.barCol}>
                {showBarLabels && d.total !== 0 ? (
                  <Text
                    style={[styles.barLabel, { color: theme.textMuted }]}
                    numberOfLines={1}
                  >
                    {formatAmount(d.total, currency)}
                  </Text>
                ) : null}
                <View
                  style={[
                    styles.bar,
                    {
                      height: d.total === 0 ? MIN_BAR_HEIGHT : h,
                      backgroundColor: isNegative ? theme.green : theme.accent,
                      opacity: d.total === 0 ? 0.3 : 1,
                    },
                  ]}
                />
                {i % labelStride === 0 ? (
                  <Text style={[styles.axisLabel, { color: theme.textMuted }]}>
                    {d.date.slice(-2)}
                  </Text>
                ) : (
                  <Text style={styles.axisLabel}> </Text>
                )}
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.legend}>
        <View style={[styles.legendLine, { borderColor: theme.textMuted }]} />
        <Text style={[styles.legendText, { color: theme.textMuted }]}>
          {t('stats.average')}: {formatAmount(average, currency)}
        </Text>
      </View>
    </StatsSectionCard>
  );
}

const styles = StyleSheet.create({
  chartWrap: {
    position: 'relative',
  },
  averageLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.6,
    zIndex: 1,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  bar: {
    width: '80%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barLabel: {
    ...typography.micro,
    fontSize: 9,
  },
  axisLabel: {
    ...typography.micro,
    fontSize: 10,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  legendLine: {
    width: 18,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    height: 0,
  },
  legendText: { ...typography.caption },
});
