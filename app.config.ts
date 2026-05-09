import 'dotenv/config';

import type { ConfigContext, ExpoConfig } from 'expo/config';

// Load `.env` ourselves (above) so this file works regardless of who invokes
// it — `npx expo config` auto-loads .env, but the EAS CLI's own pre-flight
// config evaluation does not. On the EAS cloud build there is no .env file
// and dotenv silently no-ops; env vars come from the EAS environment instead.

// Static `app.json` does NOT substitute env vars — placeholders like
// "$EXPO_PUBLIC_FOO" land in the native manifest as literal strings. This
// dynamic overlay is the one place where env vars get injected into native
// config (Android manifest, iOS Info.plist). To wire up a new secret:
//   1. Add EXPO_PUBLIC_FOO to .env and .env.example
//   2. eas env:create --environment preview --name EXPO_PUBLIC_FOO --value ...
//   3. Add a requireEnv('EXPO_PUBLIC_FOO') call below and merge it into the
//      right field. Then run a fresh `eas build` (OTA can't update manifest).
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing env var ${name}. Set it in .env locally and on EAS via 'eas env:create'.`,
    );
  }
  return value;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey = requireEnv('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');

  return {
    ...config,
    name: config.name ?? 'Travel Expenses',
    slug: config.slug ?? 'travel-expenses-app',
    ios: {
      ...config.ios,
      config: {
        ...config.ios?.config,
        googleMapsApiKey,
      },
    },
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: googleMapsApiKey,
        },
      },
    },
  };
};
