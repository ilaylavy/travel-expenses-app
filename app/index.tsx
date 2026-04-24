import { Redirect } from 'expo-router';

import { useAuthStore } from '@/stores/authStore';

export default function Index() {
  const session = useAuthStore((s) => s.session);
  if (session) return <Redirect href="/(main)/(tabs)/dashboard" />;
  return <Redirect href="/(auth)/login" />;
}
