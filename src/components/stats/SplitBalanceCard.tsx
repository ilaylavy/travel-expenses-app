import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { StatsSectionCard } from '@/components/stats/StatsSectionCard';
import { sizing, spacing, typography, ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatAmount } from '@/utils/currency';
import { initials } from '@/utils/initials';
import type { MemberTotal, Settlement } from '@/utils/statsAggregations';

interface Props {
  byMember: MemberTotal[];
  settlement: Settlement | null;
  currency: string;
  currentUserId: string | null;
  memberNames: Record<string, string>;
  onOpenBalances?: () => void;
}

const resolveName = (
  userId: string,
  currentUserId: string | null,
  memberNames: Record<string, string>,
  t: (key: string, options?: any) => string
): string => {
  if (userId === currentUserId) return t('stats.you');
  return memberNames[userId] ?? '—';
};

function MemberRow({
  member,
  currency,
  name,
  theme,
}: {
  member: MemberTotal;
  currency: string;
  name: string;
  theme: ThemeColors;
}) {
  return (
    <View style={styles.memberRow}>
      <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
        <Text style={[styles.avatarText, { color: theme.accent }]}>
          {initials(name)}
        </Text>
      </View>
      <Text
        style={[styles.memberName, { color: theme.text }]}
        numberOfLines={1}
      >
        {name}
      </Text>
      <Text style={[styles.memberAmount, { color: theme.text }]}>
        {formatAmount(member.total, currency)}
      </Text>
    </View>
  );
}

function SettlementSummary({
  settlement,
  currency,
  currentUserId,
  memberNames,
  onOpenBalances,
  theme,
  t,
}: {
  settlement: Settlement | null;
  currency: string;
  currentUserId: string | null;
  memberNames: Record<string, string>;
  onOpenBalances?: () => void;
  theme: ThemeColors;
  t: (key: string, options?: any) => string;
}) {
  let settlementText: string;
  let bgColor = theme.accentSoft;
  let textColor = theme.accent;

  if (!settlement) {
    settlementText = t('balance.even');
  } else if (settlement.fromUserId === currentUserId) {
    // You owe someone.
    settlementText = t('balance.youOwe', {
      name: resolveName(settlement.toUserId, currentUserId, memberNames, t),
      amount: formatAmount(settlement.amount, currency),
    });
    bgColor = theme.redSoft;
    textColor = theme.red;
  } else if (settlement.toUserId === currentUserId) {
    // Someone owes you.
    settlementText = t('balance.owesYou', {
      name: resolveName(settlement.fromUserId, currentUserId, memberNames, t),
      amount: formatAmount(settlement.amount, currency),
    });
    bgColor = theme.greenSoft;
    textColor = theme.green;
  } else {
    // 3+ member trips where the current user isn't part of the largest debt.
    settlementText = t('stats.xOwesY', {
      from: resolveName(settlement.fromUserId, currentUserId, memberNames, t),
      to: resolveName(settlement.toUserId, currentUserId, memberNames, t),
      amount: formatAmount(settlement.amount, currency),
    });
  }

  return (
    <>
      <Text style={[styles.netLabel, { color: theme.textMuted }]}>
        {t('balance.netSettlement')}
      </Text>
      <Pressable
        onPress={onOpenBalances}
        disabled={!onOpenBalances}
        style={({ pressed }) => [
          styles.settlement,
          {
            backgroundColor: bgColor,
            transform: [{ scale: pressed && onOpenBalances ? 0.98 : 1 }],
          },
        ]}
      >
        <Text style={[styles.settlementText, { color: textColor }]}>
          {settlementText}
        </Text>
        {onOpenBalances ? (
          <View style={styles.settlementHintRow}>
            <Text style={[styles.settlementHint, { color: textColor }]}>
              {t('balance.tapToSettle')}
            </Text>
            <Icon name="chevron-right" size={12} color={textColor} stroke={2.2} />
          </View>
        ) : null}
      </Pressable>
    </>
  );
}

export function SplitBalanceCard({
  byMember,
  settlement,
  currency,
  currentUserId,
  memberNames,
  onOpenBalances,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (byMember.length < 2) return null;

  return (
    <StatsSectionCard title={t('stats.splitBalance')}>
      <View style={styles.members}>
        {byMember.map((m) => (
          <MemberRow
            key={m.userId}
            member={m}
            currency={currency}
            name={resolveName(m.userId, currentUserId, memberNames, t)}
            theme={theme}
          />
        ))}
      </View>

      <SettlementSummary
        settlement={settlement}
        currency={currency}
        currentUserId={currentUserId}
        memberNames={memberNames}
        onOpenBalances={onOpenBalances}
        theme={theme}
        t={t}
      />
    </StatsSectionCard>
  );
}

const styles = StyleSheet.create({
  members: { gap: spacing.sm },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: sizing.categoryIconSmall,
    height: sizing.categoryIconSmall,
    borderRadius: sizing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.micro, fontSize: 12 },
  memberName: { ...typography.body, flex: 1 },
  memberAmount: { ...typography.amountSmall },
  netLabel: { ...typography.micro, marginTop: spacing.sm },
  settlement: {
    marginTop: spacing.xs,
    borderRadius: sizing.radiusCardInner,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  settlementText: { ...typography.subtitle },
  settlementHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  settlementHint: { fontSize: 11, fontWeight: '600', opacity: 0.8 },
});
