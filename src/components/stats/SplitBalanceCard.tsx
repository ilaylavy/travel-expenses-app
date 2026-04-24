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

  let settlementLine: string | null = null;
  if (settlement) {
    settlementLine = t('stats.xOwesY', {
      from: resolveName(settlement.fromUserId),
      to: resolveName(settlement.toUserId),
      amount: formatAmount(settlement.amount, currency),
    });
  } else {
    settlementLine = t('stats.evenSplit');
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

      {settlementLine ? (
        <View
          style={[styles.settlement, { backgroundColor: theme.accentSoft }]}
        >
          <Text style={[styles.settlementText, { color: theme.accent }]}>
            {settlementLine}
          </Text>
        </View>
      ) : null}
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
  settlement: {
    marginTop: spacing.sm,
    borderRadius: sizing.radiusChip,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  settlementText: { ...typography.subtitle },
});
