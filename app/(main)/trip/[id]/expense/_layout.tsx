import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';

export default function ExpenseLayout() {
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
