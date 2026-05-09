# Deployment & Updates Guide

## First time setup (already done)
- EAS is configured with preview and production profiles
- expo-updates is installed and configured

## Share the app with friends (Android)

Build a new APK:
```bash
eas build --platform android --profile preview
```
Wait for the build to complete. EAS will print a download URL.
Send that URL to friends — they open it on their Android phone and install the APK.

Note: they may need to enable "Install from unknown sources" in Android settings.

## Push an update (no new install needed)

After making code changes (JavaScript/TypeScript only — no new native libraries):
```bash
eas update --branch preview --message "describe what changed"
```
Friends will get the update automatically next time they open the app.

To force an immediate update check, users can kill and reopen the app.

## When do I need a new build vs just an update?

**OTA update works (eas update):**
- Changed any .tsx, .ts, .json file
- Updated styles, text, translations
- Fixed bugs in JavaScript code
- Changed API calls or business logic

**New build required (eas build):**
- Added or updated a native library (npm install + expo install)
- Changed app.json configuration (name, icon, splash, permissions)
- Changed native code or native modules
- Updated Expo SDK version
- Changed `app.config.ts` or any value it injects into the native manifest (e.g. Google Maps API key) — the manifest is baked into the APK at build time and OTA cannot replace it

## Adding a new secret to native config

`app.config.ts` is the one place where env vars get injected into native config (Android manifest, iOS Info.plist). Static `app.json` does NOT substitute env vars — placeholders like `"$EXPO_PUBLIC_FOO"` would land in the manifest as literal strings.

To wire up a new secret:

1. Add `EXPO_PUBLIC_FOO=...` to `.env` and `.env.example`.
2. Set it on EAS for each environment:
   ```bash
   eas env:create --environment preview --name EXPO_PUBLIC_FOO --value ...
   eas env:create --environment production --name EXPO_PUBLIC_FOO --value ...
   ```
3. In `app.config.ts`, call `requireEnv('EXPO_PUBLIC_FOO')` and merge the value into the appropriate `ios.config` / `android.config` field.
4. Run a fresh `eas build` — OTA cannot update the native manifest.

If a required env var is missing at build time, the build fails loudly with a clear error message rather than producing a broken APK.

## Check update status

```bash
# See all updates for a branch
eas update:list --branch preview

# See all builds
eas build:list
```

## Production (Play Store) — future

```bash
# Build for Play Store
eas build --platform android --profile production

# Submit to Play Store (requires service account key)
eas submit --platform android --profile production
```
