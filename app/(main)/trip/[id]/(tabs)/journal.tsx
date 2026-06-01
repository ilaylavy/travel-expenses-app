// Smart router for the Journal tab. If the trip is currently active (today
// falls inside the trip window) we land directly on the Day screen for
// today; otherwise we land on All Days. The DayScreen rendered here has
// no back button — it's the tab root, not a pushed route.

import { useGlobalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { AllDaysScreen } from '@/components/journal/AllDaysScreen';
import { DayScreen } from '@/components/journal/DayScreen';
import { useTripStore } from '@/stores/tripStore';
import { todayIsoDate } from '@/utils/date';

export default function JournalScreen() {
  // useGlobalSearchParams returns parent dynamic segments — the [id] in
  // /trip/[id]/(tabs)/journal lives on the parent route, not the journal
  // segment, so useLocalSearchParams would return {}.
  const params = useGlobalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  const trip = useTripStore((s) => s.trips.find((t) => t.id === tripId) ?? null);

  const isTripActive = useMemo<boolean>(() => {
    if (!trip) return false;
    const today = todayIsoDate();
    if (today < trip.startDate) return false;
    if (trip.endDate && today > trip.endDate) return false;
    return true;
  }, [trip]);

  if (!trip) return null;

  const initialDay = isTripActive
    ? todayIsoDate()
    : (trip.endDate && todayIsoDate() > trip.endDate ? trip.endDate : trip.startDate);

  if (isTripActive) {
    return <DayScreen tripId={tripId} initialDayDate={initialDay} showBackButton={false} />;
  }
  return <AllDaysScreen tripId={tripId} />;
}
