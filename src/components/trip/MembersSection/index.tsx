import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';

import { InviteMemberForm } from './InviteMemberForm';
import { MembersList } from './MembersList';
import { useMemberActions, useMembers } from './useMembers';

export function MembersSection({
  tripId,
  ownerId,
}: {
  tripId: string;
  ownerId: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const isOwner = currentUserId === ownerId;

  const { members, reload } = useMembers(tripId);
  const { handleRemove, handleLeave } = useMemberActions({
    tripId,
    currentUserId,
    onReload: reload,
  });

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: theme.textMuted }]}>
        {t('tripSettings.members.title')}
      </Text>

      <MembersList
        members={members}
        currentUserId={currentUserId}
        isOwner={isOwner}
        onRemove={handleRemove}
      />

      {isOwner ? (
        <InviteMemberForm
          tripId={tripId}
          currentUserId={currentUserId}
          onInvited={reload}
        />
      ) : (
        <Pressable
          onPress={handleLeave}
          style={({ pressed }) => [
            styles.leaveButton,
            {
              backgroundColor: theme.redSoft,
              borderColor: theme.red,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Text style={[styles.leaveText, { color: theme.red }]}>
            {t('tripSettings.members.leaveTrip')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.base,
    gap: spacing.sm,
  },
  heading: { ...typography.micro, textTransform: 'uppercase' },
  leaveButton: {
    marginTop: spacing.sm,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    paddingVertical: 14, // button tall geometry
    alignItems: 'center',
  },
  leaveText: { fontSize: 14, fontWeight: '700' },
});
