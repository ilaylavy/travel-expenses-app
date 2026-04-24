import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
import { getProfileName } from '@/db/queries/profiles';
import { listTripMembers } from '@/db/queries/trips';
import {
  getExistingMember,
  inviteMember as dbInviteMember,
  leaveTrip as dbLeaveTrip,
  removeMember as dbRemoveMember,
} from '@/db/queries/tripMembers';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { syncEngine } from '@/sync/syncEngine';
import type { TripMember } from '@/types/trip';
import { initials } from '@/utils/initials';

interface Props {
  tripId: string;
  ownerId: string;
}

interface MemberWithName extends TripMember {
  name: string | null;
}

interface LookupResult {
  user_id?: string;
  name?: string;
  avatar_url?: string | null;
  error?: string;
}

export function MembersSection({ tripId, ownerId }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const isOwner = currentUserId === ownerId;

  const [members, setMembers] = useState<MemberWithName[]>([]);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

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

  const handleInvite = async (): Promise<void> => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setInviting(true);
    setInviteError(null);
    try {
      const { data, error } = await supabase.functions.invoke<LookupResult>(
        'lookup-profile-by-email',
        { body: { email: trimmed } },
      );
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status;
        if (status === 404) {
          setInviteError(t('tripSettings.members.inviteNotFound'));
        } else {
          setInviteError(error.message || t('tripSettings.members.inviteFailed'));
        }
        return;
      }
      if (!data?.user_id) {
        setInviteError(t('tripSettings.members.inviteNotFound'));
        return;
      }
      if (data.user_id === currentUserId) {
        setInviteError(t('tripSettings.members.cannotInviteSelf'));
        return;
      }
      const existing = await getExistingMember(tripId, data.user_id);
      if (existing) {
        setInviteError(t('tripSettings.members.alreadyMember'));
        return;
      }
      await dbInviteMember(tripId, data.user_id);
      void syncEngine.triggerSync();
      setEmail('');
      await reload();
    } catch (e) {
      console.warn('invite failed:', e);
      setInviteError(e instanceof Error ? e.message : t('tripSettings.members.inviteFailed'));
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = (m: MemberWithName): void => {
    Alert.alert(
      t('tripSettings.members.removeConfirmTitle'),
      t('tripSettings.members.removeConfirmBody', {
        name: m.name ?? '—',
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
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
        },
      ],
    );
  };

  const handleLeave = (): void => {
    if (!currentUserId) return;
    Alert.alert(
      t('tripSettings.members.leaveConfirmTitle'),
      t('tripSettings.members.leaveConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('tripSettings.members.leaveTrip'),
          style: 'destructive',
          onPress: async () => {
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
        },
      ],
    );
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: theme.textMuted }]}>
        {t('tripSettings.members.title').toUpperCase()}
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {members.map((m) => {
          const isSelf = m.userId === currentUserId;
          const displayName =
            (isSelf ? t('tripSettings.members.youLabel') : m.name) ?? '—';
          const roleLabel =
            m.role === 'owner'
              ? t('tripSettings.members.ownerLabel')
              : m.joinedAt
                ? null
                : t('tripSettings.members.pending');
          return (
            <View key={m.id} style={styles.memberRow}>
              <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.avatarText, { color: theme.accent }]}>
                  {initials(m.name ?? '?')}
                </Text>
              </View>
              <View style={styles.memberMeta}>
                <Text style={[styles.memberName, { color: theme.text }]} numberOfLines={1}>
                  {displayName}
                </Text>
                {roleLabel ? (
                  <Text style={[styles.memberRole, { color: theme.textSecondary }]}>
                    {roleLabel}
                  </Text>
                ) : null}
              </View>
              {isOwner && !isSelf ? (
                <Pressable
                  onPress={() => handleRemove(m)}
                  style={({ pressed }) => [
                    styles.smallButton,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                      opacity: pressed ? 0.7 : 1,
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
        })}
      </View>

      {isOwner ? (
        <View style={styles.inviteBlock}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            {t('tripSettings.members.inviteEmail')}
          </Text>
          <View style={styles.inviteRow}>
            <TextInput
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (inviteError) setInviteError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="partner@example.com"
              placeholderTextColor={theme.textMuted}
              style={[
                styles.input,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              editable={!inviting}
            />
            <Pressable
              onPress={() => { void handleInvite(); }}
              disabled={inviting || email.trim().length === 0}
              style={({ pressed }) => [
                styles.inviteButton,
                {
                  backgroundColor: theme.accent,
                  opacity:
                    pressed || inviting || email.trim().length === 0 ? 0.7 : 1,
                },
              ]}
            >
              {inviting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.inviteButtonText}>
                  {t('tripSettings.members.inviteButton')}
                </Text>
              )}
            </Pressable>
          </View>
          {inviteError ? (
            <Text style={[styles.error, { color: theme.red }]}>{inviteError}</Text>
          ) : null}
        </View>
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
  card: {
    borderRadius: sizing.radiusCard,
    borderWidth: 1.5,
    padding: spacing.lg,
    gap: spacing.md,
  },
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
  memberMeta: { flex: 1 },
  memberName: { ...typography.body, fontWeight: '700' },
  memberRole: { ...typography.caption, marginTop: 2 },
  smallButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: sizing.radiusButton,
    borderWidth: 1,
  },
  smallButtonText: { fontSize: 12, fontWeight: '700' },
  inviteBlock: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  label: { ...typography.caption, marginBottom: 2 },
  inviteRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderRadius: sizing.radiusInput,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 14,
  },
  inviteButton: {
    paddingHorizontal: spacing.lg,
    borderRadius: sizing.radiusButton,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
  inviteButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  error: { ...typography.caption },
  leaveButton: {
    marginTop: spacing.sm,
    borderRadius: sizing.radiusButton,
    borderWidth: 1.5,
    paddingVertical: 14,
    alignItems: 'center',
  },
  leaveText: { fontSize: 14, fontWeight: '700' },
});
