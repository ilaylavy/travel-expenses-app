# CLAUDE.md — TRAVEL-EXPENSES-APP

## Project Overview

TRAVEL-EXPENSES-APP is a mobile expense tracker for travelers. Built with React Native (Expo), TypeScript, SQLite (local), and Supabase (backend). Users create trips, log expenses with location/currency/category, view spending on a map, see stats, share trips with a partner, and ask natural language questions about their data.

**Read `PRD.md` for full product requirements. Read `TECHNICAL_SPEC.md` for architecture details, database schema, and sync design. Read `DESIGN_SYSTEM.md` for all visual design specs, color tokens, component patterns, and theming.**

---

## Tech Stack

- **Framework:** React Native with Expo (SDK 52+), using Expo Router for file-based navigation
- **Language:** TypeScript (strict mode)
- **Local DB:** SQLite via `expo-sqlite` — all data is local-first
- **Backend:** Supabase (Postgres, Auth, Realtime, Storage, Edge Functions)
- **State:** Zustand for global state
- **Navigation:** Expo Router (file-based routing under `app/` directory)
- **Maps:** `react-native-maps` with Google Maps provider
- **Charts:** `victory-native`
- **AI:** OpenAI GPT-4o-mini via Supabase Edge Function (never call OpenAI directly from client)
- **Styling:** React Native StyleSheet. Both dark and light themes. All color tokens, spacing, typography, and component patterns defined in `DESIGN_SYSTEM.md` and implemented in `src/constants/theme.ts`
- **Internationalization:** `i18next` + `react-i18next` for translation, `expo-localization` for device-locale detection. Translation JSON files live in `src/i18n/locales/`. Supported languages: English (`en`) and Hebrew (`he`). Device language is auto-detected on first launch; users can override it in Settings.
- **RTL:** Hebrew switches the layout to right-to-left via `I18nManager.forceRTL()`. Every screen must work correctly in both LTR and RTL — prefer `flex-direction: row` (which mirrors automatically) and logical margins/paddings over hardcoded `left`/`right` positioning.

---

## MCP Servers

Supabase MCP is connected and scoped to this project. Use it to:
- Inspect the live database schema and data
- Verify migrations applied correctly
- Debug query issues against real data
- Generate TypeScript types from the schema
- Check RLS policies are working

Use the Supabase CLI (`npx supabase db push`) for applying migrations, and MCP tools for verification and debugging. When asked to check or debug database state, prefer MCP tools over writing one-off scripts.

---

## Installed Plugins & Skills

The following plugins are installed and available:

**Expo** — Use this for all Expo/React Native patterns: routing, navigation, build configuration, app store deployment, SDK upgrades. Follow Expo's recommended patterns, not generic React Native patterns.

**Supabase Agent Skill** — Use this for all Supabase work: schema changes, migrations, RLS policies, auth flows, Edge Functions, Realtime subscriptions, Storage. It includes security guardrails — follow them. Always run advisors before applying migrations.

**Supabase Postgres Best Practices** — Use this when writing or optimizing SQL queries, designing schema, or creating indexes. Follow its guidance on query patterns and performance.

**TypeScript LSP** — Active for real-time type checking. Fix type errors as they appear, don't defer them.

**Commit Commands** — Use for git workflows. After completing each feature, create a clean commit with a descriptive message.

**Security Hook** — Active and watching for security issues (XSS, injection, unsafe patterns). This project handles financial data and auth tokens — take every security warning seriously.

**Context7** — Available for pulling live documentation from Expo, Supabase, and other libraries. Use when you need to check the actual current API for a library instead of relying on training data.

---

## Project Structure

- `app/` — Expo Router screens. File = route. Groups: `(auth)` for login/signup, `(main)` for authenticated screens
- `src/components/` — Reusable UI components, organized by domain (`ui/`, `expense/`, `trip/`, `map/`, `stats/`, `chat/`)
- `src/db/` — Local SQLite layer: schema, migrations, query functions. All DB access goes through functions in `src/db/queries/`
- `src/sync/` — Sync engine: queue, push, pull, conflict resolution, realtime subscriptions
- `src/services/` — External integrations: Supabase client, auth, exchange rates, location, AI queries, photos
- `src/stores/` — Zustand stores: auth, trips, expenses, sync status, settings
- `src/hooks/` — Custom React hooks
- `src/utils/` — Pure utility functions (currency formatting, date helpers)
- `src/constants/` — Theme, default categories, currency list, config
- `src/types/` — TypeScript type definitions
- `supabase/` — Supabase migrations (SQL) and Edge Functions

---

## Key Architecture Decisions

### Offline-First
ALL reads and writes go to local SQLite first. The UI never waits for network. Sync runs in the background. If offline, changes queue and sync when connectivity returns. Never show loading spinners for local data.

