# Add-expense toggles redesign + Paid-by selector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the iOS-Switch toggle rows on the add-expense screen with chip buttons, and add a "Paid by" selector inside the Split panel that lets users mark any trip member (not just themselves) as the payer.

**Architecture:** Chip-style controls matching the existing `PaymentMethodRow` pattern. Payer state lives in `useExpenseEntryForm` as a single `payerId` field, plumbed into `equalShares` (for rounding remainder) and `buildSplitsForSave` (for the `is_payer` flag). When the selected payer isn't a participant in the split, a synthetic 0-share payer row is appended so the DB always has an unambiguous payer.

**Tech Stack:** React Native + Expo Router, Zustand, TypeScript strict. Existing components: `Avatar`, `Icon`, `useTheme`, `useTranslation`. Existing utils: `initials`, `getMemberTint`.

**Spec:** `docs/superpowers/specs/2026-05-28-add-expense-toggles-payer-design.md`

**Commit policy for this run:** Do NOT auto-commit. The user will commit changes manually after review. Skip every `git commit` step.

---

## File Structure

| File | Action |
|---|---|
| `src/hooks/useExpenseEntryForm.ts` | Modify — add `payerId` state, edit-mode hydration, update `equalShares` + `buildSplitsForSave` |
| `src/components/expense/entry/AdvancedTogglesSection.tsx` | Rewrite — switches → chips |
| `src/components/expense/entry/SplitParticipantsList.tsx` | Modify — add `SplitPayerRow` block at top; new props |
| `app/(main)/add-expense.tsx` | Modify — pass `payerId`, `setPayerId` to `SplitParticipantsList` |
| `src/i18n/locales/en.json` | Add `split.paidBy`, `split.you`; shorten `expense.excludeToggle` |
| `src/i18n/locales/he.json` | Mirror keys with Hebrew values |
| `src/components/expense/entry/ToggleRow.tsx` | Delete (unused after rewrite) |

---

## Task 1: Add `payerId` state + plumbing in `useExpenseEntryForm`

**Files:**
- Modify: `src/hooks/useExpenseEntryForm.ts`

- [ ] **Step 1: Add `payerId` state.**

In the state declarations section (near line 152, just after `// Split` comment), add:

```ts
const [payerId, setPayerId] = useState<string | null>(null);
```

- [ ] **Step 2: Default the payer to the current user when not editing.**

Inside the user/trip-load effect (around line 200, just after `setIsSharedTrip(joined.length > 1);`), add:

```ts
if (!isEditing) {
  setPayerId((prev) => prev ?? userId);
}
```

`userId` is already in scope from `const userId = user.id;` at line 174.

- [ ] **Step 3: Hydrate `payerId` from existing splits in edit mode.**

Inside the edit-mode hydration effect, in the `if (existing.isSplit)` block (around line 244), after `setSplitParticipants(participants);` and before the `setSplitMode(...)` call, add:

```ts
const paidBy = splits.find((s) => s.isPayer);
if (paidBy) setPayerId(paidBy.userId);
```

- [ ] **Step 4: Update `equalShares` to use `payerId` for the rounding remainder.**

Find the block at lines 418–425:

```ts
if (Math.abs(remainder) > 0 && user) {
  const payerId = user.id;
  if (result[payerId] !== undefined) {
    result[payerId] = roundAmount(result[payerId] + remainder);
  } else {
    result[ids[0]] = roundAmount(result[ids[0]] + remainder);
  }
}
```

Replace with (note the local variable rename to avoid shadowing the new state):

```ts
if (Math.abs(remainder) > 0 && user) {
  const holderId = payerId ?? user.id;
  if (result[holderId] !== undefined) {
    result[holderId] = roundAmount(result[holderId] + remainder);
  } else {
    result[ids[0]] = roundAmount(result[ids[0]] + remainder);
  }
}
```

Add `payerId` to the `useMemo` deps array on line 427: change `[splitEnabled, splitMode, splitParticipants, amountValue, user]` to `[splitEnabled, splitMode, splitParticipants, amountValue, user, payerId]`.

- [ ] **Step 5: Update `buildSplitsForSave` to use selected payer + synthetic payer row.**

Replace the body of `buildSplitsForSave` (lines 560–581) with:

