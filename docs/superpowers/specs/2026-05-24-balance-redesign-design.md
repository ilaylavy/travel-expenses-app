# Balance screen redesign — unified directional summary + read-only expense ledger

**Date:** 2026-05-24
**Status:** Draft
**Author:** Ilay + Claude (brainstorming session)

## Motivation

Today's Balance screen shows one card per pair-direction (after the recent un-netted refactor: e.g. "Noa owes you 4,732" + "You owe Noa 271" as two separate cards). For 2-person trips that's already two cards per pair; for 3+ person trips it explodes into `N*(N-1)` cards. The per-expense settle action inside each card is also more granular than wanted — settlements get attributed to specific splits, which creates rigid coupling between an expense edit and its settlement state.

We want a single, scannable view that scales linearly with the number of other members, plus a free-form settlement model that decouples the act of paying someone from any specific expense.

## Goals

- One unified balance view that works for any number of trip members.
- Free-form settlements: pick a person + an amount, the running balance absorbs it.
- Read-only per-expense visibility — see every shared expense you participate in, no inline settle.
- Preserve existing attributed settlement rows so historical balances stay correct.

## Non-goals

- Migrating existing attributed `settlement_payments` rows. They remain in the DB and continue to reduce the matching split's contribution in `computeBalance`. Only the UI stops creating new attributed rows.
- Cross-pair settlement (e.g. "Noa pays Bob through me"). Out of scope.
- Changing the Members or History sections.
- Changing how `computeBalance.byMember` works.

## Layout

Four sections, top-to-bottom, replacing today's `Members → Outstanding (pair cards) → History`:

```
┌─ MEMBERS ──────────────────────── (unchanged)
│  Per-member trip-cost share. Same as today.
└────────────────────────────────────

┌─ OUTSTANDING ─────────────────── (NEW shape)
│  You owe                Owes you
│   Noa   271  [Pay]       Noa  4,732  [Record]
│   Bob   150  [Pay]       Charlie 50  [Record]
└────────────────────────────────────

┌─ SHARED EXPENSES ─────────────── (NEW shape)
│  🏨 מלון טוקיו APA · Jun 2 · 543 ILS
│  Noa paid · you owe 271 ILS
│  ─────────────────────────────────
│  🚗 השכרת רכב · May 9 · 6,068 ILS
│  You paid · Noa owes 3,034 ILS
│  ─────────────────────────────────
│  ...(only expenses you participate in, no settle buttons)
└────────────────────────────────────

┌─ HISTORY ─────────────────────── (unchanged)
│  Recorded settlement payments. Long-press to reverse.
└────────────────────────────────────
```

## Section: OUTSTANDING

Two columns side-by-side: **You owe** (debts where current user is the debtor) on the left, **Owes you** (debts where current user is the creditor) on the right. One row per other member per direction with a non-zero gross balance after settlements.

Source: `BalanceSummary.grossDebts`, filtered to entries that involve the current user (already added in the previous session).

The entire row is a `Pressable`. The right-side button (label "Pay" in the "You owe" column, "Record" in the "Owes you" column — UX hint, not a separate action) is visual affordance; tapping anywhere on the row opens the same `SettleUpModal` pre-filled with:
- `fromUserId`, `toUserId` matching the row's direction
- `amount` pre-filled to the row's gross balance; the user can lower it for a partial settlement
- `expenseSplitId: null` (always unattributed under the new model)

If both directions of a pair are non-zero (e.g. you owe Noa 271 AND Noa owes you 4,732), both rows appear — one in each column. Settling either reduces only that direction; if a settlement amount exceeds the direction's gross, the excess flips to the opposite direction (already implemented in `computeBalance`).

Empty state: when `grossDebts` involving the current user is empty, show today's "🎉 All settled!" copy.

## Section: SHARED EXPENSES

Replaces the old per-pair "By Expense" expandable list. Read-only.

For each row:
- Icon (category emoji), name (expense note or category name), date, total expense converted amount.
- Payer name.
- The user's own direction + share on this expense: "You owe [payer] X ILS" if user is a non-payer in the split, "[non-payer] owes you X ILS" if user is the payer.

**Multi-payer case (3+ person trip):** when current user is the payer and multiple other members are non-payers, show one summary line per other non-payer ("Noa owes you 120 · Bob owes you 80"). Alternative: show only "Others owe you 200" — defer this micro-decision to implementation; default to per-other-person lines for clarity.

**Filter:** only include expenses where the current user has a non-deleted split (i.e. is a participant). Expenses between other members are hidden — they don't affect the user's balance.

**No settle button per row.** The list is purely informational.

Sort: newest first (`expense_date DESC, expense_time DESC, created_at DESC`).

