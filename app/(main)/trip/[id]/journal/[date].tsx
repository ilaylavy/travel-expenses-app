// Pushed Day screen — opened from All Days by tapping a day card. Shows
// the back button in its DateStrip so the user can return to the All Days
// list. The smart-routed Day screen (the tab root) uses showBackButton=false
// instead.

import { useLocalSearchParams } from 'expo-router';

import { DayScreen } from '@/components/journal/DayScreen';

export default function PushedDayScreen() {
  const params = useLocalSearchParams<{ id: string; date: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  const date = Array.isArray(params.date) ? params.date[0] : params.date ?? '';
  if (!tripId || !date) return null;
  return <DayScreen tripId={tripId} initialDayDate={date} showBackButton />;
}
