import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurrencyConverterCard } from '@/components/currency/CurrencyConverterCard';
import { Icon } from '@/components/Icon';
import { PendingInviteCard } from '@/components/trip/PendingInviteCard';
import { TripCard } from '@/components/trip/TripCard';
import { TripCardSkeleton } from '@/components/trip/TripCardSkeleton';
import { SyncStatusDot } from '@/components/ui/SyncStatusDot';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { getProfileName } from '@/db/queries/profiles';
import {
  acceptInvite as dbAcceptInvite,
  declineInvite as dbDeclineInvite,
  listPendingInvitesForUser,
  type PendingInvite,
} from '@/db/queries/tripMembers';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTripStore } from '@/stores/tripStore';
import { syncEngine } from '@/sync/syncEngine';
import { href } from '@/utils/nav';

export default function TripListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const trips = useTripStore((s) => s.trips);
  const isHydrated = useTripStore((s) => s.isHydrated);
  const refresh = useTripStore((s) => s.refresh);
  const isDark = useSettingsStore((s) => s.isDark);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [inviterNames, setInviterNames] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const reloadInvites = useCallback(async (): Promise<void> => {
    if (!userId) {
      setPendingInvites([]);
      return;
    }
    const invites = await listPendingInvitesForUser(userId);
    setPendingInvites(invites);
    const names: Record<string, string> = {};
    await Promise.all(
      invites.map(async (i) => {
        const n = await getProfileName(i.trip.ownerId);
        if (n) names[i.trip.ownerId] = n;
      }),
    );
    setInviterNames(names);
  }, [userId]);

  const handleRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      await syncEngine.triggerSync();
      await refresh();
      await reloadInvites();
    } finally {
      setRefreshing(false);
    }
  }, [refresh, reloadInvites]);

  useEffect(() => {
    if (isHydrated) void refresh();
  }, [isHydrated, refresh]);

  useEffect(() => {
    void reloadInvites();
  }, [reloadInvites, trips]);

  const handleAccept = useCallback(async (invite: PendingInvite): Promise<void> => {
    await dbAcceptInvite(invite.member.id);
    void syncEngine.triggerSync();
    await reloadInvites();
    await refresh();
  }, [reloadInvites, refresh]);

  const handleDecline = useCallback(async (invite: PendingInvite): Promise<void> => {
    await dbDeclineInvite(invite.member.id);
    void syncEngine.triggerSync();
    await reloadInvites();
  }, [reloadInvites]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{t('trips.title')}</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => { void syncEngine.triggerSync(); }}
            style={[
              styles.headerButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            hitSlop={8}
          >
            <SyncStatusDot />
          </Pressable>
          <Pressable
            onPress={toggleTheme}
            accessibilityRole="button"
            accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={[
              styles.headerButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            hitSlop={8}
          >
            <Icon name={isDark ? 'moon' : 'sun'} size={16} color={theme.textSecondary} stroke={1.8} />
          </Pressable>
          <Pressable
            onPress={() => router.push(href('/settings'))}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={[
              styles.headerButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            hitSlop={8}
          >
            <Icon name="settings" size={16} color={theme.textSecondary} stroke={1.8} />
          </Pressable>
        </View>
      </View>

      {!isHydrated ? (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          <TripCardSkeleton />
          <TripCardSkeleton />
          <TripCardSkeleton />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
        >
          <CurrencyConverterCard />

          {pendingInvites.length > 0 ? (
            <View style={styles.invitesSection}>
              <Text style={[styles.invitesHeading, { color: theme.textMuted }]}>
                {t('trips.pendingInvites')}
              </Text>
              {pendingInvites.map((invite) => (
                <PendingInviteCard
                  key={invite.member.id}
                  invite={invite}
                  inviterName={inviterNames[invite.trip.ownerId] ?? null}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                />
              ))}
            </View>
          ) : null}

          {trips.length === 0 && pendingInvites.length === 0 ? (
            <View style={[styles.empty, { borderColor: theme.border }]}>
              <View style={[styles.emptyGlow, { backgroundColor: theme.accentSoft }]}>
                <Icon name="map-pin" size={32} color={theme.accent} stroke={1.8} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {t('trips.emptyTitle')}
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {t('trips.emptyBody')}
              </Text>
              <Pressable
                onPress={() => router.push(href('/new-trip'))}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.emptyCta,
                  {
                    backgroundColor: theme.accentSoft,
                    borderColor: theme.accent,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
              >
                <Icon name="plus" size={14} color={theme.accent} stroke={2.2} />
                <Text style={[styles.emptyCtaText, { color: theme.accent }]}>
                  {t('trips.newTripCardTitle')}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onPress={() => router.push(href(`/trip/${trip.id}`))}
              onEdit={() => router.push(href(`/trip/${trip.id}/settings`))}
            />
          ))}

          {trips.length > 0 ? (
            <Pressable
              onPress={() => router.push(href('/new-trip'))}
              style={({ pressed }) => [
                styles.newCardWrapper,
                { transform: [{ scale: pressed ? 0.99 : 1 }] },
              ]}
            >
              <View
                style={[
                  styles.newCard,
                  { borderColor: theme.accent, backgroundColor: theme.surface },
                ]}
              >
                <LinearGradient
                  colors={theme.fabGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.newCardIcon}
                >
                  <Icon name="plus" size={26} color="#FFFFFF" stroke={2.4} />
                </LinearGradient>
                <View style={styles.newCardText}>
                  <Text style={[styles.newCardTitle, { color: theme.text }]}>
                    {t('trips.newTripCardTitle')}
                  </Text>
                  <Text style={[styles.newCardSubtitle, { color: theme.textSecondary }]}>
                    {t('trips.newTripCardSubtitle')}
                  </Text>
                </View>
              </View>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: typography.title,
  headerButton: {
    width: sizing.headerButton,
    height: sizing.headerButton,
    borderRadius: sizing.headerButtonRadius,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // (formerly headerButtonText — replaced by SVG icons.)
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl },
  invitesSection: {
    marginBottom: spacing.lg,
  },
  invitesHeading: {
    ...typography.micro,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  empty: {
    borderRadius: sizing.radiusCard,
    borderWidth: borderWidth.hairline,
    borderStyle: 'dashed',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  emptyGlow: {
    width: 72,
    height: 72,
    borderRadius: sizing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2, // optical
  },
  emptyTitle: { ...typography.itemTitle, marginBottom: 0 },
  emptyBody: { ...typography.secondary, textAlign: 'center' },
  emptyCta: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: sizing.radiusPill,
    borderWidth: borderWidth.hairline,
  },
  emptyCtaText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  newCardWrapper: { marginTop: spacing.sm },
  newCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderRadius: sizing.radiusCard,
    borderWidth: borderWidth.hairline,
    borderStyle: 'dashed',
    padding: spacing.xl,
  },
  newCardIcon: {
    width: sizing.categoryIconLarge,
    height: sizing.categoryIconLarge,
    borderRadius: sizing.radiusCardInner,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newCardText: { flex: 1 },
  newCardTitle: { ...typography.itemTitle, marginBottom: 2 },
  newCardSubtitle: typography.secondary,
});
