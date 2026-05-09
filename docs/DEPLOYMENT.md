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

## Web (any browser)

The web bundle is online-only — no SQLite, no offline mode. Reads/writes
go straight to Supabase. See `CLAUDE.md` for the architectural shape;
this section is just the deploy mechanics.

### One-time setup (per Supabase / GCP / EAS project)

1. **Maps JavaScript API** — in Google Cloud Console, enable
   "Maps JavaScript API" on the project that owns
   `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`. The Android/iOS Maps SDKs are
   separate APIs; enabling those is not enough for the web map.

2. **Storage CORS** — the `expense-photos` bucket needs to allow the
   web origin so signed-URL `<img>` loads and Storage uploads work.
   In the Supabase dashboard → Storage → Policies → CORS, add:
   - `http://localhost:8081` (dev)
   - `http://<your-LAN-IP>:8081` (phone-on-LAN dev)
   - The deployed origin (after first `eas deploy`)
   For dev convenience you can use `*` while iterating.

3. **Auth redirect URLs** (only relevant once OAuth/magic-link is
   wired up) — in Supabase dashboard → Authentication → URL
   Configuration, add the deployed origin to the allow list.

4. **EAS env vars** — the same `EXPO_PUBLIC_*` values used by
   native must be set on EAS so the web bundle picks them up at
   build time:
   ```bash
   eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value ...
   eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value ...
   eas env:create --environment preview --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value ...
   ```
   Repeat for `--environment production` if you ship a `--prod` deploy.

### Deploy

```bash
npm run deploy:web
```
This runs `expo export -p web` (produces `dist/`) then `eas deploy`
to upload it. The first run on a new project is interactive and
asks you to pick a project alias; subsequent runs deploy straight
to a preview URL.

To promote to a stable production URL:
```bash
expo export -p web && eas deploy --prod
```

EAS prints the deployed URL when the upload finishes. Open it in a
browser; the login screen renders, sign-in hits the same Supabase
project as native, and the user sees their trips and expenses.

### Limits to know about
- No offline mode. A flaky-connection web user gets errors instead
  of queued writes; the offline-first machinery only runs on native.
- No reverse geocoding. Web-attached expenses store coordinates with
  `placeName: null`. Edit the place name later or pick a location
  via the map.
- Photo uploads are non-atomic. If the upload fails after the parent
  expense is created, the row is saved without that photo and the
  staged blob is dropped on refresh. Acceptable for now; revisit if
  it bites real users.