```ts
const buildSplitsForSave = useCallback((): CreateSplitInput[] | null => {
  if (!splitEnabled || !user) return null;
  const effectivePayer = payerId ?? user.id;

  let baseSplits: CreateSplitInput[];
  if (splitMode === 'equal') {
    const ids = Array.from(splitParticipants);
    if (ids.length < 2) return null;
    baseSplits = ids.map((userId) => ({
      userId,
      amount: equalShares[userId] ?? 0,
      isPayer: userId === effectivePayer,
    }));
  } else {
    baseSplits = tripMembers.map((m) => {
      const raw = customAmounts[m.userId] ?? '';
      const n = Number(raw);
      const amount = Number.isFinite(n) ? roundAmount(n) : 0;
      return { userId: m.userId, amount, isPayer: m.userId === effectivePayer };
    });
  }

  const hasPayer = baseSplits.some((s) => s.isPayer);
  if (!hasPayer) {
    baseSplits.push({ userId: effectivePayer, amount: 0, isPayer: true });
  }

  return baseSplits;
}, [splitEnabled, splitMode, splitParticipants, equalShares, customAmounts, tripMembers, user, payerId]);
```

- [ ] **Step 6: Export `payerId` and `setPayerId` from the hook.**

In the `return { ... }` block (around line 754), in the "// Split" section (~line 829), add `payerId,` and `setPayerId,` alongside the other split fields:

```ts
// Split
splitEnabled,
toggleSplit,
splitMode,
setSplitMode,
splitParticipants,
toggleSplitParticipant,
customAmounts,
setCustomAmount,
equalShares,
customAssigned,
customMatchesTotal,
splitRest,
payerId,
setPayerId,
```

- [ ] **Step 7: Type-check.**

Run: `npx tsc --noEmit`
Expected: PASS (no new type errors).

---

## Task 2: Add i18n keys

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/he.json`

- [ ] **Step 1: Shorten `expense.excludeToggle` in English.**

In `src/i18n/locales/en.json`, change the value of `expense.excludeToggle` from `"Exclude from daily metrics"` to `"Exclude"`. Leave `expense.excludeHint` unchanged.

- [ ] **Step 2: Add `split.paidBy` and `split.you` to English.**

In `src/i18n/locales/en.json`, inside the `"split": { ... }` object (around line 527), add after `"paid": "Paid",`:

```json
"paidBy": "Paid by",
"you": "You",
```

The block becomes:

```json
"split": {
  "toggle": "Split this expense",
  "equal": "Equal",
  "custom": "Custom",
  "paid": "Paid",
  "paidBy": "Paid by",
  "you": "You",
  ...
}
```

- [ ] **Step 3: Mirror in Hebrew.**

In `src/i18n/locales/he.json`:
- Change `expense.excludeToggle` value to `"ללא ספירה"`.
- In the `"split": { ... }` object, add:

```json
"paidBy": "שולם על ידי",
"you": "אתה",
```

- [ ] **Step 4: Type-check.**

Run: `npx tsc --noEmit`
Expected: PASS.

---

## Task 3: Rewrite `AdvancedTogglesSection` as chips

**Files:**
- Modify: `src/components/expense/entry/AdvancedTogglesSection.tsx`

- [ ] **Step 1: Replace the file content.**

Overwrite `src/components/expense/entry/AdvancedTogglesSection.tsx` with:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

import { Section } from './Section';

interface ChipDef {
  key: 'refund' | 'exclude' | 'private' | 'split';
  icon: IconName;
  labelKey: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export function AdvancedTogglesSection({
  isRefund,
  setIsRefund,
  isExcluded,
  setIsExcluded,
  isPrivate,
  setIsPrivate,
  isSharedTrip,
  splitEnabled,
  setSplitEnabled,
}: {
  isRefund: boolean;
  setIsRefund: (v: boolean) => void;
  isExcluded: boolean;
  setIsExcluded: (v: boolean) => void;
  isPrivate: boolean;
  setIsPrivate: (v: boolean) => void;
  isSharedTrip: boolean;
  splitEnabled: boolean;
  setSplitEnabled: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  const chips: ChipDef[] = [
    {
      key: 'refund',
      icon: 'refund',
      labelKey: 'expense.refundToggle',
      value: isRefund,
      onChange: setIsRefund,
    },
    {
      key: 'exclude',
      icon: 'exclude',
      labelKey: 'expense.excludeToggle',
      value: isExcluded,
      onChange: setIsExcluded,
    },
  ];
  if (isSharedTrip) {
    chips.push({
      key: 'private',
      icon: 'lock',
      labelKey: 'expense.privateToggle',
      value: isPrivate,
      onChange: setIsPrivate,
    });
    chips.push({
      key: 'split',
      icon: 'users',
      labelKey: 'split.toggle',
      value: splitEnabled,
      onChange: setSplitEnabled,
    });
  }

  return (
    <Section title={t('expense.advancedSection')}>
      <View style={styles.row}>
        {chips.map((chip) => {
          const fg = chip.value ? theme.accent : theme.textSecondary;
          return (
            <Pressable
              key={chip.key}
              onPress={() => chip.onChange(!chip.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: chip.value }}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: chip.value ? theme.accentSoft : theme.surface,
                  borderColor: chip.value ? theme.accent : theme.border,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              <Icon name={chip.icon} size={14} color={fg} stroke={1.8} />
              <Text style={[styles.label, { color: fg }]}>{t(chip.labelKey)}</Text>
            </Pressable>
          );
        })}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
  },
  label: { fontSize: 13, fontWeight: '700' },
});
```

