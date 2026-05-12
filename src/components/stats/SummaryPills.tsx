import { StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { TripStats } from '@/utils/statsAggregations';
import { formatAmount } from '@/utils/currency';

interface Props {
  stats: TripStats;
  currency: string;
  hasBudget: boolean;
  isOngoing: boolean;
}

interface PillDef {
  emoji: string;
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative';
}

export function SummaryPills({ stats, currency, hasBudget, isOngoing }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();

  const pills: PillDef[] = [
    {
      emoji: '💰',
      label: t('stats.totalSpent'),
      value: formatAmount(stats.totalSpent, currency),
    },
    {
      emoji: '📅',
      label: t('stats.dailyAverage'),
      value: formatAmount(stats.dailyAverage, currency),
    },
    {
      emoji: '⏳',
      label: isOngoing || stats.daysRemaining === null
        ? t('stats.daysElapsed')
        : t('stats.daysRemaining'),
      value:
        isOngoing || stats.daysRemaining === null
          ? String(stats.daysElapsed)
          : String(stats.daysRemaining),
    },
  ];

  if (hasBudget) {
    const remaining = stats.budgetRemaining;
    pills.push({
      emoji: '🎯',
      label: t('stats.budgetRemaining'),
      value: remaining === null ? '—' : formatAmount(remaining, currency),
      tone: remaining !== null && remaining < 0 ? 'negative' : 'default',
    });
    const safe = stats.safeDailySpend;
    pills.push({
      emoji: '🛟',
      label: t('stats.safeDailySpend'),
      value: safe === null ? '—' : formatAmount(safe, currency),
      tone: safe === null ? 'default' : safe < 0 ? 'negative' : 'positive',
    });
  }

  return (
    <View style={styles.grid}>
      {pills.map((p, i) => {
        const valueColor =
          p.tone === 'negative'
            ? theme.red
            : p.tone === 'positive'
              ? theme.green
              : theme.text;
        return (
          <View
            key={`${p.label}-${i}`}
            style={[
              styles.pill,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={styles.emoji}>{p.emoji}</Text>
            <Text
              style={[styles.value, { color: valueColor }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {p.value}
            </Text>
            <Text
              style={[styles.label, { color: theme.textMuted }]}
              numberOfLines={2}
            >
              {p.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 100,
    borderRadius: sizing.radiusCardInner,
    borderWidth: borderWidth.base,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: 2, // optical between emoji/value/label
  },
  emoji: { fontSize: 20, marginBottom: 2 },
  value: { ...typography.amountMedium, textAlign: 'center' },
  label: {
    ...typography.micro,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
