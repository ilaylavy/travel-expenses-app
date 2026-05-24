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

import { useFocusEffect, useGlobalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SettleUpModal } from '@/components/balance/SettleUpModal';
import { StatsSectionCard } from '@/components/stats/StatsSectionCard';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { getProfileName } from '@/db/queries/profiles';
import { listTripMembers } from '@/db/queries/trips';
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

// Settle modal pre-fill: pair direction + gross amount (editable in the modal).
interface SettleContext {
  fromUserId: string;
  toUserId: string;
  amount: number;
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
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [modalContext, setModalContext] = useState<SettleContext | null>(null);
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
        />
      ) : null}
    </SafeAreaView>
  );
}

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
    gap: spacing.xs,
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
    gap: spacing.xs,
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
