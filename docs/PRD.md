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

**Languages:** English and Hebrew. The app auto-detects the device language on first launch and defaults to it; users can override the choice in Settings. The UI flips to right-to-left when Hebrew is active.

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
- Budget (optional, in trip currency — entered via the custom NumPad, see §3.15)
- Mark as "ongoing" (no end date)

**Delete trip:**
- Confirmation dialog
- Deletes all associated expenses
- If shared, removes for all members (owner only can delete)

### 3.3 Expense Entry

This is the most critical screen. Target: complete an entry in under 10 seconds.

**Required fields:**
- Amount (entered via the app's custom NumPad — see §3.15)
- Category (tap from icon grid)

**Pre-filled / auto fields:**
- Currency (defaults to trip currency, switchable)
- Date/time (defaults to now, editable via the unified date section — see below)
- Location (auto-captured from GPS, shows place name via reverse geocoding)
- Converted amount shown in real-time (trip currency → home currency)

**Optional fields (visible by default):**
- Note (free text with suggestions from recent notes in this trip), positioned above the category grid so picking a suggestion can preview into the category below
- Payment method (Credit / Cash / Debit / custom — remembers last used)

**Form field order:**
amount → currency → note → category → date → payment → location → toggles (refund / exclude / private) → split (shared trips) → photos. The date section sits below category because most users do not change the default "now".

**Date / spread section:**
A single tappable card replaces the previous YYYY-MM-DD text input. Default state shows the date in readable form ("📅 Mar 15, 2026"), an HH:MM time field, and a small "⟷ Spread" affordance. Tapping the date opens a themed bottom-sheet calendar picker (single mode); future dates are disabled when creating a new expense. Tapping "⟷ Spread" switches the card into spread mode: the row morphs into a date-range picker with an inline summary ("3 nights · €40.00/night") that recomputes live as the amount changes. In spread mode the time field is hidden, an ✕ in the corner exits back to single mode (preserving the current expense_date), and the underlying expense_date stays in sync with spread_start_date.

**Optional fields (toggle to reveal):**
- Refund toggle — marks expense as negative, shown with green "+€X" in lists, reduces totals
- Exclude from metrics — expense exists in list but does not count toward budget, daily average, or charts. Use case: work expenses to be reimbursed, gifts, one-off outliers
- Private (shared trips only) — keeps the expense visible only to the logger
- Photos — attach 1 or more photos (receipt, menu, the place). Camera capture or gallery pick
- Share — send this single expense as a formatted message via system share sheet (WhatsApp, SMS, etc.)

(Multi-day spread is no longer in this list — it lives in the date section above.)

**Note suggestions:**
- Tappable chips below the note input, sourced from notes used in this trip across all members (in shared trips); other members' private expenses are excluded
- Each chip shows the category emoji from that note's most recent use ("🍽️ Tapas dinner")
- When the input is empty, shows up to the 10 most recent distinct notes
- As the user types, the list filters live by case-insensitive substring (capped at 10); if no notes match, the suggestions area hides entirely
- Tapping a suggestion fills the note and auto-selects the category from its most recent use — the user can still change the category afterwards

**Category grid:**
- 2 rows of 4 categories visible by default
- Scrollable if more than 8
- Recently used categories appear first
- Each category: emoji + short name
- "+" button to add custom category inline

**Default categories:**
Food 🍽️, Transport 🚗, Hotel 🏨, Flight ✈️, Coffee ☕, Shopping 🛍️, Activities 🎫, Other 📦

**Splitting in shared trips:**
In shared trips, users can split an expense among trip members. Split modes: Equal (divide evenly among selected members) or Custom (assign specific amounts, with a "split rest equally" option for hybrid splitting). Split expenses show the user's share in the expense list. The full amount is visible in expense detail.

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
- Accessible from the trips list screen
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
- N-person trips are supported (no hard cap)

**Shared behavior:**
- Members see all expenses in the trip (except private ones — see below)
- Each expense shows who logged it
- Each member can edit and delete only their own expenses; everyone can add new ones
- Stats show individual breakdowns and balance

**Private expenses:**
- When logging or editing an expense in a shared trip, the author can mark it private
- Private expenses are visible only to the author — they are excluded from the other members' expense list, stats, map view, AI query answers, and split-balance calculations
- A private expense still counts toward the author's own totals, budget progress, categories, and AI answers
- Use case: a surprise gift, a personal purchase the author doesn't want to split, or anything they'd rather not share with their travel companions

**Balance:**
- Balance calculation accounts for expense splits. Non-split expenses generate no debt. Split expenses create debt from non-payers to the payer based on each person's share.
- Each member's "share" totals their split rows (when split) plus their own non-split expenses. Pairwise debts are netted across all split expenses.
- Recorded settlement payments (see below) are netted in too — the displayed balance shows what's still OUTSTANDING, not the original split debt.
- Private expenses are excluded from balance calculations (they only affect the author's personal view)
- Displayed in stats screen as a tappable chip that opens the Balances screen

**Balances screen layout:**
- Dedicated screen at `/trip/[id]/balances`, accessible from a tap on the Stats balance chip or from a "Balances" entry in trip settings.
- **Members** section: every member's total share of trip cost (split rows + non-split expenses they paid).
- **Outstanding** section: a "You owe / Owes you" two-column directional summary. Each OTHER member with a non-zero netted balance appears in exactly one column — whichever direction wins after pairwise netting. Tap a row to settle. Multi-user trips scale naturally: one row per other person, in the appropriate column.
- **History** section: chronological list of recorded settlement payments. Long-press to reverse.
- **Shared expenses** section: a read-only ledger of every split expense the current user participates in, newest first. Each row shows date, total, payer, and the user's per-row direction ("you owe X" or "[name] owes you X"). Expenses between two other members the current user isn't part of are hidden.

**Settle up:**
- Tap any OUTSTANDING row → Settle Up modal opens pre-filled with that direction's current netted amount in home currency. Amount is editable, so partial settlements work; over-settling flips the direction (the receiver now owes the payer the excess).
- Trip currency is the default for the payment amount; toggle to home currency in the modal. Date defaults to today and can be backdated; optional note.
- All settlements created from the UI are free-form / unattributed — they reduce the netted pair balance rather than being tied to a specific expense. The per-expense "Settle" flow is no longer offered; the Shared Expenses ledger is read-only.
- exchange_rate is locked at recording time, mirroring expenses — historical settlements don't drift if rates change later.
- Anyone in the trip can record a payment between any two members (third-party / bookkeeper UX); the from/to default to the tapped pair direction but are not enforced server-side.
- Long-press a payment in the history list to reverse it; reversal restores the balance as if the payment never happened (soft-delete, hidden from history).
- Legacy attributed settlements (rows in `settlement_payments` with `expense_split_id` set, recorded by older app versions) remain honored by the balance computation: each removes the matching split from gross-debt accumulation. Reversing one re-opens that expense's debt. Editing or deleting an expense with an active attributed settlement is still blocked with a "Reverse the settlement first" message. New attributed settlements are no longer created.
- The AI assistant (Ask page) is settlement-aware: questions like "are we even?", "did Alex pay me back?", or "how much have we settled?" all return live, netted answers.

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

### 3.15 Input Behavior (Keyboard & NumPad)

The app must feel consistent and predictable when the user enters data. Two rules govern every input across the app: every numeric value is entered via the same custom NumPad, and the system text keyboard never covers the field a user is editing.

**Custom NumPad — used for every numeric value the user types:**
- Layout: a 3-column number grid (1–9, ., 0) plus a fourth right-hand column that holds **⌫** at the top and a tall **Done** key spanning the rows below. Done sits next to "6" and directly under ⌫.
- Visual style: gradient number keys, accent-colored Done key, matches the design system (DESIGN_SYSTEM.md §6 "Numpad").
- Tapping a numeric field opens the NumPad. The system keyboard is always dismissed first so the two are never on screen simultaneously. Tapping Done (or tapping outside) dismisses the NumPad.
- Long-press ⌫ clears the value.
- Used for: expense amount on Add Expense, trip budget in Create/Edit Trip, manual exchange-rate override, and the Quick Converter's amount field.
- Exception: per-row inline numeric inputs (custom-split shares for each member on a single expense) keep the system decimal-pad — the screen would have many small NumPad targets that conflict with one user-visible NumPad bar. This is the only place the system numeric keyboard is used.

**System text keyboard — used for every non-numeric input (notes, names, emails, dates, search):**
- Every screen that contains a text input wraps its content so the focused input stays visible above the keyboard on both iOS and Android.
- Dragging a list or scroll view dismisses the keyboard (`on-drag`).
- Tapping a row or button in a list while the keyboard is open performs the action on the first tap (no double-tap to dismiss-then-select).
- On Android, the screen resizes when the keyboard appears (rather than the keyboard floating over content).

**Add Expense screen — special interaction:**
- The amount display at the top is a tappable area, not a text input — tapping it always shows the NumPad and dismisses the system keyboard.
- Tapping any text field on the screen (note, date, time, etc.) hides the NumPad and shows the system keyboard.
- The Save button is a circular floating action button at the bottom-right (mirrored to bottom-left in RTL). It rides up to sit just above the NumPad, just above the system keyboard, or just above the safe-area edge depending on which (if any) is open. The button is dimmed and disabled until both an amount and a category are present.

**Add Expense — chat (Ask):**
- The chat input bar always sits directly above the keyboard.
- When the keyboard opens, the message list auto-scrolls to the latest message.
- Drag-down on the message list interactively pulls the keyboard down with the gesture.

---

## 4. Navigation Structure

```
App
├── Auth screens (sign up, log in) — shown if not authenticated
├── Trip List (home) — main entry point
│   ├── [Settings] (app settings)
│   ├── [Pencil icon on trip card] → Edit Trip (settings screen)
│   └── [Tap a trip card] → Trip View
│       ├── Bottom Nav (4 evenly-spaced tabs)
│       │   ├── Expenses (📋, default tab) — list + stats strip + multi-filter
│       │   ├── Map (📍)
│       │   ├── Ask (🧠) — AI chat
│       │   └── Stats (📊)
│       ├── [+] Add Expense (floating FAB, bottom-right of Expenses tab only)
│       ├── Categories (from Edit Trip screen)
│       └── Add/Edit Expense (modal overlay)
└── New Trip (from trip list)
```

Edit Trip is reached via the pencil icon on the trip card in the trip list — it is not exposed from inside the trip view's tab navigation.

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
- More than 2 users per shared trip
- Web version
