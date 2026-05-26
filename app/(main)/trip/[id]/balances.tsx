// Trip Balances screen — redesigned per
// .claude/skills/travel-expenses-design/redesigns/balance/balance-screen.jsx.
//
// Sections, top → bottom:
//   1. Header (back + "Balance" title + trip · N members subtitle)
//   2. BalanceHero  — big signed net amount + tone sentence
//   3. SettledEmptyCard (when no outstanding)
//   4. Owes you      — section label + OwesYouRow per debt
//   5. You owe       — section label + YouOweRow per debt
//   6. Members       — section label + MembersShareCard
//   7. Recent settlements — section label + BalanceHistoryRow per entry
//   8. Shared expenses    — section label + inline read-only ledger
//
// Behavior preservation: tapping a debt on EITHER side still opens the
// SettleUpModal pre-filled with that pair's direction + amount. The design's
// asymmetric "receiver-only" model is intentionally NOT adopted here — that
// would be a behavior change, not a reskin.

import { useFocusEffect, useGlobalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BalanceHero } from '@/components/balance/BalanceHero';
import { BalanceHistoryRow } from '@/components/balance/BalanceHistoryRow';
import { MembersShareCard } from '@/components/balance/MembersShareCard';
import { OwesYouRow } from '@/components/balance/OwesYouRow';
import { SettledEmptyCard } from '@/components/balance/SettledEmptyCard';
import { SettleUpModal } from '@/components/balance/SettleUpModal';
import { YouOweRow } from '@/components/balance/YouOweRow';
import { Icon } from '@/components/Icon';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { getProfileName } from '@/db/queries/profiles';
import { listTripMembers } from '@/db/queries/trips';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useSettlementStore } from '@/stores/settlementStore';
import { pushToast } from '@/stores/toastStore';
import { useTripStore } from '@/stores/tripStore';
import { syncEngine } from '@/sync/syncEngine';
import { computeBalance } from '@/utils/balance';
import {
  selectBalanceCardSummary,
  selectMySharedExpenses,
  selectOutstandingForUser,
  type SharedExpenseRow,
} from '@/utils/balanceDisplay';
import { showConfirmDialog } from '@/utils/confirmDialog';
import { formatAmount } from '@/utils/currency';
import { formatReadableDate } from '@/utils/date';
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

  // Re-sync whenever the user lands on this screen. In a shared trip,
  // partner expenses arrive via realtime in the happy path, but a missed
  // event (auth refresh gap, dropped channel, background app) would leave
  // the balance stale forever otherwise.
  useFocusEffect(
    useCallback(() => {
      void syncEngine.triggerSync();
    }, []),
  );

  const handleRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      await syncEngine.triggerSync();
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

  const outstanding = useMemo(
    () =>
      currentUserId
        ? selectOutstandingForUser(balance.settlements, currentUserId)
        : { youOwe: [], owesYou: [] },
    [balance.settlements, currentUserId],
  );

  // Signed net across all the current user's outstanding pairs. Drives
  // the hero amount + sentence tone.
  const balanceSummary = useMemo(
    () =>
      currentUserId
        ? selectBalanceCardSummary(balance.settlements, currentUserId)
        : null,
    [balance.settlements, currentUserId],
  );

  // Read-only ledger: every split expense the current user participates
  // in, newest first.
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
  const memberCount = Object.keys(memberNames).length;
  const hasOutstanding =
    outstanding.youOwe.length > 0 || outstanding.owesYou.length > 0;

  const handleReverse = (s: typeof settlements[number]): void => {
    showConfirmDialog({
      title: t('balances.reverseTitle'),
      body: t('balances.reverseBody'),
      confirmLabel: t('balances.reverseConfirm'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteSettlement(s.id);
          pushToast(t('settleUp.toastReversed'), 'success');
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
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [
            styles.headerButton,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
          hitSlop={8}
        >
          <Icon name="chevron-left" size={18} color={theme.text} stroke={2} />
        </Pressable>
        <View style={styles.headerTitleCol}>
          <Text
            accessibilityRole="header"
            style={[styles.headerTitle, { color: theme.text }]}
            numberOfLines={1}
          >
            {t('balances.title')}
          </Text>
          <Text
            style={[styles.headerSubtitle, { color: theme.textMuted }]}
            numberOfLines={1}
          >
            {t('balances.tripSubtitle', { tripName: trip.name, count: memberCount })}
          </Text>
        </View>
        {/* Trailing spacer matches the leading button slot so the title
            column is visually centered without a real action on this side. */}
        <View style={[styles.headerButton, styles.headerSpacer]} />
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
        <BalanceHero net={balanceSummary?.net ?? 0} currency={currency} />

        {!hasOutstanding ? (
          <View style={styles.settledWrap}>
            <SettledEmptyCard sharedExpenseCount={mySharedExpenses.length} />
          </View>
        ) : null}

        {outstanding.owesYou.length > 0 ? (
          <View>
            <SectionLabel
              count={outstanding.owesYou.length}
              dotColor={theme.green}
            >
              {t('balances.owesYouLabel')}
            </SectionLabel>
            {outstanding.owesYou.map((d) => (
              <OwesYouRow
                key={`${d.fromUserId}|${d.toUserId}`}
                debt={d}
                name={resolveName(d.fromUserId)}
                currency={currency}
                onPress={() =>
                  setModalContext({
                    fromUserId: d.fromUserId,
                    toUserId: d.toUserId,
                    amount: d.amount,
                  })
                }
              />
            ))}
          </View>
        ) : null}

        {outstanding.youOwe.length > 0 ? (
          <View>
            <SectionLabel
              count={outstanding.youOwe.length}
              dotColor={theme.red}
            >
              {t('balances.youOweLabel')}
            </SectionLabel>
            {outstanding.youOwe.map((d) => (
              <YouOweRow
                key={`${d.fromUserId}|${d.toUserId}`}
                debt={d}
                name={resolveName(d.toUserId)}
                currency={currency}
                onPress={() =>
                  setModalContext({
                    fromUserId: d.fromUserId,
                    toUserId: d.toUserId,
                    amount: d.amount,
                  })
                }
              />
            ))}
          </View>
        ) : null}

        {balance.byMember.length > 0 ? (
          <View>
            <SectionLabel>{t('balances.membersSection')}</SectionLabel>
            <MembersShareCard
              members={balance.byMember}
              resolveName={resolveName}
              currency={currency}
            />
          </View>
        ) : null}

        {settlements.length > 0 ? (
          <View>
            <SectionLabel count={settlements.length}>
              {t('balances.historySection')}
            </SectionLabel>
            {settlements.map((s) => (
              <BalanceHistoryRow
                key={s.id}
                settlement={s}
                resolveName={resolveName}
                onReverse={() => handleReverse(s)}
              />
            ))}
            <Text style={[styles.footnote, { color: theme.textMuted }]}>
              {t('balances.historyReverseFootnote')}
            </Text>
          </View>
        ) : null}

        <View>
          <SectionLabel>{t('balances.sharedExpensesSection')}</SectionLabel>
          {mySharedExpenses.length === 0 ? (
            <Text style={[styles.emptyLedger, { color: theme.textMuted }]}>
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
        </View>
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

// Inline read-only ledger row — kept from the previous implementation
// because the design's "ledger link" variant requires a separate screen
// which is feature work, not a reskin.
interface SharedExpenseRowItemProps {
  row: SharedExpenseRow;
  currency: string;
  resolveName: (userId: string) => string;
}

function SharedExpenseRowItem({ row, currency, resolveName }: SharedExpenseRowItemProps) {
  const theme = useTheme();
  const { t } = useTranslation();

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
    <View
      style={[
        styles.ledgerRow,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={styles.ledgerHeader}>
        <Text style={[styles.ledgerTitle, { color: theme.text }]} numberOfLines={1}>
          {row.expense.note && row.expense.note.trim().length > 0
            ? row.expense.note
            : '—'}
        </Text>
        <Text style={[styles.ledgerTotal, { color: theme.text }]}>
          {formatAmount(row.expense.convertedAmount, currency)}
        </Text>
      </View>
      <Text style={[styles.ledgerMeta, { color: theme.textMuted }]}>
        {formatReadableDate(row.expense.expenseDate)}
      </Text>
      <Text style={[styles.ledgerBody, { color: theme.textSecondary }]}>
        {[headLabel, ...tailLabels].join(' · ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xs + 2,
    paddingBottom: spacing.sm,
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
  headerSpacer: { borderColor: 'transparent', opacity: 0 },
  headerTitleCol: { flex: 1, minWidth: 0, gap: 2 },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  scroll: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxxl,
  },
  settledWrap: { marginTop: spacing.lg },
  footnote: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
    paddingHorizontal: spacing.xs + 2,
    paddingTop: spacing.xs,
  },
  emptyLedger: {
    ...typography.body,
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
  ledgerRow: {
    borderRadius: sizing.radiusInput,
    borderWidth: borderWidth.hairline,
    padding: spacing.md + 2,
    gap: spacing.xs,
  },
  ledgerHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  ledgerTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  ledgerTotal: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  ledgerMeta: { fontSize: 11, fontWeight: '500' },
  ledgerBody: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.base },
  linkButton: {
    borderRadius: sizing.radiusButton,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2,
  },
  linkButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
