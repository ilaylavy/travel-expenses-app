# TRAVEL-EXPENSES-APP — Technical Specification

**Version:** 1.0 (MVP)
**Last Updated:** April 2026

---

## 1. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React Native + Expo | SDK 52+ |
| Language | TypeScript | 5.x |
| Local Database | SQLite | expo-sqlite |
| Backend | Supabase | (Postgres + Auth + Realtime + Storage + Edge Functions) |
| Auth | Supabase Auth | Email/password, Google OAuth, Apple OAuth |
| Maps | Google Maps | react-native-maps |
| AI/LLM | OpenAI GPT-4o-mini | via Supabase Edge Function proxy |
| Charts | victory-native | 41.x |
| Navigation | React Navigation | 7.x |
| State Management | Zustand | 5.x |
| Styling | React Native StyleSheet + Nativewind (optional) | — |
| Photo Handling | expo-image-picker | — |
| Location | expo-location | — |
| Sharing | expo-sharing + react-native share | — |
| Secure Storage | expo-secure-store | — |
| Exchange Rates | exchangerate.host API | Free tier |
| Internationalization | i18next + react-i18next | 26.x / 17.x |
| Locale Detection | expo-localization | 17.x |

---

## 2. Project Structure

```
TRAVEL-EXPENSES-APP/
├── app/                          # Expo Router screens (file = route)
│   ├── _layout.tsx               # Root layout
│   ├── index.tsx                 # Entry point / redirect
│   ├── (auth)/                   # Auth group
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── signup.tsx
│   └── (main)/                   # Authenticated group
│       ├── _layout.tsx
│       ├── index.tsx             # Trip list (home)
│       ├── add-expense.tsx       # Add/edit expense screen (orchestrator)
│       ├── new-trip.tsx
│       ├── settings.tsx          # App settings (orchestrator)
│       ├── categories.tsx        # Default-categories list
│       └── trip/[id]/            # Per-trip Stack
│           ├── _layout.tsx
│           ├── settings.tsx      # Edit-trip screen
│           ├── (tabs)/           # Bottom tab navigator
│           │   ├── _layout.tsx
│           │   ├── index.tsx     # Expenses (list + filters + stats strip)
│           │   ├── map.tsx       # Map (filters + clustering)
│           │   ├── ask.tsx       # AI chat
│           │   └── stats.tsx
│           ├── expense/          # Expense detail stack
│           │   ├── _layout.tsx
│           │   └── [expenseId].tsx
│           └── categories/       # Per-trip category management
│               ├── _layout.tsx
│               ├── index.tsx
│               ├── new.tsx
│               └── [categoryId].tsx
├── src/
│   ├── components/               # Reusable UI components, organized by domain
│   │   ├── ui/                   # Generic primitives (FilterModal, FilterPill, KeyboardAwareWrapper, …)
│   │   ├── chat/                 # AI chat (ChatBubble, FollowUpChips, MessageInput, EmptyState)
│   │   ├── currency/             # CurrencyPickerModal, RateOverrideChip, CurrencyConverterCard
│   │   ├── expense/
│   │   │   ├── card/             # ExpenseCard, SwipeableExpenseCard, LoggedByBadge
│   │   │   ├── category/         # CategoryGrid, CategoryForm
│   │   │   ├── detail/           # ExpenseHero, FieldCard, PhotoThumb, ExpensePhotosSection, ExpenseSplitBreakdown
│   │   │   ├── entry/            # 11 components powering add-expense.tsx (AmountSection, NoteSuggestionsRow, …)
│   │   │   ├── list/             # ExpenseFilterChips (shared with the map screen)
│   │   │   ├── numpad/           # NumPad, NumericPadField
│   │   │   ├── photo/            # PhotoGalleryModal
│   │   │   └── stats/            # ExpenseStatsStrip
│   │   ├── map/                  # ExpensePin, ExpensePopup, TrackedMarker
│   │   ├── settings/             # 6 section components + SettingsPrimitives
│   │   ├── stats/                # CategoryBreakdownCard, DailySpendingChart, …
│   │   └── trip/                 # TripCard, TripForm, PendingInviteCard, MembersSection/ (folder)
│   ├── db/                       # Local SQLite layer
│   │   ├── database.ts           # Connection + initialization
│   │   ├── schema.ts             # Table definitions
│   │   ├── migrations.ts         # Schema versioning
│   │   └── queries/              # One file per entity (CRUD lives here, sync_queue writes alongside)
│   │       ├── categories.ts
│   │       ├── exchangeRates.ts
│   │       ├── expenseAnalytics.ts   # getRecentNotes, lastUsedPaymentMethodForTrip, categoryUsageForTrip
│   │       ├── expenses.ts           # CRUD only — slimmed in Phase 3
│   │       ├── expensePhotos.ts      # Photo helpers + insertPhoto used by createExpense
│   │       ├── expenseSplits.ts
│   │       ├── profiles.ts
│   │       ├── syncQueue.ts          # enqueueSync — invariant API; called by every mutation
│   │       ├── tripMembers.ts
│   │       └── trips.ts
│   ├── sync/                     # Sync engine
│   │   ├── syncEngine.ts         # Orchestrator (debounced push/pull cycle)
│   │   ├── syncQueue.ts          # Pending-entries iteration helpers
│   │   ├── pushChanges.ts        # Push local → remote (drains sync_queue)
│   │   ├── pullChanges.ts        # Pull remote → local (cursor-based)
│   │   ├── conflictResolver.ts   # Last-write-wins + per-table apply functions
│   │   ├── realtimeSubscription.ts   # Supabase Realtime listener
│   │   ├── reconcileDefaults.ts  # Backfill / default-category remap
│   │   ├── typeCoercion.ts       # asString/asNumber/asBoolInt + BOOL_FIELDS_BY_TABLE
│   │   └── errorUtils.ts
│   ├── services/                 # External integrations (supabase, auth, exchangeRates, location, photo, aiQuery)
│   ├── stores/                   # Zustand stores (auth, trip, category, expense, settings, sync)
│   ├── hooks/                    # useExchangeRate, useExpenseEntryForm, usePhotoCapture, useExpenseClustering, useExpenseShareGetter, useTheme, useTranslation, useDismissKeyboard
│   ├── utils/                    # Pure helpers
│   │   ├── balance.ts            # computeBalance — split-aware shares + pairwise settlement
│   │   ├── category/             # color.ts, name.ts, index.ts (re-exports)
│   │   ├── currency/             # format.ts, index.ts
│   │   ├── date.ts               # formatDay, formatReadableDate, countDaysInRange, …
│   │   ├── expenseGrouping.ts    # SectionList grouping + spread expansion
│   │   ├── id.ts, initials.ts, nav.ts
│   │   ├── mapCluster.ts         # Pure clustering algorithm
│   │   ├── share/                # balance.ts (split share calc), system.ts (system share sheet)
│   │   └── statsAggregations.ts
│   ├── constants/                # categories, currencies, theme, config
│   ├── i18n/                     # i18next init + en.json / he.json
│   └── types/                    # Entity + Row types per table (expense.ts, trip.ts, category.ts, profile.ts, exchangeRate.ts, sync.ts)
├── supabase/
│   ├── migrations/               # Database migrations (SQL)
│   ├── functions/                # Edge Functions (ai-query, exchange-rates)
│   └── seed.sql
├── assets/
├── docs/                         # PRD, TECHNICAL_SPEC, DESIGN_SYSTEM, DEPLOYMENT
├── CLAUDE.md                     # Claude Code project instructions (root, by convention)
├── jest.config.js                # Jest + ts-jest config
├── app.json, eas.json            # Expo + EAS config
├── tsconfig.json
├── package.json
└── .env                          # Environment variables (not committed)
```

