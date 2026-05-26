import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

import { Card, Divider, Row, SectionHeader } from './SettingsPrimitives';

export type SyncSectionStatus = 'idle' | 'pending' | 'syncing' | 'error';

export function SyncSection({
  status,
  pendingCount,
  lastSyncedLabel,
  onSyncNow,
}: {
  status: SyncSectionStatus;
  pendingCount: number;
  lastSyncedLabel: string;
  onSyncNow: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  const dotColor = (() => {
    if (status === 'error') return theme.red;
    if (status === 'syncing' || status === 'pending' || pendingCount > 0) return theme.orange;
    return theme.green;
  })();

  const statusLabel = (() => {
    if (status === 'error') return t('settings.sync.statusError');
    if (status === 'syncing') return t('sync.syncing');
    if (pendingCount > 0) return t('settings.sync.statusPending');
    return t('settings.sync.statusSynced');
  })();

  return (
    <>
      <SectionHeader label={t('settings.sync.section')} />
      <Card>
        <Row
          label={t('settings.sync.status')}
          right={
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: dotColor }]} />
              <Text style={[styles.valueText, { color: theme.text }]}>{statusLabel}</Text>
            </View>
          }
        />
        <Divider />
        <Row
          label={t('settings.sync.lastSynced')}
          right={
            <Text style={[styles.valueText, { color: theme.textSecondary }]}>
              {lastSyncedLabel}
            </Text>
          }
        />
        <Divider />
        <Row
          label={t('settings.sync.pendingChanges')}
          right={
            <Text style={[styles.valueText, { color: theme.text }]}>{pendingCount}</Text>
          }
        />
        <Pressable
          onPress={onSyncNow}
          disabled={status === 'syncing'}
          style={({ pressed }) => [
            styles.syncButton,
            {
              backgroundColor: theme.accentSoft,
              borderColor: theme.accent,
              opacity: status === 'syncing' ? 0.7 : 1,
              transform: [
                { scale: pressed && status !== 'syncing' ? 0.98 : 1 },
              ],
            },
          ]}
        >
          <Icon name="sync" size={15} color={theme.accent} stroke={2} />
          <Text style={[styles.syncButtonText, { color: theme.accent }]}>
            {t('sync.syncNow')}
          </Text>
        </Pressable>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: sizing.radiusPill },
  valueText: { ...typography.body, fontWeight: '500' },
  syncButton: {
    marginVertical: spacing.md,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    paddingVertical: spacing.md + 2, // 12 — button tall geometry
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  syncButtonText: { fontSize: 14, fontWeight: '700' },
});