- [ ] **Step 2: Type-check.**

Run: `npx tsc --noEmit`
Expected: PASS.

---

## Task 4: Add `SplitPayerRow` to `SplitParticipantsList`

**Files:**
- Modify: `src/components/expense/entry/SplitParticipantsList.tsx`

- [ ] **Step 1: Add new imports.**

At the top of `src/components/expense/entry/SplitParticipantsList.tsx`, add to the existing imports:

```tsx
import { Avatar } from '@/components/ui/Avatar';
import { initials } from '@/utils/initials';
import { getMemberTint } from '@/utils/memberTint';
```

- [ ] **Step 2: Extend the props.**

Update the component's props type to add `payerId` and `setPayerId`:

```tsx
}: {
  splitMode: SplitMode;
  onModeChange: (mode: SplitMode) => void;
  participants: Set<string>;
  onToggleParticipant: (userId: string) => void;
  customAmounts: Record<string, string>;
  onCustomAmountChange: (userId: string, value: string) => void;
  onTextFocus: () => void;
  equalShares: Record<string, number>;
  customAssigned: number;
  customMatchesTotal: boolean;
  amountValue: number;
  currency: string;
  members: TripMember[];
  memberNames: Record<string, string>;
  currentUserId: string | null;
  onSplitRest: () => void;
  payerId: string | null;
  onPayerChange: (userId: string) => void;
}) {
```

Add `payerId` and `onPayerChange` to the destructured params at the top of the function signature.

- [ ] **Step 3: Render the `Paid by` chip row above the mode chips.**

Inside the `<Section title={t('split.toggle')}>` block, just before the existing `<View style={styles.modeRow}>` block, insert:

```tsx
<View style={styles.payerBlock}>
  <Text style={[styles.subLabel, { color: theme.textMuted }]}>
    {t('split.paidBy')}
  </Text>
  <View style={styles.payerRow}>
    {members.map((m) => {
      const active = payerId === m.userId;
      const name = currentUserId === m.userId
        ? t('split.you')
        : memberNames[m.userId] || m.userId.slice(0, 6);
      const tint = getMemberTint(m.userId, theme);
      const fg = active ? theme.accent : theme.text;
      return (
        <Pressable
          key={m.userId}
          onPress={() => onPayerChange(m.userId)}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          style={({ pressed }) => [
            styles.payerChip,
            {
              backgroundColor: active ? theme.accentSoft : theme.surface,
              borderColor: active ? theme.accent : theme.border,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
          ]}
        >
          <Avatar
            label={initials(name)}
            tint={tint}
            size={22}
            radius={999}
          />
          <Text style={[styles.payerChipText, { color: fg }]} numberOfLines={1}>
            {name}
          </Text>
          {active ? (
            <Icon name="check" size={12} color={theme.accent} stroke={3} />
          ) : null}
        </Pressable>
      );
    })}
  </View>
</View>
```

- [ ] **Step 4: Add the new styles.**

Inside the `StyleSheet.create({ ... })` block, add:

```ts
payerBlock: { gap: 6 },
subLabel: {
  fontSize: 11,
  fontWeight: '700',
  letterSpacing: 0.6,
  textTransform: 'uppercase',
},
payerRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
payerChip: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.xs + 2,
  paddingHorizontal: spacing.md,
  paddingVertical: 8,
  borderRadius: sizing.radiusChip,
  borderWidth: 1.5,
},
payerChipText: { fontSize: 13, fontWeight: '700' },
```

- [ ] **Step 5: Remove the old "PAID" badge from member rows.**

The payer is now selected at the top, so the inline "PAID" badge on each member row is redundant and confusing (it currently only shows on `currentUserId`, not on the selected payer). Remove the badge from both equal-mode and custom-mode blocks:

In the equal-mode `members.map` (around lines 119–125), delete:

```tsx
{isPayer ? (
  <View style={[styles.paidBadge, { backgroundColor: theme.accentSoft }]}>
    <Text style={[styles.paidBadgeText, { color: theme.accent }]}>
      {t('split.paid')}
    </Text>
  </View>
) : null}
```

Also remove the `const isPayer = currentUserId === m.userId;` line just above it.

In the custom-mode `members.map` (around lines 141, 151–157), do the same: remove `const isPayer = currentUserId === m.userId;` and the `{isPayer ? <View ...>...</View> : null}` block.

You can leave the `paidBadge` and `paidBadgeText` style entries in the StyleSheet — they're tiny dead code; the next style cleanup pass can remove them. To stay tidy, delete them too.

