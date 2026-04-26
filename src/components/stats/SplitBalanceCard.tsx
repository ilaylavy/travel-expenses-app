import { StyleSheet, Text, View } from 'react-native';

import { StatsSectionCard } from '@/components/stats/StatsSectionCard';
import { sizing, spacing, typography } from '@/constants/theme';
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
}

export function SplitBalanceCard({
  byMember,
  settlement,
  currency,
  currentUserId,
  memberNames,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (byMember.length < 2) return null;

  const resolveName = (userId: string): string => {
    if (userId === currentUserId) return t('stats.you');
    return memberNames[userId] ?? '—';
  };

  // Color and message per state.
  let settlementText: string;
  let bgColor = theme.accentSoft;
  let textColor = theme.accent;
  if (!settlement) {
    settlementText = t('balance.even');
  } else if (settlement.fromUserId === currentUserId) {
    // You owe someone.
    settlementText = t('balance.youOwe', {
      name: resolveName(settlement.toUserId),
      amount: formatAmount(settlement.amount, currency),
    });
    bgColor = theme.redSoft;
    textColor = theme.red;
  } else if (settlement.toUserId === currentUserId) {
    // Someone owes you.
    settlementText = t('balance.owesYou', {
      name: resolveName(settlement.fromUserId),
      amount: formatAmount(settlement.amount, currency),
    });
    bgColor = theme.greenSoft;
    textColor = theme.green;
  } else {
    // 3+ member trips where the current user isn't part of the largest debt.
    settlementText = t('stats.xOwesY', {
      from: resolveName(settlement.fromUserId),
      to: resolveName(settlement.toUserId),
      amount: formatAmount(settlement.amount, currency),
    });
  }

  return (
    <StatsSectionCard title={t('stats.splitBalance')}>
      <View style={styles.members}>
        {byMember.map((m) => {
          const name = resolveName(m.userId);
          return (
            <View key={m.userId} style={styles.memberRow}>
              <View
                style={[styles.avatar, { backgroundColor: theme.accentSoft }]}
              >
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
                {formatAmount(m.total, currency)}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={[styles.netLabel, { color: theme.textMuted }]}>
        {t('balance.netSettlement')}
      </Text>
      <View style={[styles.settlement, { backgroundColor: bgColor }]}>
        <Text style={[styles.settlementText, { color: textColor }]}>
          {settlementText}
        </Text>
      </View>
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
    borderRadius: sizing.categoryIconSmall / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.micro, fontSize: 12 },
  memberName: { ...typography.body, flex: 1 },
  memberAmount: { ...typography.amountSmall },
  netLabel: { ...typography.micro, marginTop: spacing.sm },
  settlement: {
    marginTop: spacing.xs,
    borderRadius: sizing.radiusChip,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  settlementText: { ...typography.subtitle },
});
