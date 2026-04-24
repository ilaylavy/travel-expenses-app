# CLAUDE.md — TRAVEL-EXPENSES-APP

## Project Overview

TRAVEL-EXPENSES-APP is a mobile expense tracker for travelers. Built with React Native (Expo), TypeScript, SQLite (local), and Supabase (backend). Users create trips, log expenses with location/currency/category, view spending on a map, see stats, share trips with a partner, and ask natural language questions about their data.

**Read `PRD.md` for full product requirements. Read `TECHNICAL_SPEC.md` for architecture details, database schema, and sync design.**

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
- **Styling:** React Native StyleSheet. Dark theme by default. Colors and spacing from `src/constants/theme.ts`

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
2. **Start with types:** Define or update TypeScript types in `src/types/` first.
3. **Then data layer:** Write/update SQLite schema, migrations, and query functions.
4. **Then service layer:** Any new external service calls go in `src/services/`.
5. **Then store:** Update Zustand stores if the feature needs global state.
6. **Then UI:** Build the screen/component last, consuming the layers above.
7. **Don't forget sync:** Every data mutation must include a sync_queue entry.
8. **Verify with MCP:** After database changes, use Supabase MCP to verify the migration applied correctly and RLS policies work.
9. **Commit:** Use commit-commands to make a clean commit after each working feature.

---

## Style Guide (UI)

### Theme Colors (dark mode default)
- Background: `#0F1117`
- Surface/cards: `#1A1D27` with `#2A2E3F` border
- Elevated cards: `#1E2130`
- Text primary: `#E8E9ED`
- Text secondary: `#8B8FA3`
- Text muted: `#5C6078`
- Accent (primary): `#6C5CE7` (purple)
- Accent light: `#A29BFE`
- Success/green: `#00B894`
- Error/red: `#FF6B6B`
- Warning/orange: `#FDCB6E`
- Info/blue: `#74B9FF`

### Spacing
- Base unit: 4px
- Standard padding: 16px
- Card padding: 16px
- Card border radius: 16px
- Button border radius: 12px
- Small element radius: 8px

### Typography
- Use system font (`-apple-system` / default RN)
- Headings: 28px bold (screen titles), 18px semibold (section titles), 14px semibold (card titles)
- Body: 14px regular
- Secondary: 13px regular
- Caption: 11-12px
- Numeric displays: 36-44px bold (amount displays)

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