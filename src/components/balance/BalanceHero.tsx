import { StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatAmount } from '@/utils/currency';

interface BalanceHeroProps {
  // Net balance in home currency, signed. Positive = current user is owed
  // money on net; negative = owes; zero = settled.
  net: number;
  currency: string;
}

// Hero card at the top of the Balance screen. Big signed amount in
// green/red/secondary depending on tone, with one supporting sentence.
// Replaces the dense "Members · share of trip" header that used to sit up
// top in the old screen.
export function BalanceHero({ net, currency }: BalanceHeroProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const tone: 'pos' | 'neg' | 'zero' = net > 0 ? 'pos' : net < 0 ? 'neg' : 'zero';
  const color =
    tone === 'pos' ? theme.green : tone === 'neg' ? theme.red : theme.textSecondary;
  const sentence =
    tone === 'pos'
      ? t('balances.heroSentencePositive')
      : tone === 'neg'
        ? t('balances.heroSentenceNegative')
        : t('balances.heroSentenceSettled');

  const formatted = formatAmount(Math.abs(net), currency);
  const display =
    tone === 'zero' ? formatted : tone === 'pos' ? `+${formatted}` : `-${formatted}`;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.label, { color: theme.textMuted }]}>
        {t('balances.heroLabel')}
      </Text>
      <Text style={[styles.amount, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {display}
      </Text>
      <Text style={[styles.sentence, { color: theme.textSecondary }]}>
        {sentence}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.lg + 2,
    paddingTop: spacing.lg - 2,
    paddingBottom: spacing.lg + 2,
    borderRadius: sizing.radiusCardInner + 2,
    borderWidth: borderWidth.hairline,
  },
  label: {
    ...typography.micro,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amount: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1.6,
    marginTop: spacing.md,
    fontVariant: ['tabular-nums'],
  },
  sentence: {
    ...typography.secondary,
    marginTop: spacing.xs + 2,
    lineHeight: 18,
  },
});