## Settlement model change

Today's behavior:
- Two ways to settle: (a) attributed per-expense settle (creates a row with `expense_split_id` set); (b) pair-level "Settle Full" (creates a row with `expense_split_id = NULL`).
- Attributed rows make `computeBalance` skip that split's debt contribution; unattributed rows reduce the matching pair-direction directly.

New behavior:
- UI only ever creates unattributed rows. `expense_split_id` is always `NULL` for new settlements.
- `computeBalance` keeps its current dual-path handling unchanged — legacy attributed rows continue to be honored exactly as before, so historical balances don't shift.

This means the `expense_split_id` column on `settlement_payments` stays in the schema and the existing RLS / index / trigger setup is untouched. No migration required.

## What goes away (UI only)

- `PairDebtCard` component (per-direction card with "Settle Full" + "By Expense" toggle).
- Per-expense settle button in any context.
- The `lockedExpenseSplitId` path through `SettleUpModal` (the modal already supports unlocked use).
- `contributingSplitsByPair` memo in `BalancesScreen` — superseded by the new SHARED EXPENSES section, which doesn't need per-pair indexing.

## Implementation outline

Touched files:

| File | Change |
|---|---|
| `app/(main)/trip/[id]/balances.tsx` | Replace `OUTSTANDING` section rendering (two-column directional summary). Replace pair cards with new SHARED EXPENSES list. Remove `contributingSplitsByPair` memo and `PairDebtCard` usage. Wire row taps to existing `SettleUpModal` with `expenseSplitId: null`. |
| `app/(main)/trip/[id]/balances.tsx` | Remove inline `PairDebtCard` component definition (or extract to two new components: `DirectionalDebtRow` for OUTSTANDING and `SharedExpenseRow` for SHARED EXPENSES). |
| `src/utils/balance.ts` | No change. `grossDebts` already exists with the right shape. |
| `src/utils/balance.test.ts` | No change. |
| `src/components/balance/SettleUpModal.tsx` | Remove the `lockedExpenseSplitId` prop and its branch — only the deleted `PairDebtCard` used it (verify with grep before removing; if any other callsite is found, keep the prop). The modal otherwise works unchanged for unlocked unattributed use. |
| `src/i18n/locales/en.json` and `he.json` | Add strings: section titles ("You owe", "Owes you"), CTAs ("Pay", "Record"), row formats ("You owe {name} {amount}", "{name} paid · {amount}"), empty-state hints. Hebrew filled in alongside English per project convention. |
| Tests | `balances.tsx` doesn't have unit tests today; no new test files added. Existing `balance.test.ts` covers the underlying compute. |

## Data preservation

- `settlement_payments` table: untouched.
- Existing rows with non-null `expense_split_id`: continue to be honored by `computeBalance` (already-tested code path, no change).
- Existing rows with null `expense_split_id`: continue to be honored (the current behavior since the prior session's refactor).
- New rows from the redesigned UI: always have `expense_split_id = NULL`.

## Edge cases

| Case | Behavior |
|---|---|
| User is paying someone they don't already owe (no prior debt) | Settle modal accepts; row created with `expense_split_id: null`; `computeBalance` adds the excess to the opposite direction, so the receiver now owes the payer. Matches today's `creates a reverse debt when a settlement is recorded without prior debt` test. |
| User over-settles (pays more than owed) | Excess flips to opposite direction. OUTSTANDING updates: original row disappears, opposite-direction row appears or grows. |
| User reverses a historical attributed settlement (long-press in HISTORY) | Attributed split's debt re-opens in the matching SHARED EXPENSES row's amount. OUTSTANDING summary grows accordingly. No special UI treatment needed. |
| Trip with 3+ members, expense between two other members | Excluded from SHARED EXPENSES (user not a participant). `byMember` and `grossDebts` for other-other pairs still calculated but not shown in OUTSTANDING (we filter to rows involving the current user). |
| Expense edited after a settlement was recorded | Settlement amount is in home currency, locked at settlement time. Balance compute uses current expense values. Editing an expense changes its share-contribution but not the settlement amount. Existing behavior. |
| All settled | OUTSTANDING shows "🎉 All settled!" empty state. SHARED EXPENSES still lists historical expenses if any. |

## Open questions

None — all major decisions confirmed in chat.

## References

- Previous session: added `grossDebts` to `computeBalance` (un-netted directional). See `git log src/utils/balance.ts`.
- `src/utils/balance.ts` — `computeBalance`, `BalanceSummary`, `PairwiseSettlement`.
- `app/(main)/trip/[id]/balances.tsx` — screen being redesigned.
- `src/components/balance/SettleUpModal.tsx` — settlement creation modal (unchanged shape, fewer entry points).
