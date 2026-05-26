import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { MemberShareTotal } from '@/utils/balance';
import { formatAmount } from '@/utils/currency';
import { initials } from '@/utils/initials';
import { getMemberTint } from '@/utils/memberTint';

interface MembersShareCardProps {
  // Sorted by descending share — same shape `computeBalance().byMember`
  // returns.
  members: MemberShareTotal[];
  // Resolves a userId → display name (handles "You" for the current user).
  resolveName: (userId: string) => string;
  currency: string;
}

// At-a-glance picture of who has fronted shared expenses. One row per
// member, sorted descending by amount. The progress bar uses the member's
// tint and is sized proportional to the biggest contributor — visualizes
// the disparity without making absolute amounts the focus.
export function MembersShareCard({ members, resolveName, currency }: MembersShareCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  if (members.length === 0) return null;

  const max = Math.max(...members.map((m) => Math.abs(m.total)), 1);
  const topName = resolveName(members[0].userId);

  return (
    <View>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {members.map((m, idx) => {
          const last = idx === members.length - 1;
          const name = resolveName(m.userId);
          const tint = getMemberTint(m.userId, theme);
          const pct = Math.min(1, Math.abs(m.total) / max);
          return (
            <View
              key={m.userId}
              style={[
                styles.row,
                !last && { borderBottomColor: theme.borderLight, borderBottomWidth: 1, borderStyle: 'dashed' },
              ]}
            >
              <View style={styles.head}>
                <Avatar label={initials(name)} tint={tint} size={28} radius={999} />
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={[styles.amount, { color: theme.text }]}>
                  {formatAmount(m.total, currency)}
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: theme.bgSoft }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.round(pct * 100)}%`,
                      backgroundColor: tint,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
      {members.length > 1 ? (
        <Text style={[styles.footnote, { color: theme.textMuted }]}>
          {t('balances.memberFrontedMost', { name: topName })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs + 2,
    borderRadius: sizing.radiusInput,
    borderWidth: borderWidth.hairline,
  },
  row: { paddingVertical: spacing.md },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  name: { flex: 1, fontSize: 13, fontWeight: '600' },
  amount: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 6,
    borderRadius: sizing.radiusPill,
    overflow: 'hidden',
    // Align the bar's start edge with the name (right of the avatar).
    // marginStart flips automatically in RTL.
    marginStart: 38,
  },
  fill: {
    height: '100%',
    borderRadius: sizing.radiusPill,
  },
  footnote: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
    paddingHorizontal: spacing.xs + 2,
    paddingTop: spacing.sm,
  },
});
