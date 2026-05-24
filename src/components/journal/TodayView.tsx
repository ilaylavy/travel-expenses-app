// Today (single-day) view stub. The full timeline implementation is added in
// Task 2.5 — for now just an ActivityIndicator so the tab boots cleanly.

import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export function TodayView(_: { tripId: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={theme.accent} />
    </View>
  );
}
