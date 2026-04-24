import type { Href } from 'expo-router';

// Cast helper for routes not yet present in the generated typed-routes file
// (Expo Router regenerates .expo/types/router.d.ts on the next dev-server run).
export function href(path: string): Href {
  return path as unknown as Href;
}
