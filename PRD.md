# TRAVEL-EXPENSES-APP — Product Requirements Document

**Version:** 1.0 (MVP)
**Last Updated:** April 2026
**Status:** In Development

---

## 1. Product Overview

TRAVEL-EXPENSES-APP is a mobile expense tracker designed primarily for travelers. It helps users log, categorize, and analyze spending across multiple trips with multi-currency support, map visualization, shared trips, and AI-powered natural language queries.

**Primary use case:** Travel expense tracking (trips abroad with multi-currency, GPS-pinned expenses, trip budgets)
**Secondary use case:** Home/daily expense tracking (ongoing budgets, recurring categories)

**Target platforms:** Android (primary), iOS (secondary — same codebase via React Native)

---

## 2. User Personas

### Persona 1: The Traveling Couple
- Two users sharing a trip, each logging their own expenses
- Want to see a combined view and who owes whom
- Different phones (Android + iPhone)
- Need offline support (planes, remote areas, spotty data abroad)

### Persona 2: The Solo Traveler
- Logs expenses quickly throughout the day
- Cares about budget tracking and daily averages
- Wants to see spending on a map as a trip memory
- Asks questions like "how much did I spend on food in Tokyo?"

### Persona 3: The Home Budgeter (secondary)
- Uses the app for ongoing monthly expenses
- Creates a long-running "trip" as their home budget
- Cares about category breakdowns and monthly trends

---

## 3. Feature Specifications

### 3.1 Authentication

**Sign up / Log in:**
- Email + password registration
- Google Sign-In (OAuth)
- Apple Sign-In (required for iOS App Store)
- Simple profile: name, avatar (optional), default home currency
- Session persists until explicit logout
- Auth is required for sync and shared trips, but the app must work offline after initial login

### 3.2 Trip Management

**Trip list (home screen):**
- Shows all trips sorted by most recently active
- Each trip card shows: emoji/icon, name, date range, total spent (in home currency), trip currency, budget progress bar (if budget set), shared badge (if shared)
- "New Trip" button (dashed card at bottom)
- Settings icon in header

