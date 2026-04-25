import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTripStore } from '@/stores/tripStore';
import { href } from '@/utils/nav';

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!isInitialized) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace(href('/(main)'));
    }
  }, [isInitialized, session, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const theme = useTheme();
  const isDark = useSettingsStore((s) => s.isDark);
  const isSettingsHydrated = useSettingsStore((s) => s.isHydrated);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const isAuthInitialized = useAuthStore((s) => s.isInitialized);
  const initializeAuth = useAuthStore((s) => s.initialize);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const hydrateTrips = useTripStore((s) => s.hydrate);
  const hydrateCategories = useCategoryStore((s) => s.hydrate);

  useEffect(() => {
    void hydrateSettings();
    void initializeAuth();
  }, [hydrateSettings, initializeAuth]);

  // Re-run on every sign-in: sign-out resets the stores' isHydrated flag, and
  // a one-time mount effect would never fire again to rehydrate them.
  useEffect(() => {
    if (!userId) return;
    void hydrateTrips();
    void hydrateCategories();
  }, [userId, hydrateTrips, hydrateCategories]);

  const ready = isSettingsHydrated && isAuthInitialized;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.bg }}>
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        {ready ? (
          <AuthGate>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(main)" />
            </Stack>
          </AuthGate>
        ) : (
          <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
