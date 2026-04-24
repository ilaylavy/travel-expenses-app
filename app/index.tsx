import { Redirect } from 'expo-router';

import { useAuthStore } from '@/stores/authStore';
import { href } from '@/utils/nav';

export default function Index() {
  const session = useAuthStore((s) => s.session);
  if (session) return <Redirect href={href('/(main)')} />;
  return <Redirect href="/(auth)/login" />;
}
