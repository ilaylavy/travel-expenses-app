# Balance screen redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-direction `PairDebtCard` rendering in the trip Balances screen with a single OUTSTANDING summary (two columns: "You owe" / "Owes you") plus a read-only SHARED EXPENSES list, and migrate the settle action to free-form unattributed payments only (legacy attributed rows remain honored in `computeBalance`).

**Architecture:** Two new pure helpers in a fresh `src/utils/balanceDisplay.ts` derive view-model data from `computeBalance.grossDebts` and the trip's expenses+splits. `BalancesScreen` consumes those helpers and renders the new sections. The existing `SettleUpModal` is reused unchanged for the tap-to-settle interaction (its `lockedExpenseSplitId` prop becomes unreferenced and is removed). No schema/DB changes; no migration of historical `settlement_payments`.

**Tech Stack:** React Native + Expo Router; TypeScript strict; `i18next` (en + he, RTL-aware); Jest for unit tests; existing `computeBalance` from `src/utils/balance.ts`.

**Spec:** `docs/superpowers/specs/2026-05-24-balance-redesign-design.md`

**Note on commits:** Per `CLAUDE.md`, the project prefers the `/commit-commands:commit` skill for commits, and per the user's saved preference, commits should be confirmed before running. Plan steps include raw `git commit` commands for autonomy; an inline executor should confirm with the user before each commit (or use the skill).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/utils/balanceDisplay.ts` | **Create** | Two pure helpers: `selectOutstandingForUser` partitions `grossDebts` into the two OUTSTANDING columns; `selectMySharedExpenses` produces the read-only ledger rows for the current user. |
| `src/utils/balanceDisplay.test.ts` | **Create** | Unit tests for both helpers covering 2-person, 3-person, deleted splits, private expenses, no-participation, multi-non-payer rendering inputs. |
| `src/i18n/locales/en.json` | **Modify** | Add new `balances.*` keys for the redesigned sections. Bilingual parity required. |
| `src/i18n/locales/he.json` | **Modify** | Same keys translated to Hebrew. |
| `app/(main)/trip/[id]/balances.tsx` | **Modify** | Replace OUTSTANDING + per-pair rendering with new sections; remove `contributingSplitsByPair` memo; remove inline `PairDebtCard` component; wire row taps to `SettleUpModal` with `expenseSplitId: null`; integrate the two new helpers. |
| `src/components/balance/SettleUpModal.tsx` | **Modify** | Remove the `lockedExpenseSplitId` prop and the `amountLocked` branch — only the deleted `PairDebtCard` referenced them. |

---

## Task 1: Add i18n strings (en + he)

Adds new translation keys consumed by Tasks 3/4. Keeping this first so later steps can reference the keys without forward references.

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/he.json`

- [ ] **Step 1: Add new English keys**

Open `src/i18n/locales/en.json`, find the `"balances"` object (around line 507), and add the following keys inside it (immediately after the existing `editBlockedBody` entry on the last line of the `balances` block, before the closing brace):

```json
    "sharedExpensesSection": "Shared expenses",
    "sharedExpensesEmpty": "No shared expenses yet.",
    "youOweColumn": "You owe",
    "owesYouColumn": "Owes you",
    "payCta": "Pay",
    "recordCta": "Record",
    "rowYouPaid": "You paid",
    "rowPaidBy": "{{name}} paid",
    "rowYouOweAmount": "you owe {{amount}}",
    "rowOwesYouAmount": "{{name}} owes you {{amount}}"
```

Remember to add a comma after the existing `editBlockedBody` line so the JSON stays valid.

- [ ] **Step 2: Add matching Hebrew keys**

Open `src/i18n/locales/he.json`, find the `"balances"` object (around line 507), and add the same keys with real Hebrew translations:

```json
    "sharedExpensesSection": "הוצאות משותפות",
    "sharedExpensesEmpty": "אין עדיין הוצאות משותפות.",
    "youOweColumn": "אתה חייב",
    "owesYouColumn": "חייבים לך",
    "payCta": "שלם",
    "recordCta": "רשום",
    "rowYouPaid": "שילמת",
    "rowPaidBy": "{{name}} שילם",
    "rowYouOweAmount": "אתה חייב {{amount}}",
    "rowOwesYouAmount": "{{name}} חייב לך {{amount}}"
```

- [ ] **Step 3: Verify JSON validity**

Run:
```
node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/en.json','utf8'));JSON.parse(require('fs').readFileSync('src/i18n/locales/he.json','utf8'));console.log('ok')"
```

Expected output: `ok` (no parse errors).

- [ ] **Step 4: Commit**

```
git add src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Add i18n strings for redesigned balance screen"
```

---

## Task 2: Pure view-model helpers + unit tests

Extract two small pure functions so the screen can stay declarative and the view-derivation logic is independently testable. TDD: write tests first.

**Files:**
- Create: `src/utils/balanceDisplay.ts`
- Create: `src/utils/balanceDisplay.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/utils/balanceDisplay.test.ts` with:

```typescript
import type { ExpenseSplit, ExpenseWithPhotos } from '@/types/expense';
import type { PairwiseSettlement } from '@/utils/balance';