### Sync
- Local writes → sync_queue table → background push to Supabase
- Remote changes → Supabase Realtime subscription → write to local SQLite
- Conflict resolution: last-write-wins based on `updated_at` timestamp
- Soft deletes everywhere (set `deleted_at`, never hard delete)

### AI Queries
Financial data NEVER leaves the device. The flow is:
1. Send question + schema + trip context to Edge Function
2. Edge Function asks OpenAI to generate a SQL query (SELECT only)
3. SQL comes back to the app, runs on local SQLite
4. Results sent back to Edge Function for natural language summary
5. Summary displayed to user

### Currency
Exchange rates cached locally. Rate locked into each expense at creation time (stored in `exchange_rate` column). This means historical expense values don't change when rates fluctuate.

---

## Coding Conventions

### TypeScript
- Strict mode enabled. No `any` types unless absolutely unavoidable (and add a comment explaining why).
- Use interfaces for object shapes, type aliases for unions/intersections.
- All function parameters and return types should be explicitly typed.
- Use `const` by default, `let` only when reassignment is needed, never `var`.

### React Native / Components
- Functional components only. No class components.
- Use hooks for all state and side effects.
- Component files: PascalCase (`ExpenseCard.tsx`). One component per file.
- Keep components small. If a component exceeds ~150 lines, extract sub-components.
- Use `StyleSheet.create()` for styles, defined at the bottom of the file.
- Avoid inline styles except for truly dynamic values (e.g., computed colors, widths).
- Follow Expo Router conventions for navigation and routing. Use file-based routes under `app/`.

### State Management
- Zustand stores for global state (auth, active trip, sync status).
- Local `useState` for UI-only state (form inputs, toggle visibility).
- Never put UI state in Zustand (modal open/closed, text input values).
- Database is the source of truth. Stores are hydrated from SQLite on app start.

### Database Access
- All SQLite queries go through functions in `src/db/queries/`.
- Never write raw SQL in components or screens.
- Query functions return typed objects, not raw rows.
- Every mutation (create/update/delete) must also write to `sync_queue`.
- Follow the Supabase Postgres Best Practices skill for query patterns.

### File Naming
- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts` starting with `use` (e.g., `useExpenseStats.ts`)
- Utils/services: `camelCase.ts`
- Types: `camelCase.ts`
- Constants: `camelCase.ts`
- SQL migrations: `NNN_description.sql` (e.g., `001_initial_schema.sql`)

### Imports
- Use absolute imports from `src/` (configure in `tsconfig.json` with path aliases: `@/components`, `@/db`, `@/services`, etc.)
- Group imports: React/RN first, then external libs, then internal (`@/`), then relative.

### Error Handling
- Wrap all async operations in try/catch.
- Database errors: log and show user-friendly message (never raw SQL errors).
- Network errors: silently queue for retry (offline-first — user should not notice).
- AI query errors: show "I couldn't understand that. Try rephrasing." — never expose raw errors.

### Git Workflow
- Use the commit-commands plugin for all git operations.
- Commit after each completed feature or meaningful unit of work.
- Commit messages: imperative mood, concise. E.g., "Add expense entry screen with numpad and category grid"
- Never commit `.env`, API keys, or secrets.

### Testing
- Focus on: database query functions, sync logic, currency conversion, date utilities.
- Use Jest for unit tests.
- Test files live next to source files: `currency.test.ts` next to `currency.ts`.

---

## Common Commands

```bash
# Start development server
npx expo start

# Run on Android emulator
npx expo run:android

# Run on iOS simulator (macOS only)
npx expo run:ios

# Run TypeScript type checking
npx tsc --noEmit

# Run linter
npx eslint . --ext .ts,.tsx

# Run tests
npx jest

# Supabase local development
npx supabase start
npx supabase db push        # push migrations to remote
npx supabase functions serve # run edge functions locally

