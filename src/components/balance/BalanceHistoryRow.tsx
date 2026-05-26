import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { SettlementPayment } from '@/types/settlement';
import { formatAmount } from '@/utils/currency';
import { formatReadableDate } from '@/utils/date';
import { initials } from '@/utils/initials';
import { getMemberTint } from '@/utils/memberTint';

interface BalanceHistoryRowProps {
  settlement: SettlementPayment;
  // Resolves a userId → display name (e.g. "You" for the current user).
  resolveName: (userId: string) => string;
  // Triggered by the always-visible reverse button. Callers should fire
  // a confirm dialog before actually deleting the settlement.
  onReverse: () => void;
}

// One row in the History section. Two overlapping member chips (from →
// to), the flow label + date + optional note, the amount, and an
// always-visible reverse button at the trailing edge (replacing the
// hidden long-press affordance from the old screen).
export function BalanceHistoryRow({
  settlement,
  resolveName,
  onReverse,
}: BalanceHistoryRowProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const fromName = resolveName(settlement.fromUserId);
  const toName = resolveName(settlement.toUserId);
  const fromTint = getMemberTint(settlement.fromUserId, theme);
  const toTint = getMemberTint(settlement.toUserId, theme);

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {/* Overlapping chips — the trailing chip carries a bg-color ring
          rendered as a slight outset to visually separate from the leading
          chip's edge. */}
      <View style={styles.chips}>
        <Avatar label={initials(fromName)} tint={fromTint} size={26} radius={999} />
        <View
          style={[
            styles.chipOverlap,
            { borderColor: theme.bg, backgroundColor: theme.bg },
          ]}
        >
          <Avatar label={initials(toName)} tint={toTint} size={26} radius={999} />
        </View>
      </View>

      <View style={styles.text}>
        <Text style={[styles.flow, { color: theme.text }]} numberOfLines={1}>
          {t('balances.fromTo', { from: fromName, to: toName })}
        </Text>
        <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>
          {formatReadableDate(settlement.settledDate)}
          {settlement.note ? ` · ${settlement.note}` : ''}
        </Text>
      </View>

      <Text style={[styles.amount, { color: theme.text }]} numberOfLines={1}>
        {formatAmount(settlement.amount, settlement.currency)}
      </Text>

      <Pressable
        onPress={onReverse}
        accessibilityRole="button"
        accessibilityLabel={t('balances.reverseAriaLabel')}
        hitSlop={6}
        style={({ pressed }) => [
          styles.reverseBtn,
          {
            borderColor: pressed ? theme.red : theme.border,
          },
        ]}
      >
        <Icon
          name="refund"
          size={13}
          color={theme.textMuted}
          stroke={2.2}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md,
    borderRadius: sizing.radiusInput,
    borderWidth: borderWidth.hairline,
    marginBottom: spacing.sm,
  },
  chips: { flexDirection: 'row', alignItems: 'center' },
  chipOverlap: {
    // marginStart auto-flips in RTL so the chips still overlap leading-edge
    // first (visually closer to the "from → to" reading order).
    marginStart: -8,
    padding: 1,
    borderWidth: 1.5,
    borderRadius: 999,
  },
  text: { flex: 1, minWidth: 0, gap: 3 },
  flow: { fontSize: 13, fontWeight: '600', lineHeight: 16 },
  meta: { fontSize: 11, fontWeight: '500', lineHeight: 14 },
  amount: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  reverseBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