import {
  selectMySharedExpenses,
  selectOutstandingForUser,
  type SharedExpenseRow,
} from './balanceDisplay';

function expense(overrides: Partial<ExpenseWithPhotos>): ExpenseWithPhotos {
  return {
    id: 'e1',
    tripId: 't1',
    userId: 'u1',
    amount: 100,
    currency: 'USD',
    convertedAmount: 100,
    exchangeRate: 1,
    categoryId: 'c1',
    note: null,
    paymentMethod: null,
    latitude: null,
    longitude: null,
    placeName: null,
    expenseDate: '2026-05-09',
    expenseTime: '12:00:00',
    isRefund: false,
    isExcludedFromDailyMetrics: false,
    isPrivate: false,
    isSplit: false,
    spreadStartDate: null,
    spreadEndDate: null,
    createdAt: '2026-05-09T12:00:00Z',
    updatedAt: '2026-05-09T12:00:00Z',
    deletedAt: null,
    photos: [],
    ...overrides,
  };
}

function split(overrides: Partial<ExpenseSplit>): ExpenseSplit {
  return {
    id: 's1',
    expenseId: 'e1',
    userId: 'u1',
    amount: 50,
    isPayer: false,
    createdAt: '2026-05-09T12:00:00Z',
    updatedAt: '2026-05-09T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('selectOutstandingForUser', () => {
  it('partitions grossDebts into youOwe (current user is debtor) and owesYou (current user is creditor)', () => {
    const grossDebts: PairwiseSettlement[] = [
      { fromUserId: 'u2', toUserId: 'u1', amount: 100 }, // u2 owes u1
      { fromUserId: 'u1', toUserId: 'u2', amount: 40 },  // u1 owes u2
      { fromUserId: 'u3', toUserId: 'u1', amount: 20 },  // u3 owes u1
      { fromUserId: 'u2', toUserId: 'u3', amount: 5 },   // unrelated to u1 — excluded
    ];
    const result = selectOutstandingForUser(grossDebts, 'u1');
    expect(result.youOwe).toEqual([
      { fromUserId: 'u1', toUserId: 'u2', amount: 40 },
    ]);
    expect(result.owesYou).toEqual([
      { fromUserId: 'u2', toUserId: 'u1', amount: 100 },
      { fromUserId: 'u3', toUserId: 'u1', amount: 20 },
    ]);
  });

  it('returns empty arrays when the user has no debts', () => {
    const result = selectOutstandingForUser([], 'u1');
    expect(result).toEqual({ youOwe: [], owesYou: [] });
  });
});

