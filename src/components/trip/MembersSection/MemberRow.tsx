import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { TripMember } from '@/types/trip';
import { initials } from '@/utils/initials';

export interface MemberWithName extends TripMember {
  name: string | null;
}

export function MemberRow({
  member,
  isSelf,
  showRemove,
  onRemove,
}: {
  member: MemberWithName;
  isSelf: boolean;
  showRemove: boolean;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  const displayName = (isSelf ? t('tripSettings.members.youLabel') : member.name) ?? '—';
  const roleLabel =
    member.role === 'owner'
      ? t('tripSettings.members.ownerLabel')
      : member.joinedAt
        ? null
        : t('tripSettings.members.pending');

  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
        <Text style={[styles.avatarText, { color: theme.accent }]}>
          {initials(member.name ?? '?')}
        </Text>
      </View>
      <View style={styles.meta}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {displayName}
        </Text>
        {roleLabel ? (
          <Text style={[styles.role, { color: theme.textSecondary }]}>{roleLabel}</Text>
        ) : null}
      </View>
      {showRemove ? (
        <Pressable
          onPress={onRemove}
          style={({ pressed }) => [
            styles.smallButton,
            {
              borderColor: theme.border,
              backgroundColor: theme.surface,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
          ]}
          hitSlop={8}
        >
          <Text style={[styles.smallButtonText, { color: theme.red }]}>
            {t('tripSettings.members.remove')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
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
  meta: { flex: 1 },
  name: { ...typography.body, fontWeight: '700' },
  role: { ...typography.caption, marginTop: 2 },
  smallButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
  },
  smallButtonText: { fontSize: 12, fontWeight: '700' },
});
