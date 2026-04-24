import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryBreakdownCard } from '@/components/stats/CategoryBreakdownCard';
import { DailySpendingChart } from '@/components/stats/DailySpendingChart';
import { PaymentBreakdownCard } from '@/components/stats/PaymentBreakdownCard';
import { SplitBalanceCard } from '@/components/stats/SplitBalanceCard';
import { SummaryPills } from '@/components/stats/SummaryPills';
import { TopExpensesCard } from '@/components/stats/TopExpensesCard';
import { sizing, spacing, typography } from '@/constants/theme';
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
import { useTripStore } from '@/stores/tripStore';
import type { Category } from '@/types/category';
import { todayIsoDate } from '@/utils/date';
import { href } from '@/utils/nav';
import { aggregate } from '@/utils/statsAggregations';

export default function TripStatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useGlobalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;

  const trip = useTripStore((s) => s.trips.find((x) => x.id === tripId));
  const expenses = useExpenseStore((s) => s.expenses);
  const activeTripId = useExpenseStore((s) => s.activeTripId);
  const loadForTrip = useExpenseStore((s) => s.loadForTrip);
  const allCategories = useCategoryStore((s) => s.categories);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (tripId && activeTripId !== tripId) void loadForTrip(tripId);
  }, [tripId, activeTripId, loadForTrip]);

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
  const stats = useMemo(() => {
    if (!trip) return null;
    return aggregate({ expenses, trip, today });
  }, [expenses, trip, today]);

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
  const isOngoing = trip.endDate === null;
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
          <Text style={[styles.headerButtonText, { color: theme.text }]}>‹</Text>
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEmoji}>{trip.emoji}</Text>
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {trip.name}
          </Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {!hasExpenses ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📊</Text>
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
        >
          <SummaryPills
            stats={stats}
            currency={currency}
            hasBudget={trip.budget !== null && trip.budget > 0}
            isOngoing={isOngoing}
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
          {memberIds.length > 1 ? (
            <SplitBalanceCard
              byMember={stats.byMember}
              settlement={stats.settlement}
              currency={currency}
              currentUserId={currentUserId}
              memberNames={memberNames}
            />
          ) : null}
          <PaymentBreakdownCard
            byPaymentMethod={stats.byPaymentMethod}
            currency={currency}
          />
          <TopExpensesCard
            expenses={stats.topExpenses}
            categoriesById={categoriesById}
            tripId={tripId}
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
    borderWidth: 1,
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
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyEmoji: { fontSize: 64 },
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
    paddingVertical: 12,
  },
  linkButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
