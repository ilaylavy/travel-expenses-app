// Trip Balances screen — shows per-member trip-cost share, all outstanding
// pairwise debts (each with a "Settle up" CTA), and a history of recorded
// payments. Long-press a history row to reverse it (soft-delete).
//
// Debts are shown UN-NETTED — both directions of the same pair appear as
// their own card. This keeps each expense's contribution visible in its
// "By Expense" breakdown; pairwise netting would hide whichever side has
// the smaller gross. computeBalance.grossDebts drives the rendering;
// settlement_payments reduce the matching direction directly, with
// overpayments flipping to the opposite direction. byMember is unchanged
// by settlements — it's share of trip cost, not who's paid whom.

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
import {
  selectCategoriesForTrip,
  useCategoryStore,
} from '@/stores/categoryStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useSettlementStore } from '@/stores/settlementStore';
import { useTripStore } from '@/stores/tripStore';
import { syncEngine } from '@/sync/syncEngine';
import type { Category } from '@/types/category';
import type { SettlementPayment } from '@/types/settlement';
import { computeBalance, type PairwiseSettlement } from '@/utils/balance';
import { showConfirmDialog } from '@/utils/confirmDialog';
import { formatAmount, roundAmount } from '@/utils/currency';
import { formatReadableDate } from '@/utils/date';
import { initials } from '@/utils/initials';
import { href } from '@/utils/nav';

interface PairCard {
  fromUserId: string;
  toUserId: string;
  amount: number;
  // When set, this modal entry is for a per-expense settle. amount is the
  // share's home-currency value; expenseSplitId attributes the payment to
  // that specific expense_splits row.
  expenseSplitId?: string;
}

// A split that contributes to a pair's gross debt and hasn't been attributed-
// settled yet. Rendered as a row inside the pair card's expandable section.
interface ContributingSplit {
  splitId: string;
  expenseId: string;
  expenseDate: string;
  categoryEmoji: string;
  categoryName: string;
  note: string | null;
  shareHome: number;
}

