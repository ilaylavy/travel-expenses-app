import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { PendingInvite } from '@/db/queries/tripMembers';

interface Props {
  invite: PendingInvite;
  inviterName: string | null;
  onAccept: (invite: PendingInvite) => Promise<void>;
  onDecline: (invite: PendingInvite) => Promise<void>;
}

export function PendingInviteCard({ invite, inviterName, onAccept, onDecline }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);

  const handle = async (action: 'accept' | 'decline'): Promise<void> => {
    if (busy) return;
    setBusy(action);
    try {
      if (action === 'accept') await onAccept(invite);
      else await onDecline(invite);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.accent },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.emoji}>{invite.trip.emoji}</Text>
        <View style={styles.meta}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {invite.trip.name}
          </Text>
          {inviterName ? (
            <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
              {t('trips.invitedBy', { name: inviterName })}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => { void handle('decline'); }}
          disabled={busy !== null}
          style={({ pressed }) => [
            styles.button,
            styles.secondary,
            {
              borderColor: theme.border,
              backgroundColor: theme.surface,
              opacity: busy !== null ? 0.7 : 1,
              transform: [{ scale: pressed && !busy ? 0.98 : 1 }],
            },
          ]}
        >
          {busy === 'decline' ? (
            <ActivityIndicator color={theme.textSecondary} size="small" />
          ) : (
            <Text style={[styles.buttonLabel, { color: theme.textSecondary }]}>
              {t('trips.declineInvite')}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => { void handle('accept'); }}
          disabled={busy !== null}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.accent,
              opacity: busy !== null ? 0.8 : 1,
              transform: [{ scale: pressed && !busy ? 0.98 : 1 }],
            },
          ]}
        >
          {busy === 'accept' ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={[styles.buttonLabel, { color: '#FFFFFF' }]}>
              {t('trips.acceptInvite')}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: sizing.radiusCard,
    borderWidth: borderWidth.base,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  emoji: { fontSize: 32 },
  meta: { flex: 1 },
  title: { ...typography.itemTitle },
  subtitle: { ...typography.secondary, marginTop: 2 },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    borderRadius: sizing.radiusButton,
    paddingVertical: spacing.md + 2, // 12 — taller button geometry
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    borderWidth: borderWidth.hairline,
  },
  buttonLabel: { fontSize: 14, fontWeight: '700' },
});
