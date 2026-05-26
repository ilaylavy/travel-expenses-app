import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { PairwiseSettlement } from '@/utils/balance';
import { formatAmount } from '@/utils/currency';
import { initials } from '@/utils/initials';
import { getMemberTint } from '@/utils/memberTint';

interface YouOweRowProps {
  debt: PairwiseSettlement;
  // Resolved display name for the creditor (the other party).
  name: string;
  currency: string;
  // Tap opens the settle flow. The design's asymmetric receiver-only model
  // is intentionally NOT adopted here — this row stays tappable to preserve
  // existing behavior (either side can record a settlement).
  onPress: () => void;
}

// Outstanding row where the CURRENT user is the debtor. Same row shape as
// OwesYouRow minus the green CTA; the red amount sits at the trailing edge.
export function YouOweRow({ debt, name, currency, onPress }: YouOweRowProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const tint = getMemberTint(debt.toUserId, theme);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`You owe ${name} ${formatAmount(debt.amount, currency)}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.surface,
          borderColor: pressed ? theme.red : theme.border,
        },
      ]}
    >
      <Avatar label={initials(name)} tint={tint} size={40} radius={12} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {t('balances.youOweOutstanding', { name })}
        </Text>
      </View>
      <Text style={[styles.amount, { color: theme.red }]}>
        {formatAmount(debt.amount, currency)}
      </Text>
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
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '700', lineHeight: 17 },
  amount: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
});
