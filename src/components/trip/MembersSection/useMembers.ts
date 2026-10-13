import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { getProfileName } from '@/db/queries/profiles';
import {
  leaveTrip as dbLeaveTrip,
  removeMember as dbRemoveMember,
} from '@/db/queries/tripMembers';
import { listTripMembers } from '@/db/queries/trips';
import { useTranslation } from '@/hooks/useTranslation';
import { syncEngine } from '@/sync/syncEngine';
import { showConfirmDialog } from '@/utils/confirmDialog';

import type { MemberWithName } from './MemberRow';

export function useMembers(tripId: string) {
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

  return { members, reload };
}

export function useMemberActions({
  tripId,
  currentUserId,
  onReload,
}: {
  tripId: string;
  currentUserId: string | null;
  onReload: () => Promise<void>;
}) {
  const { t } = useTranslation();

  const handleRemove = useCallback(
    (m: MemberWithName): void => {
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
            await onReload();
          } catch (e) {
            Alert.alert(
              t('tripSettings.members.removeFailedTitle'),
              e instanceof Error ? e.message : t('tripSettings.unknownError'),
            );
          }
        },
      });
    },
    [t, onReload],
  );

  const handleLeave = useCallback((): void => {
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
          await onReload();
        } catch (e) {
          Alert.alert(
            t('tripSettings.members.leaveFailedTitle'),
            e instanceof Error ? e.message : t('tripSettings.unknownError'),
          );
        }
      },
    });
  }, [tripId, currentUserId, t, onReload]);

  return { handleRemove, handleLeave };
}