# Build for production
eas build --platform android
eas build --platform ios
```

---

## When Working on Features

1. **Before coding:** Read the relevant section in `PRD.md` and `TECHNICAL_SPEC.md` to understand the full requirements.
1.5. **Every user-facing string goes through i18n.** Add new strings to both `src/i18n/locales/en.json` and `src/i18n/locales/he.json` (English values only for now, Hebrew will be filled in later — leave empty strings so they fall back to English). Consume them via `const { t } = useTranslation()` from `@/hooks/useTranslation` and `t('your.key')`. Never hardcode English in components.
2. **Start with types:** Define or update TypeScript types in `src/types/` first.
3. **Then data layer:** Write/update SQLite schema, migrations, and query functions.
4. **Then service layer:** Any new external service calls go in `src/services/`.
5. **Then store:** Update Zustand stores if the feature needs global state.
6. **Before building UI:** Read `DESIGN_SYSTEM.md` for component patterns, colors, spacing, and typography. Every screen must follow the design system precisely. Both dark and light modes must work.
7. **Then UI:** Build the screen/component, consuming the layers above and following the design system.
8. **Don't forget sync:** Every data mutation must include a sync_queue entry.
9. **Verify with MCP:** After database changes, use Supabase MCP to verify the migration applied correctly and RLS policies work.
10. **Commit:** Use commit-commands to make a clean commit after each working feature.

---

## Style Guide (UI)

**Read `DESIGN_SYSTEM.md` for the complete design system.** This is the authoritative reference for all visual design. Key highlights:

### Design Philosophy
The app should feel **colorful, playful, and alive** — not like a spreadsheet. Every category has its own color. Gradients add energy. Emojis add personality. Bold typography makes financial data scannable.

### Theming
- **Both dark and light mode** are supported. Dark is the default.
- All colors come from the theme object — NEVER hardcode color values in components.
- Implement with Zustand store (isDark toggle) + `useTheme()` hook.
- Every component must work correctly in both modes.
- Components use `StyleSheet.create()` for static styles, dynamic style objects for theme colors:
  ```
  <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
  ```

### Key Design Tokens (quick reference — see DESIGN_SYSTEM.md for full values)
- Card radius: 22px (outer), 18px (inner)
- Button/input radius: 14px
- Chip/badge radius: 22px
- Card padding: 18px
- Font weights: 800 for amounts, 700 for titles, 600 for labels, 500 for body
- FAB: 56x56, gradient background, floats 10px above nav bar with glow shadow
- Category icons: emoji in colored soft-background containers
- Gradients: used on hero cards, FAB, AI card, budget bars, CTAs — not on regular cards

### Category Colors
Each category maps to a specific color. This mapping is used everywhere: chips, icons, charts, map pins, borders.
- Food → orange, Transport → blue, Hotel → accent/purple, Flight → pink
- Coffee → yellow, Shopping → green, Activities → coral, Other → teal

### Navigation
- Bottom nav: 5 tabs with emoji icons (🏠 📋 ＋ 📍 📊)
- Active tab: accentSoft pill background, full-color emoji, accent-colored label
- Inactive tab: grayscale emoji, muted label
- Center FAB button with gradient, glow shadow, floats above nav

---

## Critical Paths — Pay Extra Attention

1. **Expense entry speed** — This is the most-used screen. Must be fast. No unnecessary re-renders. Numpad should feel instant.
2. **Sync reliability** — Data loss is unacceptable. The sync queue must be bulletproof. Every local write must succeed before UI updates. Sync errors must be retryable.
3. **Offline behavior** — The app must be fully functional without internet (except AI queries). Never show "no connection" errors for local operations. Never block UI on network requests.
4. **Currency accuracy** — Conversion must use the rate from the time of expense creation, not current rates. Rounding should be consistent (2 decimal places for display, 6 for stored rates).
5. **Security** — The security-hook plugin is active. API keys never in client code. Auth tokens in secure storage. Financial data stays on device (only schema goes to LLM). Follow all security warnings.

---

## Environment Setup

Required `.env` file at project root:
```
EXPO_PUBLIC_SUPABASE_URL=<your-supabase-url>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=<your-google-maps-key>
```

Supabase Edge Function secrets (set via Supabase dashboard or CLI):
```
OPENAI_API_KEY=<your-openai-key>
```

---

## Do NOT

- Do not call OpenAI directly from the client app. Always go through the Supabase Edge Function.
- Do not store API keys in client code or commit `.env` to git.
- Do not use `any` type without a justifying comment.
- Do not write raw SQL in component files. Use query functions from `src/db/queries/`.
- Do not show network loading states for local data operations.
- Do not hard-delete records. Always soft-delete by setting `deleted_at`.
- Do not skip the sync_queue when mutating data.
- Do not assume the user is online. Every feature (except AI) must work offline.
- Do not ignore security-hook warnings. Fix them before committing.
- Do not use generic React Native patterns when the Expo skill provides Expo-specific patterns.
- Do not hardcode color values in components. Always use the theme object via `useTheme()`.
- Do not build UI that only works in one theme mode. Both dark and light must work.
- Do not use line icons for navigation or categories. Use emojis as defined in the design system.
- Do not use flat card backgrounds. Use `cardGradient` from the theme for subtle depth.
- Do not use generic/plain styling. Follow `DESIGN_SYSTEM.md` precisely — the app should feel colorful and playful.
- Do not hardcode English strings in components. Always use translation keys via the `t()` function from `useTranslation()` (imported from `@/hooks/useTranslation`), and add the string to both `src/i18n/locales/en.json` and `src/i18n/locales/he.json`.
- Do not assume LTR layout. RTL is active whenever Hebrew is selected; avoid hardcoded `left`/`right` positioning or margins and prefer logical flex direction so components mirror correctly.