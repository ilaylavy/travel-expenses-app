import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurrencyConverterCard } from '@/components/currency/CurrencyConverterCard';
import { TripCard } from '@/components/trip/TripCard';
import { SyncStatusDot } from '@/components/ui/SyncStatusDot';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
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

  useEffect(() => {
    if (isHydrated) void refresh();
  }, [isHydrated, refresh]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
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
            style={[
              styles.headerButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            hitSlop={8}
          >
            <Text style={styles.headerButtonText}>{isDark ? '🌙' : '☀️'}</Text>
          </Pressable>
        </View>
      </View>

      {!isHydrated ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <CurrencyConverterCard />

          {trips.length === 0 && (
            <View style={[styles.empty, { borderColor: theme.borderLight }]}>
              <Text style={styles.emptyEmoji}>🗺️</Text>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {t('trips.emptyTitle')}
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {t('trips.emptyBody')}
              </Text>
            </View>
          )}

          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onPress={() => router.push(href(`/trip/${trip.id}`))}
              onEdit={() => router.push(href(`/trip/${trip.id}/settings`))}
            />
          ))}

          <Pressable
            onPress={() => router.push(href('/new-trip'))}
            style={({ pressed }) => [styles.newCardWrapper, pressed && styles.newCardPressed]}
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
                <Text style={styles.newCardPlus}>＋</Text>
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: { fontSize: 16 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl },
  empty: {
    borderRadius: sizing.radiusCard,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: spacing.xxl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.sm },
  emptyTitle: { ...typography.itemTitle, marginBottom: 4 },
  emptyBody: { ...typography.secondary, textAlign: 'center' },
  newCardWrapper: { marginTop: spacing.sm },
  newCardPressed: { opacity: 0.85 },
  newCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderRadius: sizing.radiusCard,
    borderWidth: 1.5,
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
  newCardPlus: { fontSize: 28, fontWeight: '700', color: '#FFFFFF' },
  newCardText: { flex: 1 },
  newCardTitle: { ...typography.itemTitle, marginBottom: 2 },
  newCardSubtitle: typography.secondary,
});
