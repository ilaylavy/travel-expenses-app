import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StatsSectionCard } from '@/components/stats/StatsSectionCard';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatAmount } from '@/utils/currency';
import { formatReadableDate } from '@/utils/date';
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  if (byDay.length === 0) return null;

  const maxValue = Math.max(...byDay.map((d) => Math.abs(d.total)), average, 1);
  const avgPct = Math.min(1, average / maxValue);
  const showBarLabels = byDay.length <= 7;
  const labelStride = byDay.length <= 10 ? 1 : Math.ceil(byDay.length / 10);
  const selectedDay = selectedDate ? byDay.find((d) => d.date === selectedDate) ?? null : null;

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
            const isEmpty = d.total === 0;
            const isSelected = selectedDate === d.date;
            return (
              <Pressable
                key={d.date}
                onPress={() =>
                  setSelectedDate((prev) => (prev === d.date ? null : d.date))
                }
                style={styles.barCol}
                hitSlop={4}
              >
                {showBarLabels && !isEmpty ? (
                  <Text
                    style={[styles.barLabel, { color: theme.textMuted }]}
                    numberOfLines={1}
                  >
                    {formatAmount(d.total, currency)}
                  </Text>
                ) : null}
                {isEmpty ? (
                  <View
                    style={[
                      styles.bar,
                      {
                        height: MIN_BAR_HEIGHT,
                        backgroundColor: theme.accent,
                        opacity: 0.3,
                      },
                    ]}
                  />
                ) : isNegative ? (
                  <View
                    style={[
                      styles.bar,
                      {
                        height: h,
                        backgroundColor: theme.green,
                        opacity: selectedDate && !isSelected ? 0.4 : 1,
                      },
                    ]}
                  />
                ) : (
                  <LinearGradient
                    colors={theme.gradient1}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[
                      styles.bar,
                      {
                        height: h,
                        opacity: selectedDate && !isSelected ? 0.4 : 1,
                      },
                    ]}
                  />
                )}
                {i % labelStride === 0 ? (
                  <Text style={[styles.axisLabel, { color: theme.textMuted }]}>
                    {d.date.slice(-2)}
                  </Text>
                ) : (
                  <Text style={styles.axisLabel}> </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {selectedDay ? (
        <View
          style={[
            styles.tooltip,
            { backgroundColor: theme.accentSoft, borderColor: theme.accent },
          ]}
        >
          <View style={styles.tooltipText}>
            <Text style={[styles.tooltipDate, { color: theme.accent }]}>
              {formatReadableDate(selectedDay.date)}
            </Text>
            <Text style={[styles.tooltipAmount, { color: theme.text }]}>
              {formatAmount(selectedDay.total, currency)}
            </Text>
          </View>
          <Pressable
            onPress={() => setSelectedDate(null)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.tooltipClose,
              {
                backgroundColor: theme.accent,
                transform: [{ scale: pressed ? 0.9 : 1 }],
              },
            ]}
          >
            <Text style={styles.tooltipCloseText}>✕</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.legend}>
          <View style={[styles.legendLine, { borderColor: theme.textMuted }]} />
          <Text style={[styles.legendText, { color: theme.textMuted }]}>
            {t('stats.average')}: {formatAmount(average, currency)}
          </Text>
        </View>
      )}
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
    borderTopWidth: borderWidth.hairline,
    borderStyle: 'dashed',
    opacity: 0.6,
    zIndex: 1,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  bar: {
    width: '80%', // bar slot geometry inside its column
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    overflow: 'hidden',
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
    borderTopWidth: borderWidth.hairline,
    borderStyle: 'dashed',
    height: 0,
  },
  legendText: { ...typography.caption },
  tooltip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: sizing.radiusInput,
    borderWidth: borderWidth.hairline,
  },
  tooltipText: { flex: 1, gap: 2 },
  tooltipDate: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2, textTransform: 'uppercase' },
  tooltipAmount: { ...typography.amountSmall },
  tooltipClose: {
    width: 22,
    height: 22,
    borderRadius: sizing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltipCloseText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', lineHeight: 12 },
});
