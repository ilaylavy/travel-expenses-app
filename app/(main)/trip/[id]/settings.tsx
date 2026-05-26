import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { MembersSection } from '@/components/trip/MembersSection';
import { TripForm, type TripFormValues } from '@/components/trip/TripForm';
import { KeyboardAwareWrapper } from '@/components/ui/KeyboardAwareWrapper';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import { useSyncStore } from '@/stores/syncStore';
import { useTripStore } from '@/stores/tripStore';
import { syncEngine } from '@/sync/syncEngine';
import { href } from '@/utils/nav';

function formatAgo(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return `${Math.round(diffHr / 24)}d`;
}

export default function TripSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;
  const user = useAuthStore((s) => s.user);
  const trip = useTripStore((s) => s.trips.find((t) => t.id === tripId));
  const updateTrip = useTripStore((s) => s.updateTrip);
  const updateMyBudget = useTripStore((s) => s.updateMyBudget);
  const deleteTrip = useTripStore((s) => s.deleteTrip);
  const syncStatus = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const pendingCount = useSyncStore((s) => s.pendingCount);

  const initial = useMemo<Partial<TripFormValues> | undefined>(
    () =>
      trip
        ? {
            name: trip.name,
            emoji: trip.emoji,
            startDate: trip.startDate,
            endDate: trip.endDate,
            baseCurrency: trip.baseCurrency,
            homeCurrency: trip.homeCurrency,
            budget: trip.budget,
          }
        : undefined,
    [trip],
  );

  if (!trip || !tripId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
        <View style={styles.missing}>
          <Text style={[styles.missingText, { color: theme.textSecondary }]}>
            {t('trips.notFound')}
          </Text>
          <Pressable
            onPress={() => router.replace(href('/(main)'))}
            style={[styles.linkButton, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.linkButtonText}>{t('trips.backToTrips')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = user?.id === trip.ownerId;

  const handleSyncNow = async (): Promise<void> => {
    await syncEngine.triggerSync();
    const state = useSyncStore.getState();
    if (state.status === 'error') {
      Alert.alert(
        t('sync.errorTitle'),
        state.lastError ?? t('sync.errorBody'),
      );
    } else {
      Alert.alert(t('sync.successTitle'), t('sync.successBody'));
    }
  };

  const syncSubtitle = (() => {
    if (syncStatus === 'syncing') return t('sync.syncing');
    if (pendingCount > 0) return t('sync.pending', { count: pendingCount });
    const ago = formatAgo(lastSyncedAt);
    if (ago) return t('sync.lastSynced', { time: ago });
    return t('sync.neverSynced');
  })();

  const handleSubmit = async (values: TripFormValues): Promise<void> => {
    // Trip metadata vs the active user's personal budget go to two different
    // tables now (trips vs trip_members). Update both, but the budget is
    // per-user so non-owners hitting Save still update only their own row.
    await updateTrip({
      id: trip.id,
      name: values.name,
      emoji: values.emoji,
      startDate: values.startDate,
      endDate: values.endDate,
      baseCurrency: values.baseCurrency,
      homeCurrency: values.homeCurrency,
    });
    if (values.budget !== trip.budget) {
      await updateMyBudget(trip.id, values.budget);
    }
    router.back();
  };

  const handleDelete = (): void => {
    Alert.alert(
      t('tripSettings.deleteConfirmTitle'),
      t('tripSettings.deleteConfirmBody', { name: trip.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTrip(trip.id);
              router.replace(href('/(main)'));
            } catch (e) {
              Alert.alert(
                t('tripSettings.deleteFailedTitle'),
                e instanceof Error ? e.message : t('tripSettings.unknownError'),
              );
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
          hitSlop={8}
        >
          <Icon name="chevron-left" size={18} color={theme.text} stroke={2} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('tripSettings.title')}</Text>
        <View style={styles.spacer} />
      </View>

      <KeyboardAwareWrapper>
      <TripForm
        initial={initial}
        monogramSeed={trip.id}
        displayCurrency={trip.homeCurrency}
        submitLabel={t('tripSettings.submit')}
        submittingLabel={t('tripSettings.submitting')}
        onSubmit={handleSubmit}
        footer={
          <>
            <Pressable
              onPress={() => { void handleSyncNow(); }}
              disabled={syncStatus === 'syncing'}
              style={({ pressed }) => [
                styles.syncButton,
                {
                  backgroundColor: theme.accentSoft,
                  borderColor: theme.accent,
                  opacity: syncStatus === 'syncing' ? 0.7 : 1,
                  transform: [
                    { scale: pressed && syncStatus !== 'syncing' ? 0.98 : 1 },
                  ],
                },
              ]}
            >
              <Text style={[styles.syncButtonLabel, { color: theme.accent }]}>
                {t('sync.syncNow')}
              </Text>
              <Text style={[styles.syncButtonSubtitle, { color: theme.textSecondary }]}>
                {syncSubtitle}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(href(`/trip/${trip.id}/balances`))}
              style={({ pressed }) => [
                styles.manageButton,
                {
                  backgroundColor: theme.accentSoft,
                  borderColor: theme.accent,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <Text style={[styles.manageText, { color: theme.accent }]}>
                {t('balances.openFromTrip')}
              </Text>
              <Text style={[styles.manageHint, { color: theme.textSecondary }]}>
                {t('balances.openFromTripSubtitle')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(href(`/trip/${trip.id}/categories`))}
              style={({ pressed }) => [
                styles.manageButton,
                {
                  backgroundColor: theme.accentSoft,
                  borderColor: theme.accent,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <Text style={[styles.manageText, { color: theme.accent }]}>
                {t('tripSettings.manageCategories')}
              </Text>
            </Pressable>
            <MembersSection tripId={trip.id} ownerId={trip.ownerId} />
            {isOwner && (
              <Pressable
                onPress={handleDelete}
                style={({ pressed }) => [
                  styles.deleteButton,
                  {
                    backgroundColor: theme.redSoft,
                    borderColor: theme.red,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                <Text style={[styles.deleteText, { color: theme.red }]}>
                  {t('tripSettings.deleteButton')}
                </Text>
              </Pressable>
            )}
          </>
        }
      />
      </KeyboardAwareWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  backButton: {
    width: sizing.headerButton,
    height: sizing.headerButton,
    borderRadius: sizing.headerButtonRadius,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // (formerly backButtonText — replaced by SVG chevron-left.)
  title: { ...typography.screenTitle, flex: 1 },
  spacer: { width: sizing.headerButton },
  syncButton: {
    marginTop: spacing.sm,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    paddingVertical: spacing.md + 2, // 12
    alignItems: 'center',
    gap: 2,
  },
  syncButtonLabel: { fontSize: 14, fontWeight: '700' },
  syncButtonSubtitle: { fontSize: 12, fontWeight: '500' },
  manageButton: {
    marginTop: spacing.sm,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    paddingVertical: 14, // button tall geometry
    alignItems: 'center',
    gap: 2,
  },
  manageText: { fontSize: 14, fontWeight: '700' },
  manageHint: { fontSize: 12, fontWeight: '500' },
  deleteButton: {
    marginTop: spacing.sm,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteText: { fontSize: 14, fontWeight: '700' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.base },
  missingText: typography.body,
  linkButton: { borderRadius: sizing.radiusButton, paddingHorizontal: spacing.xl, paddingVertical: spacing.md + 2 },
  linkButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
