import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { PairwiseSettlement } from '@/utils/balance';
import { formatAmount } from '@/utils/currency';
import { initials } from '@/utils/initials';
import { getMemberTint } from '@/utils/memberTint';

interface OwesYouRowProps {
  debt: PairwiseSettlement;
  // Resolved display name for the debtor (the other party).
  name: string;
  currency: string;
  // Tap-anywhere on the row triggers the same settle flow as before.
  onPress: () => void;
}

// Outstanding row where the CURRENT user is the creditor — they're owed
// money. Tap anywhere to open the settle flow. The green "Mark paid"
// pill is a visual affordance; the actual tap target is the whole row.
export function OwesYouRow({ debt, name, currency, onPress }: OwesYouRowProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const tint = getMemberTint(debt.fromUserId, theme);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name} owes you ${formatAmount(debt.amount, currency)}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.surface,
          borderColor: pressed ? theme.green : theme.border,
        },
      ]}
    >
      <Avatar label={initials(name)} tint={tint} size={40} radius={12} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {t('balances.owesYouOutstanding', { name })}
        </Text>
        <Text style={[styles.amount, { color: theme.green }]}>
          {formatAmount(debt.amount, currency)}
        </Text>
      </View>
      <View style={[styles.cta, { backgroundColor: theme.green }]}>
        <Icon name="check" size={12} color="#FFFFFF" stroke={2.4} />
        <Text style={styles.ctaText}>{t('balances.markPaidCta')}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md + 2,
    borderRadius: sizing.radiusInput,
    borderWidth: borderWidth.hairline,
    marginBottom: spacing.sm,
  },
  text: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 14, fontWeight: '700', lineHeight: 17 },
  amount: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 9,
    borderRadius: sizing.radiusPill,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