describe('selectMySharedExpenses', () => {
  it('returns one row per split expense the user participates in, newest first', () => {
    const e1 = expense({
      id: 'e1',
      userId: 'u1',
      amount: 100,
      convertedAmount: 100,
      isSplit: true,
      expenseDate: '2026-05-08',
    });
    const e2 = expense({
      id: 'e2',
      userId: 'u2',
      amount: 60,
      convertedAmount: 60,
      isSplit: true,
      expenseDate: '2026-05-10',
    });
    const splits: ExpenseSplit[] = [
      split({ id: 's1a', expenseId: 'e1', userId: 'u1', amount: 50, isPayer: true }),
      split({ id: 's1b', expenseId: 'e1', userId: 'u2', amount: 50, isPayer: false }),
      split({ id: 's2a', expenseId: 'e2', userId: 'u2', amount: 30, isPayer: true }),
      split({ id: 's2b', expenseId: 'e2', userId: 'u1', amount: 30, isPayer: false }),
    ];
    const rows = selectMySharedExpenses([e1, e2], splits, 'u1');
    expect(rows.map((r) => r.expense.id)).toEqual(['e2', 'e1']); // newest first
  });

  it('marks userIsPayer=true and lists each non-payer when user paid', () => {
    const e = expense({
      id: 'e1',
      userId: 'u1',
      amount: 90,
      convertedAmount: 90,
      isSplit: true,
    });
    const splits: ExpenseSplit[] = [
      split({ id: 'sa', expenseId: 'e1', userId: 'u1', amount: 30, isPayer: true }),
      split({ id: 'sb', expenseId: 'e1', userId: 'u2', amount: 30, isPayer: false }),
      split({ id: 'sc', expenseId: 'e1', userId: 'u3', amount: 30, isPayer: false }),
    ];
    const [row] = selectMySharedExpenses([e], splits, 'u1');
    expect(row.userIsPayer).toBe(true);
    expect(row.payerUserId).toBe('u1');
    expect(row.userShareConverted).toBe(30);
    expect(row.otherNonPayers).toEqual([
      { userId: 'u2', shareConverted: 30 },
      { userId: 'u3', shareConverted: 30 },
    ]);
  });

  it('marks userIsPayer=false and stores user share when someone else paid', () => {
    const e = expense({
      id: 'e1',
      userId: 'u2',
      amount: 100,
      convertedAmount: 100,
      isSplit: true,
    });
    const splits: ExpenseSplit[] = [
      split({ id: 'sa', expenseId: 'e1', userId: 'u2', amount: 60, isPayer: true }),
      split({ id: 'sb', expenseId: 'e1', userId: 'u1', amount: 40, isPayer: false }),
    ];
    const [row] = selectMySharedExpenses([e], splits, 'u1');
    expect(row.userIsPayer).toBe(false);
    expect(row.payerUserId).toBe('u2');
    expect(row.userShareConverted).toBe(40);
    expect(row.otherNonPayers).toEqual([]);
  });

  it('excludes deleted, private, and non-split expenses', () => {
    const splits: ExpenseSplit[] = [
      split({ id: 'sa', expenseId: 'e1', userId: 'u1', amount: 50, isPayer: true }),
      split({ id: 'sb', expenseId: 'e1', userId: 'u2', amount: 50 }),
    ];
    const rows = selectMySharedExpenses(
      [
        expense({ id: 'e1', isSplit: true, deletedAt: '2026-05-10', userId: 'u1' }),
        expense({ id: 'e2', isSplit: true, isPrivate: true, userId: 'u1' }),
        expense({ id: 'e3', isSplit: false, userId: 'u1' }),
      ],
      splits,
      'u1',
    );
    expect(rows).toEqual([]);
  });

  it('excludes expenses where the current user has no active split', () => {
    const e = expense({
      id: 'e1',
      userId: 'u2',
      amount: 100,
      convertedAmount: 100,
      isSplit: true,
    });
    const splits: ExpenseSplit[] = [
      split({ id: 'sa', expenseId: 'e1', userId: 'u2', amount: 50, isPayer: true }),
      split({ id: 'sb', expenseId: 'e1', userId: 'u3', amount: 50 }),
      // No split for u1
    ];
    const rows = selectMySharedExpenses([e], splits, 'u1');
    expect(rows).toEqual([]);
  });

  it('ignores deleted splits when deciding participation and amounts', () => {
    const e = expense({
      id: 'e1',
      userId: 'u1',
      amount: 100,
      convertedAmount: 100,
      isSplit: true,
    });
    const splits: ExpenseSplit[] = [
      split({ id: 'sa', expenseId: 'e1', userId: 'u1', amount: 50, isPayer: true }),
      split({ id: 'sb', expenseId: 'e1', userId: 'u2', amount: 50, deletedAt: '2026-05-10' }),
    ];
    const rows = selectMySharedExpenses([e], splits, 'u1');
    // Only u1's split is active; expense effectively has no non-payers from u1's view.
    expect(rows[0].otherNonPayers).toEqual([]);
  });

  it('converts shares to home currency using the expense ratio', () => {
    // 9000 JPY total = 90 USD home; ratio test: u2's 6000 JPY share = 60 USD.
    const e = expense({
      id: 'e1',
      userId: 'u1',
      amount: 9000,
      convertedAmount: 90,
      currency: 'JPY',
      isSplit: true,
    });
    const splits: ExpenseSplit[] = [
      split({ id: 'sa', expenseId: 'e1', userId: 'u1', amount: 3000, isPayer: true }),
      split({ id: 'sb', expenseId: 'e1', userId: 'u2', amount: 6000, isPayer: false }),
    ];
    const [row] = selectMySharedExpenses([e], splits, 'u1');
    expect(row.userShareConverted).toBe(30);
    expect(row.otherNonPayers).toEqual([{ userId: 'u2', shareConverted: 60 }]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails with "module not found"**

Run:
```
npx jest src/utils/balanceDisplay.test.ts
```

Expected: FAIL — "Cannot find module './balanceDisplay'" (the file doesn't exist yet).

- [ ] **Step 3: Create `balanceDisplay.ts` with minimal implementation**

Create `src/utils/balanceDisplay.ts`:

```typescript
import type { ExpenseSplit, ExpenseWithPhotos } from '@/types/expense';
import type { PairwiseSettlement } from '@/utils/balance';
import { roundAmount } from '@/utils/currency';

export interface OutstandingSummary {
  // Debts where the current user is the debtor (fromUserId === currentUserId).
  youOwe: PairwiseSettlement[];
  // Debts where the current user is the creditor (toUserId === currentUserId).
  owesYou: PairwiseSettlement[];
}

// Filters `grossDebts` (un-netted directional debts from computeBalance) to
// just those involving the current user, split by direction. Cross-pair
// debts between two other members are excluded — they don't affect what the
// current user can act on.
export function selectOutstandingForUser(
  grossDebts: PairwiseSettlement[],
  currentUserId: string,
): OutstandingSummary {
  return {
    youOwe: grossDebts.filter((d) => d.fromUserId === currentUserId),
    owesYou: grossDebts.filter((d) => d.toUserId === currentUserId),
  };
}

// One row in the read-only SHARED EXPENSES section.
export interface SharedExpenseRow {
  expense: ExpenseWithPhotos;
  payerUserId: string;
  // True when the current user is the payer (creditor on this expense).
  userIsPayer: boolean;
  // Current user's own share in home currency. When userIsPayer=false this
  // is what they owe the payer; when userIsPayer=true it's their own portion
  // of the bill (not a debt).
  userShareConverted: number;
  // Other non-payers' shares in home currency. Populated only when
  // userIsPayer=true (so the UI can list "Noa owes you X · Bob owes you Y").
  // Empty when userIsPayer=false. Sorted by descending share amount, then
  // by userId as a tiebreaker for stable output.
  otherNonPayers: { userId: string; shareConverted: number }[];
}

// Returns one row per split expense the current user participates in,
// sorted newest first by expense date/time/created_at. Filters out:
//   - non-split, deleted, or private expenses (mirrors computeBalance)
//   - expenses where the current user has no active (non-deleted) split
function shareInHome(
  expenseAmount: number,
  expenseConverted: number,
  splitAmount: number,
): number {
  if (expenseAmount === 0) return 0;
  return roundAmount(expenseConverted * (splitAmount / expenseAmount));
}

export function selectMySharedExpenses(
  expenses: ExpenseWithPhotos[],
  splits: ExpenseSplit[],
  currentUserId: string,
): SharedExpenseRow[] {
  // Index splits by expense id, dropping soft-deleted rows up front.
  const splitsByExpense = new Map<string, ExpenseSplit[]>();
  for (const s of splits) {
    if (s.deletedAt !== null) continue;
    const list = splitsByExpense.get(s.expenseId) ?? [];
    list.push(s);
    splitsByExpense.set(s.expenseId, list);
  }

  const rows: SharedExpenseRow[] = [];
  for (const e of expenses) {
    if (e.deletedAt !== null) continue;
    if (e.isPrivate) continue;
    if (!e.isSplit) continue;
    const expenseSplits = splitsByExpense.get(e.id) ?? [];
    if (expenseSplits.length === 0) continue;

    // Find the current user's split. If absent, they don't participate.
    const mySplit = expenseSplits.find((s) => s.userId === currentUserId);
    if (!mySplit) continue;

    // Resolve the payer: prefer the is_payer split (server-side truth);
    // fall back to expense.userId if no is_payer flag is set anywhere.
    const payerSplit = expenseSplits.find((s) => s.isPayer);
    const payerUserId = payerSplit?.userId ?? e.userId;
    const userIsPayer = payerUserId === currentUserId;

    const userShareConverted = shareInHome(e.amount, e.convertedAmount, mySplit.amount);

    let otherNonPayers: { userId: string; shareConverted: number }[] = [];
    if (userIsPayer) {
      otherNonPayers = expenseSplits
        .filter((s) => !s.isPayer && s.userId !== currentUserId)
        .map((s) => ({
          userId: s.userId,
          shareConverted: shareInHome(e.amount, e.convertedAmount, s.amount),
        }))
        .sort((a, b) => {
          if (b.shareConverted !== a.shareConverted) {
            return b.shareConverted - a.shareConverted;
          }
          return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
        });
    }

    rows.push({
      expense: e,
      payerUserId,
      userIsPayer,
      userShareConverted,
      otherNonPayers,
    });
  }

  // Newest first — same ordering used in the expenses list elsewhere.
  rows.sort((a, b) => {
    const ad = a.expense.expenseDate;
    const bd = b.expense.expenseDate;
    if (ad !== bd) return ad < bd ? 1 : -1;
    const at = a.expense.expenseTime;
    const bt = b.expense.expenseTime;
    if (at !== bt) return at < bt ? 1 : -1;
    const ac = a.expense.createdAt;
    const bc = b.expense.createdAt;
    return ac < bc ? 1 : ac > bc ? -1 : 0;
  });

  return rows;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run:
```
npx jest src/utils/balanceDisplay.test.ts
```

Expected: PASS — all 8 test cases (2 for `selectOutstandingForUser`, 6 for `selectMySharedExpenses`).

- [ ] **Step 5: Run typecheck**

Run:
```
npx tsc --noEmit
```

Expected: exit 0 (no type errors).

- [ ] **Step 6: Commit**

```
git add src/utils/balanceDisplay.ts src/utils/balanceDisplay.test.ts
git commit -m "Add balanceDisplay helpers for redesigned balance screen"
```

---

## Task 3: Refactor `BalancesScreen` to render OUTSTANDING + SHARED EXPENSES

Replace the pair-card rendering and per-expense settle plumbing with the new sections. This is the biggest change but is contained to a single screen file.

**Files:**
- Modify: `app/(main)/trip/[id]/balances.tsx`

- [ ] **Step 1: Update the file header comment and imports**

Find the header comment at the top of the file (currently lines 1-11) and replace with:

```typescript
// Trip Balances screen — shows per-member trip-cost share, a directional
// OUTSTANDING summary (You owe / Owes you) listing each pair-direction the
// current user is involved in, a read-only SHARED EXPENSES ledger of every
// split expense the user participates in, and a HISTORY of recorded
// payments. Tap any OUTSTANDING row to open the Settle Up modal pre-filled
// with that direction's gross balance (amount editable for partial settle).
//
// Settlements are always free-form unattributed under this design — they
// reduce the matching pair-direction in computeBalance (overpayment flips
// the excess). Legacy attributed settlement_payments (with expense_split_id
// set) remain honored in computeBalance's gross derivation; the UI no
// longer creates new attributed rows.
```

In the imports block (lines 9-32), make these changes:
- Remove the unused `SettlementAttributedError` / per-expense locking — none of those imports exist; skip if not present.
- The current imports don't import `computeBalance` types we need beyond `PairwiseSettlement`. Add `selectMySharedExpenses` and `selectOutstandingForUser` from the new helper file. Replace the imports block (lines 9-36 in the current file) with:

```typescript
import { useFocusEffect, useGlobalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SettleUpModal } from '@/components/balance/SettleUpModal';
import { StatsSectionCard } from '@/components/stats/StatsSectionCard';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { listTripMembers } from '@/db/queries/trips';
import { getProfileName } from '@/db/queries/profiles';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useSettlementStore } from '@/stores/settlementStore';
import { useTripStore } from '@/stores/tripStore';
import { syncEngine } from '@/sync/syncEngine';
import type { SettlementPayment } from '@/types/settlement';
import { computeBalance, type PairwiseSettlement } from '@/utils/balance';
import {
  selectMySharedExpenses,
  selectOutstandingForUser,
  type SharedExpenseRow,
} from '@/utils/balanceDisplay';
import { showConfirmDialog } from '@/utils/confirmDialog';
import { formatAmount } from '@/utils/currency';
import { formatReadableDate } from '@/utils/date';
import { initials } from '@/utils/initials';
import { href } from '@/utils/nav';
```

Note: this drops `selectCategoriesForTrip` / `useCategoryStore` / `Category` / `roundAmount` and the `ContributingSplit` / `PairCard` interfaces that the deleted code depended on. The new sections don't need category lookups.

- [ ] **Step 2: Drop the now-unused interfaces and shrink state**

After the imports, find the existing `interface PairCard { ... }` (around line 38) and the `interface ContributingSplit { ... }` (around line 49) and DELETE both of them.

Replace them with the new modal-context type used by tap-to-settle:

```typescript
// Settle modal pre-fill: pair direction + gross amount (editable in the modal).
interface SettleContext {
  fromUserId: string;
  toUserId: string;
  amount: number;
}
```

Inside `BalancesScreen()`, find the modal context state declaration (currently `useState<PairCard | null>(null)` around line 81) and change it to use the new type:

```typescript
  const [modalContext, setModalContext] = useState<SettleContext | null>(null);
```

- [ ] **Step 3: Drop category-related state and selectors**

Inside `BalancesScreen()`, delete these selectors (currently lines 76 and 77 — adjust if line numbers have drifted):

```typescript
  const allCategories = useCategoryStore((s) => s.categories);
```

Delete the `tripCategories` and `categoriesById` memos (currently lines 142-150). They were only consumed by the deleted `contributingSplitsByPair` memo.

- [ ] **Step 4: Replace `contributingSplitsByPair` memo with the two new derivations**

Find the `contributingSplitsByPair` memo (currently lines 155-207) and DELETE it entirely. In its place, insert:

```typescript
  // Outstanding directional summary for the current user. Filters
  // computeBalance.grossDebts to debts that involve them, partitioned by
  // direction so the UI can render two columns.
  const outstanding = useMemo(
    () =>
      currentUserId
        ? selectOutstandingForUser(balance.grossDebts, currentUserId)
        : { youOwe: [] as PairwiseSettlement[], owesYou: [] as PairwiseSettlement[] },
    [balance.grossDebts, currentUserId],
  );

  // Read-only ledger: every split expense the current user participates in,
  // newest first. Excludes private/deleted/non-split and anything the user
  // isn't a participant in.
  const mySharedExpenses = useMemo(
    () =>
      currentUserId ? selectMySharedExpenses(expenses, splits, currentUserId) : [],
    [expenses, splits, currentUserId],
  );
```

- [ ] **Step 5: Replace the Outstanding section JSX**

Find the existing Outstanding section JSX (currently lines 282-329, the one that maps over `balance.grossDebts` and renders `PairDebtCard`) and replace it with the new two-column directional summary:

```tsx
        {/* Outstanding — two-column directional summary. Each row is one
            pair-direction the current user is involved in; tap to settle. */}
        <StatsSectionCard title={t('balances.outstandingSection')}>
          {outstanding.youOwe.length === 0 && outstanding.owesYou.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🎉</Text>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {t('balances.allSettled')}
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {t('balances.allSettledHint')}
              </Text>
            </View>
          ) : (
            <View style={styles.directionalColumns}>
              <View style={styles.directionalColumn}>
                <Text style={[styles.columnHeader, { color: theme.textMuted }]}>
                  {t('balances.youOweColumn')}
                </Text>
                {outstanding.youOwe.length === 0 ? (
                  <Text style={[styles.columnEmpty, { color: theme.textMuted }]}>—</Text>
                ) : (
                  outstanding.youOwe.map((d) => (
                    <DirectionalDebtRow
                      key={`${d.fromUserId}|${d.toUserId}`}
                      debt={d}
                      name={resolveName(d.toUserId)}
                      currency={currency}
                      tone="youOwe"
                      cta={t('balances.payCta')}
                      onPress={() =>
                        setModalContext({
                          fromUserId: d.fromUserId,
                          toUserId: d.toUserId,
                          amount: d.amount,
                        })
                      }
                    />
                  ))
                )}
              </View>
              <View style={styles.directionalColumn}>
                <Text style={[styles.columnHeader, { color: theme.textMuted }]}>
                  {t('balances.owesYouColumn')}
                </Text>
                {outstanding.owesYou.length === 0 ? (
                  <Text style={[styles.columnEmpty, { color: theme.textMuted }]}>—</Text>
                ) : (
                  outstanding.owesYou.map((d) => (
                    <DirectionalDebtRow
                      key={`${d.fromUserId}|${d.toUserId}`}
                      debt={d}
                      name={resolveName(d.fromUserId)}
                      currency={currency}
                      tone="owesYou"
                      cta={t('balances.recordCta')}
                      onPress={() =>
                        setModalContext({
                          fromUserId: d.fromUserId,
                          toUserId: d.toUserId,
                          amount: d.amount,
                        })
                      }
                    />
                  ))
                )}
              </View>
            </View>
          )}
        </StatsSectionCard>

        {/* Shared Expenses — read-only ledger of every split expense the
            current user participates in. No settle button per row; settle
            from the OUTSTANDING summary above (or globally) instead. */}
        <StatsSectionCard title={t('balances.sharedExpensesSection')}>
          {mySharedExpenses.length === 0 ? (
            <Text style={[styles.emptyHistory, { color: theme.textMuted }]}>
              {t('balances.sharedExpensesEmpty')}
            </Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {mySharedExpenses.map((row) => (
                <SharedExpenseRowItem
                  key={row.expense.id}
                  row={row}
                  currency={currency}
                  resolveName={resolveName}
                />
              ))}
            </View>
          )}
        </StatsSectionCard>
```

This replaces ONLY the existing outstanding section JSX. The History section just below stays exactly as it is.

- [ ] **Step 6: Replace the inline `PairDebtCard` component with two new sub-components**

At the bottom of the file, find the entire `interface PairDebtCardProps { ... }` and `function PairDebtCard({ ... })` block (currently lines 374-502). DELETE that whole block.

In the same place, add the two new sub-components:

```tsx
interface DirectionalDebtRowProps {
  debt: PairwiseSettlement;
  name: string;
  currency: string;
  // "youOwe" → red palette (you're the debtor). "owesYou" → green palette.
  tone: 'youOwe' | 'owesYou';
  cta: string;
  onPress: () => void;
}

function DirectionalDebtRow({
  debt,
  name,
  currency,
  tone,
  cta,
  onPress,
}: DirectionalDebtRowProps) {
  const theme = useTheme();
  const bg = tone === 'youOwe' ? theme.redSoft : theme.greenSoft;
  const fg = tone === 'youOwe' ? theme.red : theme.green;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.directionalRow,
        { backgroundColor: bg, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <Text style={[styles.directionalName, { color: fg }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.directionalAmount, { color: fg }]}>
        {formatAmount(debt.amount, currency)}
      </Text>
      <View style={[styles.directionalCta, { backgroundColor: fg }]}>
        <Text style={styles.directionalCtaText}>{cta}</Text>
      </View>
    </Pressable>
  );
}

interface SharedExpenseRowItemProps {
  row: SharedExpenseRow;
  currency: string;
  resolveName: (userId: string) => string;
}

function SharedExpenseRowItem({ row, currency, resolveName }: SharedExpenseRowItemProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  // Body line:
  //   - user is payer: "You paid · {name1} owes you {amt1} · {name2} owes you {amt2} ..."
  //   - someone else paid: "{payerName} paid · you owe {amt}"
  const headLabel = row.userIsPayer
    ? t('balances.rowYouPaid')
    : t('balances.rowPaidBy', { name: resolveName(row.payerUserId) });

  const tailLabels: string[] = row.userIsPayer
    ? row.otherNonPayers.map((p) =>
        t('balances.rowOwesYouAmount', {
          name: resolveName(p.userId),
          amount: formatAmount(p.shareConverted, currency),
        }),
      )
    : [
        t('balances.rowYouOweAmount', {
          amount: formatAmount(row.userShareConverted, currency),
        }),
      ];

  return (
    <View style={[styles.sharedExpenseRow, { backgroundColor: theme.surface }]}>
      <View style={styles.sharedExpenseHeader}>
        <Text style={[styles.sharedExpenseTitle, { color: theme.text }]} numberOfLines={1}>
          {row.expense.note && row.expense.note.trim().length > 0
            ? row.expense.note
            : '—'}
        </Text>
        <Text style={[styles.sharedExpenseTotal, { color: theme.text }]}>
          {formatAmount(row.expense.convertedAmount, currency)}
        </Text>
      </View>
      <Text style={[styles.sharedExpenseMeta, { color: theme.textMuted }]}>
        {formatReadableDate(row.expense.expenseDate)}
      </Text>
      <Text style={[styles.sharedExpenseBody, { color: theme.textSecondary }]}>
        {[headLabel, ...tailLabels].join(' · ')}
      </Text>
    </View>
  );
}

interface HistoryRowProps {
  settlement: SettlementPayment;
  resolveName: (userId: string) => string;
  onLongPress: () => void;
}

function HistoryRow({ settlement, resolveName, onLongPress }: HistoryRowProps) {
  // Keep the existing HistoryRow component body unchanged from the prior
  // file — it's still used by the History section.
  // ... (preserve the existing implementation below) ...
}
```

**Important:** The `HistoryRow` component already exists at the bottom of the current file. Leave its body intact — only the `PairDebtCard` component and its `PairDebtCardProps` interface are being removed/replaced. After this edit the file should contain (in order at the bottom): `DirectionalDebtRow`, `SharedExpenseRowItem`, then the existing `HistoryRow`.

- [ ] **Step 7: Add styles for the new components**

In the `StyleSheet.create({...})` block at the bottom of the file, ADD these style entries (don't remove existing ones — most are still used by Members/History; the `pairCard*` / `pairActions*` / `settleButton*` / `expandToggle*` / `splitRow*` etc. entries that were specific to the deleted PairDebtCard are now dead code and can be removed in a follow-up cleanup but leave them for this commit to keep the diff focused):

```typescript
  directionalColumns: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  directionalColumn: {
    flex: 1,
    gap: spacing.sm,
  },
  columnHeader: {
    ...typography.micro,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  columnEmpty: {
    ...typography.body,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  directionalRow: {
    borderRadius: sizing.radiusCard,
    padding: spacing.md,
    gap: 4,
  },
  directionalName: {
    fontSize: 14,
    fontWeight: '700',
  },
  directionalAmount: {
    fontSize: 18,
    fontWeight: '800',
  },
  directionalCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: sizing.radiusChip,
    marginTop: spacing.xs,
  },
  directionalCtaText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sharedExpenseRow: {
    borderRadius: sizing.radiusCard,
    padding: spacing.md,
    gap: 4,
  },
  sharedExpenseHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  sharedExpenseTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  sharedExpenseTotal: {
    fontSize: 14,
    fontWeight: '800',
  },
  sharedExpenseMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  sharedExpenseBody: {
    fontSize: 13,
    fontWeight: '500',
  },
```

- [ ] **Step 8: Update the `SettleUpModal` invocation at the bottom of the screen**

Find the existing `<SettleUpModal ... />` rendering (currently around lines 355-369). It still uses `modalContext.expenseSplitId` for the locked per-expense settle path. Replace it with the simpler unattributed-only version:

```tsx
      {modalContext ? (
        <SettleUpModal
          visible={modalContext !== null}
          onClose={() => setModalContext(null)}
          tripId={tripId}
          fromUserId={modalContext.fromUserId}
          toUserId={modalContext.toUserId}
          fromName={resolveName(modalContext.fromUserId)}
          toName={resolveName(modalContext.toUserId)}
          tripCurrency={trip.baseCurrency}
          homeCurrency={trip.homeCurrency}
          suggestedHomeAmount={modalContext.amount}
        />
      ) : null}
```

Removed prop: `lockedExpenseSplitId` (no longer passed; Task 4 removes the prop from the modal interface).

- [ ] **Step 9: Typecheck**

Run:
```
npx tsc --noEmit
```

Expected: exit 0. If there are errors about unused imports (e.g. `roundAmount`, `selectCategoriesForTrip`), remove them from the import block.

- [ ] **Step 10: Run the existing test suite**

Run:
```
npx jest
```

Expected: all suites pass (7 suites, 89+ tests including the new `balanceDisplay.test.ts` cases from Task 2).

- [ ] **Step 11: Commit**

```
git add app/(main)/trip/[id]/balances.tsx
git commit -m "Redesign balance screen with directional summary + read-only ledger"
```

---

## Task 4: Remove `lockedExpenseSplitId` from `SettleUpModal`

Cleanup the now-unused prop. No callers remain (verified via grep before this task).

**Files:**
- Modify: `src/components/balance/SettleUpModal.tsx`

- [ ] **Step 1: Verify no remaining callers**

Run:
```
git grep -n "lockedExpenseSplitId" -- ':!docs/'
```

Expected: only matches inside `src/components/balance/SettleUpModal.tsx` itself. If anything else shows up, STOP and update Task 4 — there's another consumer we missed.

- [ ] **Step 2: Update the file header comment**

Open `src/components/balance/SettleUpModal.tsx`. Replace the header comment (lines 1-7) with:

```typescript
// SettleUpModal — record a debt-settlement payment between two trip members.
//
// Entry: tapping a row in the OUTSTANDING summary on the Balances screen.
// Payer/receiver are locked at entry time; the suggested amount is the
// current gross pair-direction debt in home currency, converted to the
// chosen settlement currency. Amount is editable (partial settle supported).
// exchange_rate is locked when the user submits — same rate-lock pattern
// as expenses.
//
// All settlements created here are UNATTRIBUTED (expense_split_id = NULL).
// Legacy attributed rows in the database remain honored by computeBalance.
```

- [ ] **Step 3: Remove the prop from the interface and signature**

Find `interface SettleUpModalProps` (lines 38-59) and remove the `lockedExpenseSplitId?: string` line at the bottom along with its preceding comment block. Also remove the trailing `// 0 means no outstanding debt (ad-hoc payment).` line annotation on `suggestedHomeAmount` if you want it tidier — but the prop comment itself can stay.

Final interface should read:

```typescript
interface SettleUpModalProps {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  // Trip's local currency (baseCurrency) and the user-facing reporting
  // currency (homeCurrency). If they match, the toggle is hidden.
  tripCurrency: string;
  homeCurrency: string;
  // Gross pair-direction debt in home currency. Prefill source for the
  // amount input. 0 means no outstanding debt (ad-hoc payment).
  suggestedHomeAmount: number;
}
```

In the component function signature (lines 61-73), remove `lockedExpenseSplitId,` from the destructured parameter list:

```typescript
export function SettleUpModal({
  visible,
  onClose,
  tripId,
  fromUserId,
  toUserId,
  fromName,
  toName,
  tripCurrency,
  homeCurrency,
  suggestedHomeAmount,
}: SettleUpModalProps) {
```

- [ ] **Step 4: Remove the `amountLocked` derivation and its usage**

Delete the line `const amountLocked = lockedExpenseSplitId !== undefined;` (currently line 74).

In the amount `<TextInput ... />` (lines 312-323), change `editable={!amountLocked}` to remove that prop entirely (the input is always editable now) and remove the `opacity: amountLocked ? 0.7 : 1` from its style:

```tsx
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="decimal-pad"
                    style={[styles.amountInput, { color: theme.text }]}
                  />
```

- [ ] **Step 5: Always pass `null` for `expenseSplitId` on submit**

In `handleSubmit` (around line 200), change:

```typescript
        expenseSplitId: lockedExpenseSplitId ?? null,
```

to:

```typescript
        expenseSplitId: null,
```

- [ ] **Step 6: Typecheck**

Run:
```
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```
git add src/components/balance/SettleUpModal.tsx
git commit -m "Remove unused lockedExpenseSplitId from SettleUpModal"
```

---

## Task 5: Verify end-to-end

UI-only refactor — no automated end-to-end test framework in this project. Manual smoke test in the dev build is the verification.

- [ ] **Step 1: Full test suite + typecheck**

Run both:
```
npx tsc --noEmit
npx jest
```

Expected: exit 0 for tsc; all jest suites pass.

- [ ] **Step 2: Start the dev server**

Run:
```
npx expo start
```

Open the app on a device/simulator already paired with the dev build.

- [ ] **Step 3: Smoke-test the Hokkaido shared trip**

Navigate: Home → "Hokkaido road trip" → Balances tab.

Expected to see:
- **Members** section: Ilay and Noa with their total shares (~5,005 ILS each based on current data — unchanged).
- **Outstanding** section: two columns. Left ("You owe") shows one row: Noa, ~271.74 ILS, with a "Pay" CTA. Right ("Owes you") shows one row: Noa, ~4,732.81 ILS, with a "Record" CTA.
- **Shared expenses** section: 8 rows, newest first, starting with the Noa-paid hotel ("מלון טוקיו APA · Jun 2 · 543 ILS · Noa paid · you owe 271 ILS") and continuing through Ilay's split expenses (each with "You paid · Noa owes you X ILS"). No settle buttons on any row.
- **History** section: unchanged from before.

- [ ] **Step 4: Smoke-test the settle interaction**

Tap any OUTSTANDING row. The Settle Up modal should open pre-filled with:
- From/To matching the row's direction
- Amount pre-filled to the row's value (editable; type a smaller number to confirm partial settle works)
- Date defaults to today; note empty

Submit a small partial settlement (e.g., 50 ILS toward "You owe Noa 271"). The modal closes. Back on the Balances screen, the "You owe Noa" row's amount should drop by ~50 (with a small re-convert if the currency toggle was used). The new payment should appear in History.

Long-press the new History row to reverse it. The OUTSTANDING row should return to its original amount.

- [ ] **Step 5: RTL sanity check**

In Settings, switch language to Hebrew. The Balances screen should layout right-to-left:
- Member rows mirror correctly (avatar on the right, amount on the left).
- The two OUTSTANDING columns swap visual position (You owe on the right, Owes you on the left in RTL).
- All text uses the new Hebrew strings from Task 1.

Switch back to English when done.

- [ ] **Step 6: Final commit (if any minor fixes were needed during smoke test)**

If smoke testing surfaced bugs, fix them inline and commit. If everything looked good with no additional changes, no commit needed.

If a follow-up cleanup commit is desired (e.g., remove dead styles `pairCard`, `pairActions`, `settleButton*`, `expandToggle*`, `splitRow*`, `splitMeta*`, `splitTitle*`, `splitSub*`, `splitEmoji*`, `splitSettleButton*` from `StyleSheet.create`), do that here as a separate commit:

```
git add app/(main)/trip/[id]/balances.tsx
git commit -m "Remove dead PairDebtCard styles from balance screen"
```

---

## Out of scope (do not do)

- **Don't migrate** existing `settlement_payments` rows. Legacy attributed rows (with `expense_split_id` not null) continue to be honored by `computeBalance` unchanged.
- **Don't drop the `expense_split_id` column** from `settlement_payments`. Schema is preserved for backwards compat and because the compute logic still uses it.
- **Don't add a settlement preview / confirm step** to the Settle Up modal. Current flow is good.
- **Don't change** Members or History sections.
- **Don't change** `computeBalance` — the previous session already added `grossDebts` and updated unattributed-settlement application.
