# Add-expense toggles redesign + Paid-by selector

**Status:** approved
**Date:** 2026-05-28
**Worktree:** `journal-frontend-redo`

## Goal

Replace the four iOS-Switch toggle rows in the add-expense screen with chip buttons that match the rest of the form (currency, category, payment method, split-mode all already use chips). Add a "Paid by" selector so a user can log an expense their partner actually paid, instead of the current behavior where the logged-in user is silently assumed to be the payer.

## Background

The add-expense screen at `app/(main)/add-expense.tsx` currently renders flag toggles via `AdvancedTogglesSection`, which stacks four `<Switch>` rows (`ToggleRow.tsx`) for: Refund, Exclude from daily metrics, Keep private, Split. These look like a settings page rather than a fast-entry form, and they're the only chip-incompatible controls on the screen.

In `useExpenseEntryForm.ts`, `buildSplitsForSave` hardcodes `isPayer: userId === user.id`, which means every split expense logged by the current user marks the current user as the payer. There is no UI to express "my partner paid this". The `expense_splits.is_payer` column already supports any member as payer; only the client UI is missing.

## Scope

### In scope

1. Rewrite `AdvancedTogglesSection` as a flex-wrap row of chips, identical visual pattern to `PaymentMethodRow`.
2. Add `SplitPayerRow` inside `SplitParticipantsList`, above the Equal/Custom mode chips.
3. Thread `payerId` state through `useExpenseEntryForm`, including edit-mode hydration from `is_payer`.
4. Update `equalShares` rounding-remainder absorption to use the selected payer (not always `user.id`).
5. Update `buildSplitsForSave` to mark the selected payer as `isPayer: true`, with a synthetic 0-share row when the payer is not a participant.
6. Add new i18n keys `split.you`, `split.paidBy`; shorten `expense.excludeToggle` to "Exclude".

### Out of scope

- No DB / schema / sync changes — the column already exists.
- No changes to balance math (`src/utils/balance.ts` already nets pairwise).
- No changes to currency, category, note, location, date, payment-method, or photo sections.
- Hint text under toggles is dropped (chips are self-explanatory).

## UI design

### `AdvancedTogglesSection` — chip layout

```
─── MORE OPTIONS ─────────────────────
[ ↩  Refund ]  [ ⊘  Exclude ]
[ 🔒 Private ]  [ 👥 Split ]
```

- Section title unchanged (`expense.advancedSection` = "More options").
- Component name unchanged so existing imports stay stable.
- Single flex-wrap row of chips. Identical visual pattern to `PaymentMethodRow.tsx`:
  - Inactive: `theme.surface` bg, `theme.border` border, `theme.textSecondary` fg, `borderWidth.hairline`.
  - Active: `theme.accentSoft` bg, `theme.accent` border, `theme.accent` fg.
  - Press scale `0.96` via `Pressable`'s pressed state.
  - Padding: `paddingHorizontal: spacing.lg`, `paddingVertical: spacing.md`; radius `sizing.radiusButton`.
  - Icon size 14, stroke 1.8; label 13/700.
- Icons (from existing `Icon.tsx`): `refund`, `exclude`, `lock`, `users`.
- Labels (i18n): `expense.refundToggle`, `expense.excludeToggle` (shortened), `expense.privateToggle`, `split.toggle`.
- Hint text under toggles is removed entirely from this section.
- Private and Split chips only render when `isSharedTrip` (same condition as today).
- Refund/Private + Split remain mutually exclusive via the existing `useEffect` in `useExpenseEntryForm` (lines 318–325). No extra UI affordance needed — turning Refund on visibly flips Split off because the Split chip's `active` state updates.

### New `SplitPayerRow` inside `SplitParticipantsList`

```
─── SPLIT THIS EXPENSE ───────────────
Paid by
[ ●DL  You  ✓ ]   [ ○CA  Carol ]

Mode
[ Equal ]   [ Custom ]

☑  You              $50.00
☑  Carol            $50.00
```

- Sits above the existing Equal/Custom mode chip row.
- Small uppercase caption "Paid by" using `typography.micro` + `theme.textMuted`.
- Below the caption: flex-wrap row of one chip per `joined` trip member. Each chip:
  - `<Avatar label={initials(name)} tint={getMemberTint(userId, theme)} size={22} radius={999} />` on the leading side.
  - Member name, rendered as `t('split.you')` when `userId === currentUserId`.
  - Active payer chip: `accentSoft` bg + `accent` border + `accent` text + trailing `<Icon name="check" size={12} stroke={3} />`.
  - Inactive: `surface` bg + `border` border + `text` color.
- Tapping a chip sets `payerId` to that member.
- Independent of `splitParticipants` — the user can mark a non-participating member as the payer (e.g., "Dana paid the whole hotel for me alone"). In that case, `buildSplitsForSave` appends a synthetic `{ userId: payerId, amount: 0, isPayer: true }` row so the DB always has an unambiguous payer.

## State & data-layer changes — `useExpenseEntryForm.ts`

### New state

```ts
const [payerId, setPayerId] = useState<string | null>(null);
```

### Default-set when user loads

In the existing user/trip-load effect (line 170-onwards): after `setIsSharedTrip(joined.length > 1)`, also set the default payer if not editing:

```ts
if (!isEditing) setPayerId((prev) => prev ?? userId);
```

### Edit-mode hydration