- [ ] **Step 6: Type-check.**

Run: `npx tsc --noEmit`
Expected: PASS.

---

## Task 5: Wire `payerId` props in `add-expense.tsx`

**Files:**
- Modify: `app/(main)/add-expense.tsx`

- [ ] **Step 1: Pass new props to `SplitParticipantsList`.**

In `app/(main)/add-expense.tsx`, find the `<SplitParticipantsList ... />` JSX (around lines 227–244). Add two new props anywhere before the closing `/>`:

```tsx
payerId={form.payerId}
onPayerChange={form.setPayerId}
```

The block becomes:

```tsx
<SplitParticipantsList
  splitMode={form.splitMode}
  onModeChange={form.setSplitMode}
  participants={form.splitParticipants}
  onToggleParticipant={form.toggleSplitParticipant}
  customAmounts={form.customAmounts}
  onCustomAmountChange={form.setCustomAmount}
  onTextFocus={form.handleTextFocus}
  equalShares={form.equalShares}
  customAssigned={form.customAssigned}
  customMatchesTotal={form.customMatchesTotal}
  amountValue={form.amountValue}
  currency={form.currency}
  members={form.tripMembers}
  memberNames={form.memberNames}
  currentUserId={form.user?.id ?? null}
  onSplitRest={form.splitRest}
  payerId={form.payerId}
  onPayerChange={form.setPayerId}
/>
```

- [ ] **Step 2: Type-check.**

Run: `npx tsc --noEmit`
Expected: PASS.

---

## Task 6: Delete unused `ToggleRow` component

**Files:**
- Delete: `src/components/expense/entry/ToggleRow.tsx`

- [ ] **Step 1: Verify no other references.**

Run: `Grep -r "ToggleRow" src app`
Expected: zero matches outside `ToggleRow.tsx` itself.

If any match shows up, stop and reconsider — something else is using it.

- [ ] **Step 2: Delete the file.**

Remove `src/components/expense/entry/ToggleRow.tsx`.

- [ ] **Step 3: Type-check.**

Run: `npx tsc --noEmit`
Expected: PASS.

---

## Task 7: Run full type-check + lint

**Files:**
- (no changes)

- [ ] **Step 1: Type-check.**

Run: `npx tsc --noEmit`
Expected: PASS, no new errors.

- [ ] **Step 2: Lint.**

Run: `npx eslint . --ext .ts,.tsx`
Expected: PASS, or only pre-existing warnings (no new ones in the touched files).

---

## Task 8: Manual verification

**Files:**
- (no changes)

Per spec testing notes — run the app and verify each scenario:

- [ ] **Step 1: Start the dev server.**

Run: `npx expo start`

- [ ] **Step 2: New expense on 2-person shared trip, default payer.**

Open Add Expense → confirm the four chips render (Refund, Exclude, Private, Split). Toggle Split on. Confirm the "Paid by" row appears with "You" chip highlighted by default. Save the expense. Confirm in the expense detail that the split is attributed to you.

- [ ] **Step 3: Re-tap "Paid by" to switch to partner.**

In the same flow, toggle Split on → tap the partner's chip in "Paid by" → save. Open the expense and confirm the partner is shown as the payer in the split detail.

- [ ] **Step 4: Edit existing partner-paid split expense.**

Open Add Expense in edit mode on the expense from step 3 → confirm partner's chip is highlighted as the payer on load.

- [ ] **Step 5: Mutex check.**

Toggle Split on → toggle Refund on → confirm Split chip flips off automatically. Toggle Private on while Split is on → confirm Split flips off.

- [ ] **Step 6: Custom mode + payer-not-in-list.**

Toggle Split on → switch to Custom mode → set custom amounts that don't include you (e.g., partner = full amount) → tap your own "Paid by" chip → save. In the DB or expense detail, confirm a 0-share row with `is_payer=true` exists for you.

- [ ] **Step 7: RTL.**

Switch device language to Hebrew → reopen Add Expense → confirm chips mirror right-to-left, labels are Hebrew, and avatars sit on the trailing edge.

- [ ] **Step 8: Light + dark themes.**

Toggle light mode → confirm chip colors render correctly. Toggle dark mode → same.

---

## Self-Review

- [x] **Spec coverage:** Every section in the spec maps to a task (toggles → Task 3; payer row → Task 4; hook plumbing → Task 1; i18n → Task 2; wiring → Task 5; cleanup → Task 6; verify → Tasks 7–8). ✓
- [x] **Placeholder scan:** No "TBD", no "implement later". Every step has the code or the command. ✓
- [x] **Type consistency:** `payerId` and `setPayerId` are the names everywhere. `onPayerChange` is the prop name on `SplitParticipantsList`. ✓
- [x] **Commit policy:** Plan does NOT include commit steps per user instruction. ✓
