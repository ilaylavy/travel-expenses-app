import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useIsRTL } from '@/hooks/useIsRTL';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { BalanceCardSummary } from '@/utils/balanceDisplay';
import { formatAmount } from '@/utils/currency';

interface BalanceCardProps {
  summary: BalanceCardSummary;
  // Resolved display name for the top obligation's other party. May be a
  // fallback like "—" if the member's profile name is missing.
  topOtherName?: string;
  currency: string;
  onPress: () => void;
}

// Trip-dashboard entry point to the Balances screen. Shown on shared trips
// only. Mirrors redesigns/balance/entry-card.jsx — flat surface, 14px
// radius, 36px icon tile. The settled state swaps the icon and tint to the
// green check; the open state uses currency-swap on the accent tint.
export function BalanceCard({ summary, topOtherName, currency, onPress }: BalanceCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const isRTL = useIsRTL();

  const isSettled = summary.top === null;
  const netColor =
    summary.net > 0
      ? theme.green
      : summary.net < 0
        ? theme.red
        : theme.textSecondary;
  const iconSoft = isSettled ? theme.greenSoft : theme.accentSoft;
  const iconFg = isSettled ? theme.green : theme.accent;

  let subtitle: string;
  if (isSettled || !summary.top) {
    subtitle = t('tripView.balanceCardSettled');
  } else {
    const name = topOtherName ?? '—';
    const phrase =
      summary.top.direction === 'owesYou'
        ? t('tripView.balanceCardOwesYou', { name })
        : t('tripView.balanceCardYouOwe', { name });
    subtitle =
      summary.extraCount > 0
        ? phrase + t('tripView.balanceCardMoreSuffix', { count: summary.extraCount })
        : phrase;
  }

  // Net display: prefix sign on the absolute formatted amount so the
  // currency symbol stays in the formatter's hands and we don't double up.
  const signed = formatAmount(Math.abs(summary.net), currency);
  const netDisplay =
    summary.net > 0 ? `+${signed}` : summary.net < 0 ? `-${signed}` : signed;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('tripView.balanceCardTitle')}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <View style={[styles.iconTile, { backgroundColor: iconSoft }]}>
        <Icon
          name={isSettled ? 'check' : 'currency-swap'}
          size={16}
          color={iconFg}
          stroke={2.2}
        />
      </View>
      <View style={styles.text}>
        <View style={styles.row}>
          <Text style={[styles.title, { color: theme.text }]}>
            {t('tripView.balanceCardTitle')}
          </Text>
          {!isSettled ? (
            <Text style={[styles.amount, { color: netColor }]}>{netDisplay}</Text>
          ) : null}
        </View>
        <Text style={[styles.subtitle, { color: theme.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Icon
        name={isRTL ? 'chevron-left' : 'chevron-right'}
        size={14}
        color={theme.textMuted}
        stroke={2}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    marginBottom: spacing.sm,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: sizing.radiusSmall,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 3 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  title: { fontSize: 14, fontWeight: '700' },
  amount: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  subtitle: { fontSize: 12, fontWeight: '500' },
});
