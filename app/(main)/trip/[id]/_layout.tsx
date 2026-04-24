import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';

// Per-trip Stack: the (tabs) group is the default route. Settings and
// categories are sibling routes that live above the tab bar, pushed on top
// of the tabs when opened from the trip list or dashboard.
export default function TripLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg },
      }}
    />
  );
}