export default function BalancesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useGlobalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;

  const trip = useTripStore((s) => s.trips.find((x) => x.id === tripId));
  const expenses = useExpenseStore((s) => s.expenses);
  const splits = useExpenseStore((s) => s.splits);
  const activeExpenseTripId = useExpenseStore((s) => s.activeTripId);
  const loadExpenses = useExpenseStore((s) => s.loadForTrip);
  const refreshExpenses = useExpenseStore((s) => s.refresh);
  const settlements = useSettlementStore((s) => s.settlements);
  const activeSettlementTripId = useSettlementStore((s) => s.activeTripId);
  const loadSettlements = useSettlementStore((s) => s.loadForTrip);
  const refreshSettlements = useSettlementStore((s) => s.refresh);
  const deleteSettlement = useSettlementStore((s) => s.deleteSettlement);
  const allCategories = useCategoryStore((s) => s.categories);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [modalContext, setModalContext] = useState<PairCard | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (tripId && activeExpenseTripId !== tripId) void loadExpenses(tripId);
  }, [tripId, activeExpenseTripId, loadExpenses]);

  useEffect(() => {
    if (tripId && activeSettlementTripId !== tripId) void loadSettlements(tripId);
  }, [tripId, activeSettlementTripId, loadSettlements]);

  // Re-sync whenever the user lands on this screen. In a shared trip, partner
  // expenses arrive via realtime in the happy path, but a missed event (auth
  // refresh gap, dropped channel, background app) would leave the balance
  // stale forever otherwise — there's no other passive catch-up while sitting
  // on this screen.
  useFocusEffect(
    useCallback(() => {
      void syncEngine.triggerSync();
    }, []),
  );

  const handleRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      await syncEngine.triggerSync();
      // triggerSync only refreshes stores when pull actually applied changes;
      // re-read locally so the spinner clears against fresh state either way.
      await Promise.all([refreshExpenses(), refreshSettlements()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshExpenses, refreshSettlements]);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    (async () => {
      const members = await listTripMembers(tripId);
      if (cancelled) return;
      const ids = members.map((m) => m.userId);
      const entries = await Promise.all(
        ids.map(async (id) => [id, (await getProfileName(id)) ?? ''] as const),
      );
      if (cancelled) return;
      const nameMap: Record<string, string> = {};
      for (const [id, name] of entries) if (name) nameMap[id] = name;
      setMemberNames(nameMap);
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const balance = useMemo(
    () => computeBalance({ expenses, splits, settlementPayments: settlements }),
    [expenses, splits, settlements],
  );

  const tripCategories = useMemo(
    () => selectCategoriesForTrip(allCategories, tripId ?? null, { includeArchived: true }),
    [allCategories, tripId],
  );
  const categoriesById = useMemo(() => {
    const out: Record<string, Category> = {};
    for (const c of tripCategories) out[c.id] = c;
    return out;
  }, [tripCategories]);

  // contributingSplitsByPair[`${from}|${to}`] = list of unsettled splits
  // contributing gross debt in that direction (from owes to). Used by the
  // pair card to render the per-expense settle list.
  const contributingSplitsByPair = useMemo(() => {
    const map = new Map<string, ContributingSplit[]>();
    if (!trip) return map;

    const attributedSet = new Set<string>();
    for (const p of settlements) {
      if (p.deletedAt !== null) continue;
      if (p.expenseSplitId !== null) attributedSet.add(p.expenseSplitId);
    }

    const splitsByExpense = new Map<string, typeof splits>();
    for (const s of splits) {
      if (s.deletedAt !== null) continue;
      const list = splitsByExpense.get(s.expenseId) ?? [];
      list.push(s);
      splitsByExpense.set(s.expenseId, list);
    }

    for (const e of expenses) {
      if (e.deletedAt !== null || e.isPrivate || !e.isSplit) continue;
      const expenseSplits = splitsByExpense.get(e.id) ?? [];
      const totalAmount = e.amount;
      const totalConverted = e.convertedAmount;
      const payerId = e.userId;

      for (const s of expenseSplits) {
        if (s.isPayer || s.userId === payerId) continue;
        if (attributedSet.has(s.id)) continue;
        const ratio = totalAmount === 0 ? 0 : s.amount / totalAmount;
        const shareHome = roundAmount(totalConverted * ratio);
        if (Math.abs(shareHome) < 0.01) continue;
        const key = `${s.userId}|${payerId}`;
        const list = map.get(key) ?? [];
        const cat = categoriesById[e.categoryId];
        list.push({
          splitId: s.id,
          expenseId: e.id,
          expenseDate: e.expenseDate,
          categoryEmoji: cat?.emoji ?? '📦',
          categoryName: cat?.name ?? '',
          note: e.note,
          shareHome,
        });
        map.set(key, list);
      }
    }

    for (const list of map.values()) {
      list.sort((a, b) => (a.expenseDate < b.expenseDate ? 1 : -1));
    }

    return map;
  }, [expenses, splits, settlements, categoriesById, trip]);

  if (!trip || !tripId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.missing}>
          <Text style={{ color: theme.textSecondary }}>{t('trips.notFound')}</Text>
          <Pressable
            onPress={() => router.replace(href('/(main)'))}
            style={[styles.linkButton, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.linkButtonText}>{t('trips.backToTrips')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const resolveName = (userId: string): string => {
    if (userId === currentUserId) return t('stats.you');
    return memberNames[userId] ?? '—';
  };

  const currency = trip.homeCurrency;

  const handleReverse = (s: SettlementPayment): void => {
    showConfirmDialog({
      title: t('balances.reverseTitle'),
      body: t('balances.reverseBody'),
      confirmLabel: t('balances.reverseConfirm'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteSettlement(s.id);
        } catch (e) {
          console.warn('Reverse settlement failed', e);
        }
      },
    });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[
            styles.headerButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          hitSlop={8}
        >
          <Text style={[styles.headerButtonText, { color: theme.text }]}>‹</Text>
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEmoji}>{trip.emoji}</Text>
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {t('balances.title')}
          </Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        {/* Members + share totals */}
        {balance.byMember.length > 0 ? (
          <StatsSectionCard title={t('balances.membersSection')}>
            <View style={{ gap: spacing.sm }}>
              {balance.byMember.map((m) => {
                const name = resolveName(m.userId);
                return (
                  <View key={m.userId} style={styles.memberRow}>
                    <View
                      style={[
                        styles.avatar,
                        { backgroundColor: theme.accentSoft },
                      ]}
                    >
                      <Text style={[styles.avatarText, { color: theme.accent }]}>
                        {initials(name)}
                      </Text>
                    </View>
                    <Text
                      style={[styles.memberName, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                    <Text style={[styles.memberAmount, { color: theme.text }]}>
                      {formatAmount(m.total, currency)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </StatsSectionCard>
        ) : null}

        {/* Outstanding debts — one card per direction (un-netted). If A owes B
            $100 and B owes A $30, both cards are shown so each underlying
            expense stays visible in its own card's breakdown. */}
        <StatsSectionCard title={t('balances.outstandingSection')}>
          {balance.grossDebts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🎉</Text>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {t('balances.allSettled')}
              </Text>
              <Text
                style={[styles.emptyBody, { color: theme.textSecondary }]}
              >
                {t('balances.allSettledHint')}
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              {balance.grossDebts.map((p) => {
                const pairKey = `${p.fromUserId}|${p.toUserId}`;
                const splitsForPair = contributingSplitsByPair.get(pairKey) ?? [];
                return (
                  <PairDebtCard
                    key={pairKey}
                    pair={p}
                    currency={currency}
                    resolveName={resolveName}
                    currentUserId={currentUserId}
                    contributingSplits={splitsForPair}
                    onSettlePress={() =>
                      setModalContext({
                        fromUserId: p.fromUserId,
                        toUserId: p.toUserId,
                        amount: p.amount,
                      })
                    }
                    onSettleSplitPress={(split) =>
                      setModalContext({
                        fromUserId: p.fromUserId,
                        toUserId: p.toUserId,
                        amount: split.shareHome,
                        expenseSplitId: split.splitId,
                      })
                    }
                  />
                );
              })}
            </View>
          )}
        </StatsSectionCard>

        {/* History */}
        <StatsSectionCard title={t('balances.historySection')}>
          {settlements.length === 0 ? (
            <Text style={[styles.emptyHistory, { color: theme.textMuted }]}>
              {t('balances.noHistory')}
            </Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              <Text style={[styles.historyHint, { color: theme.textMuted }]}>
                {t('balances.longPressHint')}
              </Text>
              {settlements.map((s) => (
                <HistoryRow
                  key={s.id}
                  settlement={s}
                  resolveName={resolveName}
                  onLongPress={() => handleReverse(s)}
                />
              ))}
            </View>
          )}
        </StatsSectionCard>
      </ScrollView>

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
          lockedExpenseSplitId={modalContext.expenseSplitId}
        />
      ) : null}
    </SafeAreaView>
  );
}

interface PairDebtCardProps {
  pair: PairwiseSettlement;
  currency: string;
  resolveName: (userId: string) => string;
  currentUserId: string | null;
  contributingSplits: ContributingSplit[];
  onSettlePress: () => void;
  onSettleSplitPress: (split: ContributingSplit) => void;
}

function PairDebtCard({
  pair,
  currency,
  resolveName,
  currentUserId,
  contributingSplits,
  onSettlePress,
  onSettleSplitPress,
}: PairDebtCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const fromName = resolveName(pair.fromUserId);
  const toName = resolveName(pair.toUserId);

  // Color: "you owe" = red-soft, "owes you" = green-soft, third-party = accent
  let bg = theme.accentSoft;
  let fg = theme.accent;
  let label: string;
  if (pair.fromUserId === currentUserId) {
    bg = theme.redSoft;
    fg = theme.red;
    label = t('balance.youOwe', {
      name: toName,
      amount: formatAmount(pair.amount, currency),
    });
  } else if (pair.toUserId === currentUserId) {
    bg = theme.greenSoft;
    fg = theme.green;
    label = t('balance.owesYou', {
      name: fromName,
      amount: formatAmount(pair.amount, currency),
    });
  } else {
    label = t('balances.xOwesY', {
      from: fromName,
      to: toName,
      amount: formatAmount(pair.amount, currency),
    });
  }

  return (
    <View style={[styles.pairCard, { backgroundColor: bg }]}>
      <Text style={[styles.pairLabel, { color: fg }]}>{label}</Text>
      <View style={styles.pairActions}>
        <Pressable
          onPress={onSettlePress}
          style={({ pressed }) => [
            styles.settleButton,
            {
              backgroundColor: fg,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          <Text style={styles.settleButtonText}>{t('balances.settleFull')}</Text>
        </Pressable>
        {contributingSplits.length > 0 ? (
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.expandToggle,
              {
                borderColor: fg,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
          >
            <Text style={[styles.expandToggleText, { color: fg }]}>
              {t('balances.byExpenseToggle', { count: contributingSplits.length })}
              {' '}
              {expanded ? '▴' : '▾'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {expanded && contributingSplits.length > 0 ? (
        <View style={styles.splitsList}>
          {contributingSplits.map((s) => (
            <View
              key={s.splitId}
              style={[styles.splitRow, { backgroundColor: theme.surface }]}
            >
              <Text style={styles.splitEmoji}>{s.categoryEmoji}</Text>
              <View style={styles.splitMeta}>
                <Text
                  style={[styles.splitTitle, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {s.note && s.note.trim().length > 0 ? s.note : s.categoryName}
                </Text>
                <Text style={[styles.splitSub, { color: theme.textMuted }]}>
                  {formatReadableDate(s.expenseDate)} · {formatAmount(s.shareHome, currency)}
                </Text>
              </View>
              <Pressable
                onPress={() => onSettleSplitPress(s)}
                style={({ pressed }) => [
                  styles.splitSettleButton,
                  {
                    backgroundColor: fg,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  },
                ]}
              >
                <Text style={styles.splitSettleButtonText}>
                  {t('balances.settleUp')}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

interface HistoryRowProps {
  settlement: SettlementPayment;
  resolveName: (userId: string) => string;
  onLongPress: () => void;
}

function HistoryRow({ settlement, resolveName, onLongPress }: HistoryRowProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const fromName = resolveName(settlement.fromUserId);
  const toName = resolveName(settlement.toUserId);

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.historyRow,
        {
          backgroundColor: theme.surface,
          borderColor: theme.borderLight,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.historyLeft}>
        <Text style={[styles.historyDate, { color: theme.textMuted }]}>
          {formatReadableDate(settlement.settledDate)}
        </Text>
        <Text style={[styles.historyFlow, { color: theme.text }]} numberOfLines={1}>
          {t('balances.fromTo', { from: fromName, to: toName })}
        </Text>
        {settlement.note ? (
          <Text
            style={[styles.historyNote, { color: theme.textSecondary }]}
            numberOfLines={2}
          >
            {settlement.note}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.historyAmount, { color: theme.text }]}>
        {formatAmount(settlement.amount, settlement.currency)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerButton: {
    width: sizing.headerButton,
    height: sizing.headerButton,
    borderRadius: sizing.headerButtonRadius,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: { fontSize: 18, fontWeight: '600', lineHeight: 20 },
  headerTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerEmoji: { fontSize: 24 },
  headerTitle: { ...typography.itemTitle, flex: 1 },
  scroll: {
    padding: spacing.base,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.lg,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: sizing.categoryIconSmall,
    height: sizing.categoryIconSmall,
    borderRadius: sizing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.micro, fontSize: 12 },
  memberName: { ...typography.body, flex: 1 },
  memberAmount: { ...typography.amountSmall },
  emptyState: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { ...typography.itemTitle },
  emptyBody: { ...typography.body, textAlign: 'center' },
  pairCard: {
    borderRadius: sizing.radiusInput,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pairLabel: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  pairActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settleButton: {
    flex: 1,
    borderRadius: sizing.radiusButton,
    paddingVertical: 10,
    alignItems: 'center',
  },
  settleButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  expandToggle: {
    borderRadius: sizing.radiusChip,
    borderWidth: borderWidth.base,
    paddingHorizontal: spacing.md,
    paddingVertical: 8, // chip compact geometry
  },
  expandToggleText: { fontSize: 12, fontWeight: '700' },
  splitsList: { gap: spacing.xs, marginTop: spacing.xs },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: sizing.radiusInput,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  splitEmoji: { fontSize: 20 },
  splitMeta: { flex: 1, gap: 2 },
  splitTitle: { fontSize: 13, fontWeight: '700' },
  splitSub: { fontSize: 11, fontWeight: '500' },
  splitSettleButton: {
    borderRadius: sizing.radiusChip,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  splitSettleButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  historyHint: {
    ...typography.micro,
    fontStyle: 'italic',
  },
  emptyHistory: { ...typography.body, fontStyle: 'italic' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: borderWidth.hairline,
    borderRadius: sizing.radiusInput,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  historyLeft: { flex: 1, gap: 2 },
  historyDate: { fontSize: 11, fontWeight: '600' },
  historyFlow: { fontSize: 14, fontWeight: '700' },
  historyNote: { fontSize: 12, fontWeight: '500' },
  historyAmount: { ...typography.amountSmall },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.base },
  linkButton: {
    borderRadius: sizing.radiusButton,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
  },
  linkButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