---

## 3. Database Schema

### 3.1 Supabase (PostgreSQL) — Remote

```sql
-- Users (extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar_url TEXT,
    default_currency TEXT NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trips
CREATE TABLE public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '✈️',
    start_date DATE NOT NULL,
    end_date DATE,  -- NULL = ongoing trip
    base_currency TEXT NOT NULL,
    home_currency TEXT NOT NULL,
    budget DECIMAL(12,2),
    owner_id UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ  -- soft delete
);

-- Trip Members
CREATE TABLE public.trip_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    joined_at TIMESTAMPTZ,
    UNIQUE(trip_id, user_id)
);

-- Categories
CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,  -- NULL = global default
    created_by UUID REFERENCES public.profiles(id),
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expenses
CREATE TABLE public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    amount DECIMAL(12,2) NOT NULL,  -- in original currency (negative for refunds)
    currency TEXT NOT NULL,
    converted_amount DECIMAL(12,2) NOT NULL,  -- in home currency
    exchange_rate DECIMAL(12,6) NOT NULL,
    category_id UUID NOT NULL REFERENCES public.categories(id),
    note TEXT,
    payment_method TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    place_name TEXT,
    expense_date DATE NOT NULL,
    expense_time TIME NOT NULL,
    is_refund BOOLEAN NOT NULL DEFAULT false,
    is_excluded_from_daily_metrics BOOLEAN NOT NULL DEFAULT false,
    is_private BOOLEAN NOT NULL DEFAULT false,  -- shared-trip privacy
    is_split BOOLEAN NOT NULL DEFAULT false,    -- decomposed via expense_splits
    spread_start_date DATE,  -- NULL = no spread
    spread_end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ  -- soft delete
);

-- Expense Splits (per-expense decomposition for shared trips)
CREATE TABLE public.expense_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    amount DECIMAL(12,2) NOT NULL,
    is_payer BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(expense_id, user_id)
);

-- Expense Photos
CREATE TABLE public.expense_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,  -- path in Supabase Storage
    local_uri TEXT,  -- local file path (for sync)
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exchange Rate Cache
CREATE TABLE public.exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency TEXT NOT NULL,
    target_currency TEXT NOT NULL,
    rate DECIMAL(12,6) NOT NULL,
    fetched_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(base_currency, target_currency, fetched_date)
);

-- Indexes
CREATE INDEX idx_expenses_trip_id ON public.expenses(trip_id);
CREATE INDEX idx_expenses_category_id ON public.expenses(category_id);
CREATE INDEX idx_expenses_date ON public.expenses(expense_date);
CREATE INDEX idx_expenses_user_id ON public.expenses(user_id);
CREATE INDEX idx_trip_members_trip_id ON public.trip_members(trip_id);
CREATE INDEX idx_trip_members_user_id ON public.trip_members(user_id);
CREATE INDEX idx_categories_trip_id ON public.categories(trip_id);
CREATE INDEX idx_expense_splits_expense_id ON public.expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user_id ON public.expense_splits(user_id);
```

