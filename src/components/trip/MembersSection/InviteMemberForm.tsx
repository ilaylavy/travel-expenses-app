import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import {
  getExistingMember,
  inviteMember as dbInviteMember,
} from '@/db/queries/tripMembers';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/services/supabase';
import { syncEngine } from '@/sync/syncEngine';

interface LookupResult {
  user_id?: string;
  name?: string;
  avatar_url?: string | null;
  error?: string;
}

export function InviteMemberForm({
  tripId,
  currentUserId,
  onInvited,
}: {
  tripId: string;
  currentUserId: string | null;
  onInvited: () => void | Promise<void>;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

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
      await onInvited();
    } catch (e) {
      console.warn('invite failed:', e);
      setInviteError(e instanceof Error ? e.message : t('tripSettings.members.inviteFailed'));
    } finally {
      setInviting(false);
    }
  };

  return (
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
          placeholder={t('tripSettings.members.inviteEmailPlaceholder')}
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
          onPress={() => {
            void handleInvite();
          }}
          disabled={inviting || email.trim().length === 0}
          style={({ pressed }) => [
            styles.inviteButton,
            {
              backgroundColor: theme.accent,
              opacity: inviting || email.trim().length === 0 ? 0.7 : 1,
              transform: [
                {
                  scale: pressed && !inviting && email.trim().length > 0 ? 0.96 : 1,
                },
              ],
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
  );
}

const styles = StyleSheet.create({
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
    borderWidth: borderWidth.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 2, // 12 — form field height
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
});