In the edit-mode hydration effect (lines 217–269), inside the `if (existing.isSplit)` block after `setSplitParticipants(participants)`:

```ts
const paidBy = splits.find((s) => s.isPayer);
if (paidBy) setPayerId(paidBy.userId);
```

If no payer flag is present (legacy data), fall back to `user.id`. We can rely on `splits.find(s => s.isPayer)` returning the first payer; the data model should only have one.

### `equalShares` update (line 408)

Replace:

```ts
const payerId_ = user.id;
if (result[payerId_] !== undefined) {
  result[payerId_] = roundAmount(result[payerId_] + remainder);
}
```

with:

```ts
const remainderHolder = payerId ?? user.id;
if (result[remainderHolder] !== undefined) {
  result[remainderHolder] = roundAmount(result[remainderHolder] + remainder);
}
```

(Use `payerId ?? user.id` because the rounding is for participants only — if the payer isn't a participant, we fall back to `user.id` then to `ids[0]` as today.)

### `buildSplitsForSave` update (line 560)

```ts
const buildSplitsForSave = useCallback((): CreateSplitInput[] | null => {
  if (!splitEnabled || !user) return null;
  const effectivePayer = payerId ?? user.id;

  const baseSplits: CreateSplitInput[] = splitMode === 'equal'
    ? (() => {
        const ids = Array.from(splitParticipants);
        if (ids.length < 2) return [];
        return ids.map((userId) => ({
          userId,
          amount: equalShares[userId] ?? 0,
          isPayer: userId === effectivePayer,
        }));
      })()
    : tripMembers.map((m) => {
        const raw = customAmounts[m.userId] ?? '';
        const n = Number(raw);
        const amount = Number.isFinite(n) ? roundAmount(n) : 0;
        return { userId: m.userId, amount, isPayer: m.userId === effectivePayer };
      });

  if (baseSplits.length === 0) return null;

  const hasPayer = baseSplits.some((s) => s.isPayer);
  if (!hasPayer) {
    baseSplits.push({ userId: effectivePayer, amount: 0, isPayer: true });
  }

  return baseSplits;
}, [splitEnabled, splitMode, splitParticipants, equalShares, customAmounts, tripMembers, user, payerId]);
```

### Hook return

Add `payerId` and `setPayerId` to the returned object alongside the other split fields.

## Files touched

| File | Change |
|---|---|
| `src/components/expense/entry/AdvancedTogglesSection.tsx` | Rewrite as chip layout (no rename) |
| `src/components/expense/entry/SplitParticipantsList.tsx` | Add `SplitPayerRow` block at top; accept `payerId`, `setPayerId`, `tripMembers` already passed |
| `src/hooks/useExpenseEntryForm.ts` | `payerId` state, hydration, plumb into `equalShares` + `buildSplitsForSave` |
| `app/(main)/add-expense.tsx` | Pass `payerId`, `setPayerId` props to `SplitParticipantsList` |
| `src/i18n/locales/en.json` | Add `split.you`, `split.paidBy`; shorten `expense.excludeToggle` |
| `src/i18n/locales/he.json` | Mirror keys with Hebrew values |
| `src/components/expense/entry/ToggleRow.tsx` | Delete (becomes unused) |

No new files. No DB changes. No sync changes.

## Edge cases

| Case | Behavior |
|---|---|
| User leaves screen with split off | `payerId` state is ignored; no splits saved |
| Refund toggled on while Split is on | Existing effect clears Split; `payerId` state is harmless (just sits) |
| Payer = current user (default 2-person trip) | Behaves exactly like today |
| Payer = partner, equal mode | Partner is `isPayer`; current user's share row records the debt; balance math nets correctly |
| Payer not in participants list (equal mode) | Synthetic 0-share payer row appended; balance math handles the debt correctly |
| Custom mode, payer not in `tripMembers` | Defensive: shouldn't happen because chips only show joined members, but the synthetic-row fallback covers it |
| Hebrew / RTL | Chip rows use `flex-direction: row` (mirrors automatically); avatars + check icons are symmetric; no hardcoded `left`/`right` positioning |
| Edit-mode loading a pre-existing split with no `is_payer=true` row (legacy data) | `payerId` stays `null`, falls back to `user.id` |

## i18n strings

```json
{
  "expense": {
    "excludeToggle": "Exclude"
  },
  "split": {
    "paidBy": "Paid by",
    "you": "You"
  }
}
```

The existing `expense.excludeHint` ("Counted in totals but not in daily average or daily chart") is kept in the JSON in case we want to resurface hints later in a help sheet.

Hebrew values (`he.json`):
- `expense.excludeToggle`: "ללא ספירה"
- `split.paidBy`: "שולם על ידי"
- `split.you`: "אתה"

## Testing notes

Manual checks (no automated test for this UI):
1. Create a new expense on a 2-person trip → toggle Split on → tap partner's "Paid by" chip → save → verify in DB that `is_payer=true` is on the partner's split row.
2. Edit that expense → confirm the partner's chip is highlighted as the payer.
3. Toggle Refund on → confirm Split clears and the Split chip goes inactive.
4. In custom mode, set custom amounts that don't include the payer, mark a non-participant as the payer → confirm a synthetic 0-share row is saved with `is_payer=true`.
5. Switch device locale to Hebrew → confirm chips mirror correctly and labels render in Hebrew.
6. Both dark and light theme → confirm chip colors and avatar tints look correct.