### 3.2 Local SQLite — Mirrors remote + sync tables

The local schema mirrors the remote exactly, plus:

```sql
-- Sync queue (local only)
CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,  -- 'trips', 'expenses', 'categories', etc.
    record_id TEXT NOT NULL,   -- UUID of the record
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    payload TEXT NOT NULL,     -- JSON of the record data
    created_at TEXT NOT NULL,
    synced_at TEXT,            -- NULL until synced
    error TEXT                 -- last sync error, if any
);

-- Sync metadata (local only)
CREATE TABLE sync_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- Stores: last_sync_timestamp, sync_status, etc.
```

---

## 4. Row Level Security (RLS) Policies

```sql
-- Profiles: users can read/update only their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trips: users can see trips they own or are members of
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their trips" ON public.trips FOR SELECT USING (
    owner_id = auth.uid() OR id IN (SELECT trip_id FROM public.trip_members WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create trips" ON public.trips FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Trip members can update" ON public.trips FOR UPDATE USING (
    owner_id = auth.uid() OR id IN (SELECT trip_id FROM public.trip_members WHERE user_id = auth.uid())
);
CREATE POLICY "Only owner can delete" ON public.trips FOR DELETE USING (owner_id = auth.uid());

-- Expenses: visible to trip members
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trip members can view expenses" ON public.expenses FOR SELECT USING (
    trip_id IN (
        SELECT id FROM public.trips WHERE owner_id = auth.uid()
        UNION
        SELECT trip_id FROM public.trip_members WHERE user_id = auth.uid()
    )
);
CREATE POLICY "Trip members can create expenses" ON public.expenses FOR INSERT WITH CHECK (
    trip_id IN (
        SELECT id FROM public.trips WHERE owner_id = auth.uid()
        UNION
        SELECT trip_id FROM public.trip_members WHERE user_id = auth.uid()
    )
);
CREATE POLICY "Trip members can update expenses" ON public.expenses FOR UPDATE USING (
    trip_id IN (
        SELECT id FROM public.trips WHERE owner_id = auth.uid()
        UNION
        SELECT trip_id FROM public.trip_members WHERE user_id = auth.uid()
    )
);
CREATE POLICY "Trip members can delete expenses" ON public.expenses FOR DELETE USING (
    trip_id IN (
        SELECT id FROM public.trips WHERE owner_id = auth.uid()
        UNION
        SELECT trip_id FROM public.trip_members WHERE user_id = auth.uid()
    )
);

-- Similar policies for categories, expense_photos, trip_members
```

