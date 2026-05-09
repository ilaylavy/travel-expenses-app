import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
import { getProfileName } from '@/db/queries/profiles';
import {
  leaveTrip as dbLeaveTrip,
  removeMember as dbRemoveMember,
} from '@/db/queries/tripMembers';
import { listTripMembers } from '@/db/queries/trips';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import { syncEngine } from '@/sync/syncEngine';
import { showConfirmDialog } from '@/utils/confirmDialog';

import { InviteMemberForm } from './InviteMemberForm';
import type { MemberWithName } from './MemberRow';
import { MembersList } from './MembersList';

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

  const [members, setMembers] = useState<MemberWithName[]>([]);

  const reload = useCallback(async (): Promise<void> => {
    const rows = await listTripMembers(tripId);
    const hydrated = await Promise.all(
      rows.map(async (m) => ({ ...m, name: await getProfileName(m.userId) })),
    );
    setMembers(hydrated);
  }, [tripId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleRemove = (m: MemberWithName): void => {
    showConfirmDialog({
      title: t('tripSettings.members.removeConfirmTitle'),
      body: t('tripSettings.members.removeConfirmBody', { name: m.name ?? '—' }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: async () => {
        try {
          await dbRemoveMember(m.id);
          void syncEngine.triggerSync();
          await reload();
        } catch (e) {
          Alert.alert(
            t('tripSettings.members.removeFailedTitle'),
            e instanceof Error ? e.message : t('tripSettings.unknownError'),
          );
        }
      },
    });
  };

  const handleLeave = (): void => {
    if (!currentUserId) return;
    showConfirmDialog({
      title: t('tripSettings.members.leaveConfirmTitle'),
      body: t('tripSettings.members.leaveConfirmBody'),
      confirmLabel: t('tripSettings.members.leaveTrip'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: async () => {
        try {
          await dbLeaveTrip(tripId, currentUserId);
          void syncEngine.triggerSync();
          await reload();
        } catch (e) {
          Alert.alert(
            t('tripSettings.members.leaveFailedTitle'),
            e instanceof Error ? e.message : t('tripSettings.unknownError'),
          );
        }
      },
    });
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: theme.textMuted }]}>
        {t('tripSettings.members.title').toUpperCase()}
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
              opacity: pressed ? 0.7 : 1,
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
  heading: { ...typography.micro },
  leaveButton: {
    marginTop: spacing.sm,
    borderRadius: sizing.radiusButton,
    borderWidth: 1.5,
    paddingVertical: 14,
    alignItems: 'center',
  },
  leaveText: { fontSize: 14, fontWeight: '700' },
});