**Create/Edit trip:**
- Name (required)
- Emoji picker for trip icon
- Start date / End date (end date optional for ongoing trips like "Home 2026")
- Trip currency (the currency you're spending in — defaults based on destination)
- Home currency (your native currency for conversion display)
- Budget (optional, in trip currency)
- Mark as "ongoing" (no end date)

**Delete trip:**
- Confirmation dialog
- Deletes all associated expenses
- If shared, removes for all members (owner only can delete)

### 3.3 Expense Entry

This is the most critical screen. Target: complete an entry in under 10 seconds.

**Required fields:**
- Amount (numeric keypad input)
- Category (tap from icon grid)

**Pre-filled / auto fields:**
- Currency (defaults to trip currency, switchable)
- Date/time (defaults to now, editable)
- Location (auto-captured from GPS, shows place name via reverse geocoding)
- Converted amount shown in real-time (trip currency → home currency)

**Optional fields (visible by default):**
- Note (free text with suggestions from recent notes in this trip)
- Payment method (Credit / Cash / Debit / custom — remembers last used)

**Optional fields (toggle to reveal):**
- Refund toggle — marks expense as negative, shown with green "+€X" in lists, reduces totals
- Exclude from metrics — expense exists in list but does not count toward budget, daily average, or charts. Use case: work expenses to be reimbursed, gifts, one-off outliers
- Multi-day spread — set a start and end date, amount is divided evenly across those days in daily metrics. Use case: 3-night hotel booking shows as per-night cost in daily charts
- Photos — attach 1 or more photos (receipt, menu, the place). Camera capture or gallery pick
- Share — send this single expense as a formatted message via system share sheet (WhatsApp, SMS, etc.)

**Note suggestions:**
- Show recent notes from this trip as tappable chips below the note input
- Ordered by most recently used
- Disappear once user starts typing

**Category grid:**
- 2 rows of 4 categories visible by default
- Scrollable if more than 8
- Recently used categories appear first
- Each category: emoji + short name
- "+" button to add custom category inline

**Default categories:**
Food 🍽️, Transport 🚗, Hotel 🏨, Flight ✈️, Coffee ☕, Shopping 🛍️, Activities 🎫, Other 📦

### 3.4 Category Management

- Global default categories (apply to all trips)
- Custom categories per trip
- Each category has: name, emoji, color
- Can reorder categories (drag and drop)
- Can archive (hide) but not delete categories that have expenses
- Can delete empty categories

### 3.5 Expense List

**List view:**
- Grouped by date with daily subtotals
- Each expense row shows: category emoji, note, place name, who logged it (in shared trips), payment method, amount in trip currency, amount in home currency, badges (refund, excluded, multi-day, has photos)
- Sticky date headers with daily total

**Filtering:**
- Category filter chips (scrollable row at top)
- Date range picker
- Payment method filter
- Show/hide excluded expenses
- Show/hide refunds
- Filter by user (in shared trips)

**Search:**
- Search by note text
- Search by place name

**Actions:**
- Tap to view expense detail / edit
- Swipe left to delete (with confirmation)
- Swipe right to duplicate (quick re-entry for repeated expenses)

### 3.6 Expense Detail / Edit

- Full-screen view of a single expense
- All fields editable
- Photos displayed as scrollable thumbnails
- Delete button
- Share button
- Shows "logged by [name]" for shared trips
- Shows both original and converted amounts
- Shows exchange rate used

### 3.7 Map

**Map view:**
- Full-screen map within the trip tab
- Each expense is a pin at its GPS location
- Pin shows category emoji and is colored by category
- Clustered pins when zoomed out (show count)
- Tap a cluster to zoom in
- Tap a single pin to see expense summary popup (note, amount, category, date)
- Tap the popup to open expense detail

**Filters:**
- Category filter chips floating on top of map
- Toggle to show/hide excluded expenses

### 3.8 Currency

**Exchange rates:**
- Rates fetched daily from exchangerate.host (or similar free API)
- Cached locally for offline use
- Rate is "locked" into each expense at creation time (stored in the expense record)
- User can manually override the rate for a specific expense

**Currency display:**
- Every amount shows trip currency as primary
- Home currency shown as secondary (smaller, gray)
- Currency selector in expense entry shows common currencies first, then full list with search

**Quick converter:**
- Accessible from trip dashboard or settings
- Input amount in any currency, see conversion to trip currency and home currency
- Uses latest cached rate

### 3.9 Stats

Single scrollable screen within the trip tab. Sections:

**Summary cards (top):**
- Total spent
- Daily average
- Days elapsed / remaining
- Budget remaining (if set)
- Safe daily spend (remaining budget ÷ remaining days)

**Category breakdown:**
- Horizontal stacked bar showing proportions
- List below with emoji, name, amount, percentage

**Daily spending chart:**
- Bar chart, one bar per day
- Shows amount value on each bar
- Visual average line

**Split balance (shared trips only):**
- Each member's total spent
- Who owes whom and how much (simple: total difference ÷ 2)

**Payment method breakdown:**
- Cash vs Credit vs Debit totals and percentages

**Top expenses:**
- Top 5 highest expenses with note and amount

### 3.10 Ask Your Data (AI Queries)

**Interface:**
- Chat-like screen accessible from brain icon in trip header
- Suggested questions shown when empty (5-6 examples)
- Text input at bottom with send button
- Messages displayed as chat bubbles (user = right, AI = left)
- Conversation persists within the session (not saved across app restarts for MVP)

**How it works (architecture):**
1. User types a question
2. App sends to backend: the question + the database schema + the trip context (trip name, dates, currency, member names)
3. Backend (Supabase Edge Function) forwards to OpenAI GPT-4o-mini
4. LLM returns a SQL query
5. Backend sends SQL back to app
6. App runs the SQL query on local SQLite
7. App sends results back to backend with original question
8. LLM generates a natural language answer from the results
9. App displays the answer

**Why this architecture:**
- Financial data never leaves the device (only schema + aggregated results go to LLM)
- Works even if the user has expenses that haven't synced yet
- Cheaper (schema is small, minimal tokens)

**Fallback:**
- If offline, show message: "You need internet to ask questions. Try again when connected."
- If LLM generates invalid SQL, catch the error and show: "I couldn't understand that. Try rephrasing your question."

**Example questions the system should handle:**
- "How much did I spend on food?"
- "What was my most expensive day?"
- "Compare cash vs card spending"
- "Who spent more, me or [partner]?"
- "What's my average daily spend?"
- "Show me all expenses over €50"
- "How much did I spend in [city/location]?"
- "What's my total spend this week vs last week?"

### 3.11 Shared Trips

**Inviting:**
- Trip owner taps "Invite" in trip settings
- Enters partner's email
- Partner receives an in-app notification (or email) with an invite
- Partner accepts → trip appears in their trip list
- MVP: maximum 2 members per trip (can expand later)

**Shared behavior:**
- Both members see all expenses in the trip
- Each expense shows who logged it
- Both can add, edit, delete any expense (trust-based for couples/friends)
- Stats show individual breakdowns and balance

**Balance:**
- Simple calculation: (User A total - User B total) / 2 = settlement amount
- Displayed in stats screen
- No per-expense splitting in MVP (just total balance)

### 3.12 Sync

**Offline-first architecture:**
- All data stored in local SQLite
- All reads and writes go to local DB first (instant, no loading)
- Background sync process pushes/pulls changes when online

**Sync mechanism:**
- Local sync queue table tracks all creates/updates/deletes
- When online, process queue: push local changes to Supabase via REST API
- Subscribe to Supabase Realtime for changes from other users (shared trips)
- Incoming remote changes written to local SQLite
- Conflict resolution: last-write-wins (based on updated_at timestamp)

**Sync states (shown in UI):**
- Green dot: synced
- Orange dot: pending sync (changes queued)
- Red dot: sync error (tap to retry)
- Small sync status indicator in trip header

### 3.13 Photos

- Attach 1+ photos per expense
- Camera capture (opens system camera) or gallery pick
- Photos stored locally first, uploaded to Supabase Storage when online
- Thumbnails shown in expense list (small camera icon with count)
- Full-size view in expense detail (swipeable gallery)
- Photos sync with the expense

### 3.14 Settings

**Global settings screen (accessible from home):**
- Profile: name, avatar, email (read-only)
- Default home currency
- Manage default categories (add, reorder, hide)
- App theme (dark mode is default, option for light)
- Sync status and manual sync trigger
- Sign out
- About / version

---

## 4. Navigation Structure

```
App
├── Auth screens (sign up, log in) — shown if not authenticated
├── Trip List (home) — main entry point
│   ├── [Settings]
│   └── [Tap a trip] → Trip View
│       ├── Bottom Nav
│       │   ├── Dashboard (home icon)
│       │   ├── Expenses (list icon)
│       │   ├── [+] Add Expense (FAB, center)
│       │   ├── Map (map icon)
│       │   └── Stats (chart icon)
│       ├── Ask AI (brain icon in header)
│       ├── Trip Settings (from dashboard)
│       └── Add/Edit Expense (modal overlay)
└── New Trip (from trip list)
```

---

## 5. Non-Functional Requirements

- **Performance:** Expense entry screen must render in < 200ms. List must handle 1000+ expenses without jank.
- **Offline:** 100% functional offline except AI queries and initial auth. No loading spinners for local data.
- **Battery:** Minimal GPS usage (capture once on expense entry, not continuous tracking).
- **Storage:** SQLite DB + photos. Warn user if local storage exceeds 500MB.
- **Security:** API keys never in client code. Auth tokens stored in secure storage. Financial data stays on device (only schema goes to LLM).

---

## 6. Out of Scope for MVP

- Voice entry / OCR / receipt scanning
- Recurring expenses
- Export to CSV/PDF
- Widgets
- Trip templates
- Calendar integration
- Bank/wallet integrations
- Gamification (streaks, achievements)
- Year-in-review
- Per-expense splitting (only total balance)
- More than 2 users per shared trip
- Web version