---

## 5. Sync Architecture

### Flow

```
User action (add expense)
    → Write to local SQLite
    → Insert into sync_queue (action: 'create')
    → Update UI immediately (from local DB)
    → Background: process sync_queue
        → If online: POST to Supabase REST API
            → On success: mark sync_queue entry as synced
            → On failure: keep in queue, increment retry count
        → If offline: queue stays, processed when connectivity returns

Remote change (partner adds expense in shared trip)
    → Supabase Realtime subscription fires
    → App receives the change event
    → Write to local SQLite
    → UI reactively updates (Zustand store triggers re-render)
```

### Sync Table Order

Tables push and pull in dependency order so foreign-key parents land before children:

```
profiles → trips → trip_members → categories → expenses → expense_splits → expense_photos
```

### Conflict Resolution

For MVP, last-write-wins based on `updated_at` timestamp:
1. When pushing local changes, include `updated_at` in the payload
2. Server-side: if incoming `updated_at` > existing `updated_at`, accept the change
3. If incoming `updated_at` <= existing `updated_at`, reject (someone else updated it more recently)
4. Rejected changes: pull the latest version from server and update local DB

### Sync Status

Zustand `syncStore` holds:
- `status`: 'synced' | 'pending' | 'error'
- `pendingCount`: number of unsynced changes
- `lastSyncedAt`: timestamp
- `lastError`: string | null

---

## 6. AI Query Architecture

### Edge Function: `ai-query`

The AI assistant runs entirely server-side. Postgres is the source of truth, and the Edge Function does context gathering, SQL generation, validation, execution, and summarization in a single round-trip.

**Request:**
```
POST /functions/v1/ai-query
Authorization: Bearer <user JWT>
Body: {
    question: string,
    tripId: string,                  // UUID
    conversationHistory: { role: 'user' | 'assistant', content: string }[]   // last 10 max, server truncates
}
```

**Response:**
```
{
    answer: string,                                                         // natural-language reply
    followUps: string[],                                                    // 2-3 suggested follow-up questions
    intent: 'DATA_QUERY' | 'CHITCHAT' | 'CLARIFY' | 'OUT_OF_SCOPE' | 'error',
    error?: string                                                          // present when validation/SQL failed but we still returned a friendly answer
}
```

**Internal flow:**

1. **Auth + membership gate.** Verify the JWT via a user-scoped Supabase client, then check `trip_members` for `(tripId, callerId)` with `joined_at IS NOT NULL`. Pending invites are not members. Returns 404 on miss.

2. **Build trip context** (service-role client, no LLM). All expense aggregates filter `(is_private = false OR user_id = '<callerId>')` so members never see private rows from other members in their own context summary. Context includes:
   - `trips` row (name, dates, currencies, budget)
   - `trip_members` JOIN `profiles` (member names + roles, joined only)
   - distinct category names used in the trip
   - aggregate stats (count, total in base currency, total in home currency, first/last expense date), excluding refunds and excluded-from-metrics rows
   - distinct payment methods and place names (capped)
   - boolean flags: `has_refunds`, `has_excluded_expenses`, `has_spread_expenses`

3. **Intent + SQL generation.** One call to `gpt-4o-mini` with `response_format: 'json_object'`. The system prompt embeds the static schema and 12 critical query rules; the user prompt embeds the trip context, conversation history, and current question. Output:
   ```
   {
       intent: 'DATA_QUERY' | 'CHITCHAT' | 'CLARIFY' | 'OUT_OF_SCOPE',
       reasoning: string,
       directResponse: string,        // non-empty for non-DATA_QUERY
       queries: [{ sql: string, purpose: string }],   // 1-3 for DATA_QUERY
       explanation: string
   }
   ```
   For non-DATA_QUERY intents, the function short-circuits and returns `directResponse` as the answer with generic follow-ups.

