import { useFocusEffect, useGlobalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { CategoryBreakdownCard } from '@/components/stats/CategoryBreakdownCard';
import { DailySpendingChart } from '@/components/stats/DailySpendingChart';
import { PaymentBreakdownCard } from '@/components/stats/PaymentBreakdownCard';
import { PeriodSelector, type StatsPeriod } from '@/components/stats/PeriodSelector';
import { SplitBalanceCard } from '@/components/stats/SplitBalanceCard';
import { StatsHero } from '@/components/stats/StatsHero';
import { TopExpensesCard } from '@/components/stats/TopExpensesCard';
import { Avatar } from '@/components/ui/Avatar';
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
import { todayIsoDate } from '@/utils/date';
import { initials } from '@/utils/initials';
import { href } from '@/utils/nav';
import { aggregate } from '@/utils/statsAggregations';
import { getTripTint } from '@/utils/tripTint';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Compute the period window in ISO dates. "trip" returns undefined so
// aggregate() falls back to the trip's natural range.
function resolvePeriodWindow(
  period: StatsPeriod,
  today: string,
): { from?: string; to?: string } {
  if (period === 'trip') return {};
  const days = period === '7d' ? 7 : 30;
  const [y, m, d] = today.split('-').map(Number);
  const past = new Date(Date.UTC(y, m - 1, d - (days - 1)));
  const yy = past.getUTCFullYear();
  const mm = String(past.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(past.getUTCDate()).padStart(2, '0');
  return { from: `${yy}-${mm}-${dd}`, to: today };
}

export default function TripStatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useGlobalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;

  const trip = useTripStore((s) => s.trips.find((x) => x.id === tripId));
  const expenses = useExpenseStore((s) => s.expenses);
  const splits = useExpenseStore((s) => s.splits);
  const activeTripId = useExpenseStore((s) => s.activeTripId);
  const loadForTrip = useExpenseStore((s) => s.loadForTrip);
  const refreshExpenses = useExpenseStore((s) => s.refresh);
  const settlements = useSettlementStore((s) => s.settlements);
  const activeSettlementTripId = useSettlementStore((s) => s.activeTripId);
  const loadSettlements = useSettlementStore((s) => s.loadForTrip);
  const refreshSettlements = useSettlementStore((s) => s.refresh);
  const allCategories = useCategoryStore((s) => s.categories);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<StatsPeriod>('trip');

  useEffect(() => {
    if (tripId && activeTripId !== tripId) void loadForTrip(tripId);
  }, [tripId, activeTripId, loadForTrip]);

  useEffect(() => {
    if (tripId && activeSettlementTripId !== tripId) void loadSettlements(tripId);
  }, [tripId, activeSettlementTripId, loadSettlements]);

  // Pull-to-refresh + focus-sync, same rationale as the balance screen.
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
      setMemberIds(ids);
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

  const tripCategories = useMemo(
    () => selectCategoriesForTrip(allCategories, tripId ?? null, { includeArchived: true }),
    [allCategories, tripId],
  );
  const categoriesById = useMemo(() => {
    const out: Record<string, Category> = {};
    for (const c of tripCategories) out[c.id] = c;
    return out;
  }, [tripCategories]);

  const today = todayIsoDate();
  const window = useMemo(() => resolvePeriodWindow(period, today), [period, today]);

  const stats = useMemo(() => {
    if (!trip) return null;
    return aggregate({
      expenses,
      splits,
      trip,
      today,
      currentUserId,
      settlementPayments: settlements,
      periodFrom: window.from,
      periodTo: window.to,
    });
  }, [expenses, splits, trip, today, currentUserId, settlements, window.from, window.to]);

  // tripSpendShare is the caller's TRIP-WIDE share (not period-filtered) —
  // the hero's budget bar should always reflect the user's progress vs
  // their full-trip budget, regardless of the selected period.
  const tripSpendShare = useMemo(() => {
    if (!trip) return 0;
    return aggregate({
      expenses,
      splits,
      trip,
      today,
      currentUserId,
      settlementPayments: settlements,
    }).totalSpent;
  }, [expenses, splits, trip, today, currentUserId, settlements]);

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

  if (!stats) return null;

  const hasExpenses = expenses.length > 0;
  const currency = trip.homeCurrency;

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
          <Icon name="chevron-left" size={18} color={theme.text} stroke={2} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Avatar
            label={initials(trip.name)}
            tint={getTripTint(trip.id, theme)}
            size={32}
            radius={10}
          />
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {trip.name}
          </Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {!hasExpenses ? (
        <View style={styles.empty}>
          <View style={[styles.emptyGlow, { backgroundColor: theme.accentSoft }]}>
            <Icon name="bar-chart" size={40} color={theme.accent} stroke={2} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            {t('stats.noExpensesTitle')}
          </Text>
          <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
            {t('stats.noExpensesBody')}
          </Text>
        </View>
      ) : (
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
          <PeriodSelector value={period} onChange={setPeriod} />

          <StatsHero
            period={period}
            totalSpent={stats.totalSpent}
            dailyAverage={stats.dailyAverage}
            tripBudget={stats.budgetHome}
            tripSpendShare={tripSpendShare}
            daysRemaining={stats.daysRemaining}
            currency={currency}
          />

          <CategoryBreakdownCard
            byCategory={stats.byCategory}
            categoriesById={categoriesById}
            currency={currency}
          />
          <DailySpendingChart
            byDay={stats.byDay}
            average={stats.dailyAverage}
            currency={currency}
          />
          <TopExpensesCard
            expenses={stats.topExpenses}
            categoriesById={categoriesById}
            tripId={tripId}
            currency={currency}
          />
          {memberIds.length > 1 ? (
            <SplitBalanceCard
              byMember={stats.byMember}
              settlement={stats.settlement}
              currency={currency}
              currentUserId={currentUserId}
              memberNames={memberNames}
              onOpenBalances={() => router.push(href(`/trip/${tripId}/balances`))}
            />
          ) : null}
          <PaymentBreakdownCard
            byPaymentMethod={stats.byPaymentMethod}
            currency={currency}
          />
        </ScrollView>
      )}
    </SafeAreaView>
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
  headerTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: { ...typography.itemTitle, flex: 1 },
  scroll: {
    padding: spacing.base,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.lg,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyGlow: {
    width: 96,
    height: 96,
    borderRadius: sizing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: { ...typography.itemTitle },
  emptyBody: { ...typography.body, textAlign: 'center' },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.base,
  },
  linkButton: {
    borderRadius: sizing.radiusButton,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2,
  },
  linkButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
