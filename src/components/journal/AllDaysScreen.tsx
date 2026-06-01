// All Days view — the trip-level overview. TripCoverBanner at the top
// (long-press to change cover), then a vertical scroll of DayCards
// (newest day first per the spec, but the SQL was flipped to ASC per
// Lesson #3 so Day 1 comes first). Tapping any day pushes the Day screen
// for that date with a back button.

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayCard } from './DayCard';
import { TripCoverBanner } from './TripCoverBanner';
import { TripCoverPicker } from './TripCoverPicker';
import * as tripsQueries from '@/db/queries/trips';
import { useDaySummaries } from '@/hooks/useDaySummaries';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useTripCover } from '@/hooks/useTripCover';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTripStore } from '@/stores/tripStore';
import { href } from '@/utils/nav';

interface Props {
  tripId: string;
}

export function AllDaysScreen({ tripId }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const trip = useTripStore((s) => s.trips.find((tr) => tr.id === tripId) ?? null);
  const hydrateTrips = useTripStore((s) => s.hydrate);
  const { summaries, isLoading, reload: reloadSummaries } = useDaySummaries(tripId);
  const coverStoragePath = useTripCover(tripId);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);

  // Re-fetch every time the screen comes back into focus. The user might
  // have edited an expense's date (or a photo entry's occurredAt) on the
  // Day screen, which moves it to a different day card — `summaries` is
  // stale until we reload. Also makes sure newly-synced realtime changes
  // are reflected when the user comes back from another tab.
  useFocusEffect(
    useCallback(() => {
      void reloadSummaries();
    }, [reloadSummaries]),
  );

  // Same idea for the local expense store — pull the latest expenses so a
  // spread-expense added on the Day screen (or a date edit) re-flows into
  // the per-day totals on this screen's cards.
  const loadExpensesForTrip = useExpenseStore((s) => s.loadForTrip);
  useFocusEffect(
    useCallback(() => {
      if (tripId) void loadExpensesForTrip(tripId);
    }, [tripId, loadExpensesForTrip]),
  );

  const totalSpent = useMemo(
    () => summaries.reduce((acc, s) => acc + s.totalConvertedAmount, 0),
    [summaries],
  );
  const photoCountTotal = useMemo(
    () => summaries.reduce((acc, s) => acc + s.photoCount, 0),
    [summaries],
  );

  if (!trip) return null;
  const dayTotal = summaries.length > 0 ? summaries.length : null;

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.bg }]}>
      <FlatList
        data={summaries}
        keyExtractor={(s) => s.dayDate}
        renderItem={({ item }) => (
          <DayCard
            summary={item}
            homeCurrency={trip.homeCurrency}
            dayTotal={dayTotal}
            onPress={() => router.push(href(`/trip/${tripId}/journal/${item.dayDate}`))}
          />
        )}
        // Lesson #11: cap eager render so we don't fan out 40+ signed-URL
        // fetches for off-screen day covers on cold mount.
        initialNumToRender={8}
        windowSize={5}
        ListHeaderComponent={
          <TripCoverBanner
            tripName={trip.name}
            startDate={trip.startDate}
            endDate={trip.endDate}
            dayCount={summaries.length}
            totalSpent={totalSpent}
            photoCount={photoCountTotal}
            homeCurrency={trip.homeCurrency}
            coverStoragePath={coverStoragePath}
            onChangeCover={() => setCoverPickerOpen(true)}
          />
        }
        ListHeaderComponentStyle={styles.headerWrap}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={[styles.empty, { borderColor: theme.border }]}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                {t('journal.emptyDay')}
              </Text>
            </View>
          )
        }
        contentContainerStyle={styles.list}
      />
      <TripCoverPicker
        visible={coverPickerOpen}
        tripId={tripId}
        currentStoragePath={trip.coverPhotoStoragePath ?? null}
        onDismiss={() => setCoverPickerOpen(false)}
        onPick={async (storagePath) => {
          setCoverPickerOpen(false);
          try {
            await tripsQueries.setTripCoverPhoto(tripId, storagePath);
            // Refresh the trip store so the banner picks up the new cover
            // path immediately (useTripCover keys off trip.coverPhotoStoragePath).
            await hydrateTrips();
            await reloadSummaries();
          } catch (e) {
            console.warn('AllDaysScreen setTripCoverPhoto failed:', e);
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerWrap: { marginBottom: 16 },
  list: { paddingBottom: 120, paddingHorizontal: 12 },
  empty: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    padding: 28,
    alignItems: 'center',
    marginTop: 24,
  },
  emptyText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
});