4. **SQL validation** (programmatic). Each query must:
   - start with `SELECT` or `WITH`
   - contain no mutating keywords (`INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|MERGE|...`)
   - include the literal `tripId` UUID
   - include `deleted_at IS NULL`
   - include a `LIMIT`
   - if the query references the `expenses` table, also include both `is_private = false` and the literal caller-id UUID (i.e. the privacy filter `(is_private = false OR user_id = '<callerId>')`)

   Validation failure returns a friendly "couldn't process that question" answer with `error` set.

5. **SQL execution.** Each query runs in its own transaction via the `postgresjs` Deno module against `SUPABASE_DB_URL`, with `SET LOCAL statement_timeout = '5s'`, `SET LOCAL idle_in_transaction_session_timeout = '5s'`, and `SET LOCAL default_transaction_read_only = on`. Per-query errors are captured and passed to the summarizer rather than crashing the function.

6. **Summarize.** Second call to `gpt-4o-mini` (`response_format: 'json_object'`, temperature 0.3). The system prompt instructs casual/friendly tone, proper currency symbols, percentages where meaningful, budget comparisons, and graceful handling of empty results / SQL errors. Output `{ answer, followUps }`.

**Privacy.** No expense data leaves the device through this function. Aggregated trip context (member names, totals, place names) and the result rows of the model-generated SQL are sent to OpenAI for summarization. Per-row `is_private` enforcement happens at every step (context build, validator, generated SQL).

---

## 7. API Endpoints Used

### Supabase REST API (auto-generated from schema)
- `GET /rest/v1/trips` — list trips for user
- `POST /rest/v1/trips` — create trip
- `PATCH /rest/v1/trips?id=eq.{id}` — update trip
- `DELETE /rest/v1/trips?id=eq.{id}` — soft delete trip
- Same pattern for expenses, categories, trip_members, expense_photos

### Supabase Auth
- `POST /auth/v1/signup` — email signup
- `POST /auth/v1/token?grant_type=password` — email login
- `POST /auth/v1/token?grant_type=id_token` — Google/Apple OAuth
- `POST /auth/v1/logout` — logout
- `GET /auth/v1/user` — get current user

### Supabase Realtime
- Subscribe to `expenses` table filtered by `trip_id` for shared trips
- Subscribe to `trip_members` for invite notifications

### Supabase Storage
- `POST /storage/v1/object/expense-photos/{userId}/{expenseId}/{filename}` — upload photo
- `GET /storage/v1/object/public/expense-photos/...` — get photo URL

### Custom Edge Functions
- `POST /functions/v1/ai-query` — natural language expense queries
- `GET /functions/v1/exchange-rates?base=EUR&targets=USD,ILS,GBP` — get rates

### External APIs
- `GET https://api.exchangerate.host/latest?base=EUR` — exchange rates (called by edge function)

---

## 8. Environment Variables

```env
# .env (local development, never committed)
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...

# Supabase Edge Function env vars (set via Supabase dashboard)
OPENAI_API_KEY=sk-...
EXCHANGE_RATE_API_KEY=...  # if using a provider that requires one
```

---

## 9. Development Phases

### Phase 1: Foundation (Week 1)
- Expo project setup with TypeScript
- Project structure, navigation skeleton
- Supabase project creation
- Database migrations (all tables)
- Auth (signup, login, session management)
- Basic UI theme and component library

### Phase 2: Core Data (Week 2)
- Local SQLite setup and migrations
- Trip CRUD (create, list, edit, delete)
- Category management (defaults + custom)
- Expense entry screen (the full form)
- Expense list with daily grouping

### Phase 3: Features (Week 3)
- Map integration with expense pins
- Currency service (rates, conversion, caching)
- Stats screen (charts, breakdowns)
- Photo capture and display

### Phase 4: Sync & Sharing (Week 4)
- Sync engine (queue, push, pull, conflict resolution)
- Supabase Realtime subscriptions
- Shared trips (invite, accept, balance view)
- Photo upload/download sync

### Phase 5: AI & Polish (Week 5)
- AI query edge function
- AI chat interface
- Refinements, edge cases, error handling
- Performance optimization
- Dark mode polish

### Phase 6: Ship (Week 6)
- Android build and testing
- iOS build and testing
- App store assets (screenshots, description)
- Submission to Google Play and Apple App Store
