import { LinearGradient } from 'expo-linear-gradient';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  I18nManager,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SwipeableExpenseCard } from '@/components/expense/card/SwipeableExpenseCard';
import { ExpenseStatsStrip } from '@/components/expense/stats/ExpenseStatsStrip';
import { FilterModal, type FilterOption } from '@/components/ui/FilterModal';
import { FilterPill } from '@/components/ui/FilterPill';
import { KeyboardAwareWrapper } from '@/components/ui/KeyboardAwareWrapper';
import { SyncStatusDot } from '@/components/ui/SyncStatusDot';
import { sizing, spacing, typography } from '@/constants/theme';
import { getProfileName } from '@/db/queries/profiles';
import { listTripMembers } from '@/db/queries/trips';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import {
  selectCategoriesForTrip,
  useCategoryStore,
} from '@/stores/categoryStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTripStore } from '@/stores/tripStore';
import { syncEngine } from '@/sync/syncEngine';
import type { ExpenseWithPhotos } from '@/types/expense';
import { getCategoryDisplayName } from '@/utils/category';
import { formatAmount, todayDateString } from '@/utils/currency';
import { formatDayWithYear } from '@/utils/date';
import { groupExpensesByDate, type ExpenseDateGroup } from '@/utils/expenseGrouping';
import { href } from '@/utils/nav';
import { aggregate } from '@/utils/statsAggregations';

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatYearMonth(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  const m = Number(mStr) - 1;
  if (m < 0 || m > 11) return ym;
  return `${MONTH_SHORT[m]} ${yStr}`;
}

function extractCity(placeName: string | null): string | null {
  if (!placeName) return null;
  const parts = placeName.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return parts[parts.length - 1];
}

function titleCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type FilterKey = 'category' | 'payment' | 'member' | 'place' | 'month';

export default function TripExpensesScreen() {
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
  const deleteExpense = useExpenseStore((s) => s.deleteExpense);
  const allCategories = useCategoryStore((s) => s.categories);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const [query, setQuery] = useState('');
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(() => new Set());
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(() => new Set());
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(() => new Set());
  const [selectedPlaces, setSelectedPlaces] = useState<Set<string>>(() => new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(() => new Set());
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);

  const isSharedTrip = Object.keys(memberNames).length > 1;

  useEffect(() => {
    if (tripId && activeTripId !== tripId) void loadForTrip(tripId);
  }, [tripId, activeTripId, loadForTrip]);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    (async () => {
      const members = await listTripMembers(tripId);
      if (cancelled) return;
      const entries = await Promise.all(
        members.map(
          async (m) => [m.userId, (await getProfileName(m.userId)) ?? ''] as const,
        ),
      );
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const [id, name] of entries) if (name) map[id] = name;
      setMemberNames(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const tripCategories = useMemo(
    () => selectCategoriesForTrip(allCategories, tripId ?? null),
    [allCategories, tripId],
  );
  const categoryById = useMemo(
    () => new Map(tripCategories.map((c) => [c.id, c])),
    [tripCategories],
  );

  const stats = useMemo(() => {
    if (!trip) return null;
    return aggregate({
      expenses,
      splits,
      trip,
      today: todayDateString(),
      currentUserId,
    });
  }, [expenses, splits, trip, currentUserId]);

  const expenseCount = useMemo(
    () => expenses.filter((e) => e.deletedAt === null && !e.isRefund).length,
    [expenses],
  );

  // ----- Filter option lists derived from current expenses -----

  const categoryOptions = useMemo<FilterOption[]>(() => {
    const tally = new Map<string, number>();
    for (const e of expenses) {
      tally.set(e.categoryId, (tally.get(e.categoryId) ?? 0) + 1);
    }
    return tripCategories
      .filter((c) => tally.has(c.id))
      .map((c) => ({
        id: c.id,
        label: getCategoryDisplayName(c, t),
        emoji: c.emoji,
        count: tally.get(c.id) ?? 0,
      }));
  }, [expenses, tripCategories, t]);

  const paymentOptions = useMemo<FilterOption[]>(() => {
    const tally = new Map<string, number>();
    for (const e of expenses) {
      const m = e.paymentMethod;
      if (!m) continue;
      tally.set(m, (tally.get(m) ?? 0) + 1);
    }
    return Array.from(tally.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([id, count]) => ({ id, label: titleCase(id), count }));
  }, [expenses]);

  const memberOptions = useMemo<FilterOption[]>(() => {
    const tally = new Map<string, number>();
    for (const e of expenses) {
      tally.set(e.userId, (tally.get(e.userId) ?? 0) + 1);
    }
    return Array.from(tally.entries())
      .map(([id, count]) => ({
        id,
        label: memberNames[id] ?? '—',
        count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [expenses, memberNames]);

  const placeOptions = useMemo<FilterOption[]>(() => {
    // Dedup case-insensitively but preserve first-seen casing for display.
    const seen = new Map<string, { display: string; count: number }>();
    for (const e of expenses) {
      const city = extractCity(e.placeName);
      if (!city) continue;
      const key = city.toLowerCase();
      const existing = seen.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        seen.set(key, { display: city, count: 1 });
      }
    }
    return Array.from(seen.entries())
      .map(([id, v]) => ({ id, label: v.display, count: v.count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [expenses]);

  const monthOptions = useMemo<FilterOption[]>(() => {
    const tally = new Map<string, number>();
    for (const e of expenses) {
      const ym = e.expenseDate.slice(0, 7);
      tally.set(ym, (tally.get(ym) ?? 0) + 1);
    }
    return Array.from(tally.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, count]) => ({ id, label: formatYearMonth(id), count }));
  }, [expenses]);

  // ----- Filtering -----

  const filteredExpenses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses.filter((e) => {
      if (selectedCategoryIds.size > 0 && !selectedCategoryIds.has(e.categoryId)) return false;
      if (selectedPayments.size > 0) {
        if (!e.paymentMethod || !selectedPayments.has(e.paymentMethod)) return false;
      }
      if (selectedMembers.size > 0 && !selectedMembers.has(e.userId)) return false;
      if (selectedPlaces.size > 0) {
        const city = extractCity(e.placeName);
        if (!city || !selectedPlaces.has(city.toLowerCase())) return false;
      }
      if (selectedMonths.size > 0 && !selectedMonths.has(e.expenseDate.slice(0, 7))) return false;
      if (q !== '') {
        const note = (e.note ?? '').toLowerCase();
        const place = (e.placeName ?? '').toLowerCase();
        if (!note.includes(q) && !place.includes(q)) return false;
      }
      return true;
    });
  }, [
    expenses,
    query,
    selectedCategoryIds,
    selectedPayments,
    selectedMembers,
    selectedPlaces,
    selectedMonths,
  ]);

  // Share-aware getter: returns the current user's share for split expenses,
  // null otherwise (so the grouping util uses the full amount). For split
  // expenses without a row for this user, we keep the full amount visible
  // and let the SPLIT badge convey that it's not their cost — but it's also
  // not their share, so they shouldn't see it added to subtotals at all.
  const getShareForExpense = useCallback<
    (expenseId: string) => { amount: number; convertedAmount: number } | null
  >(
    (expenseId) => {
      const expense = filteredExpenses.find((e) => e.id === expenseId);
      if (!expense || !expense.isSplit) return null;
      const userSplit = splits.find(
        (s) =>
          s.expenseId === expenseId &&
          s.userId === currentUserId &&
          s.deletedAt === null,
      );
      if (!userSplit) {
        // User isn't a participant — show full amount but don't count toward
        // subtotal. We achieve "don't count" by returning a 0 share here; the
        // ExpenseCard call site will still render the full amount.
        return { amount: 0, convertedAmount: 0 };
      }
      const ratio = expense.amount === 0 ? 0 : userSplit.amount / expense.amount;
      return {
        amount: userSplit.amount,
        convertedAmount: expense.convertedAmount * ratio,
      };
    },
    [filteredExpenses, splits, currentUserId],
  );

  const sections = useMemo<ExpenseDateGroup[]>(
    () => groupExpensesByDate(filteredExpenses, getShareForExpense),
    [filteredExpenses, getShareForExpense],
  );

  // ----- Toggle helpers -----

  const toggleIn = useCallback(
    (set: Set<string>, setter: (s: Set<string>) => void) => (id: string) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setter(next);
    },
    [],
  );

  const handleClearAll = useCallback(() => {
    setSelectedCategoryIds(new Set());
    setSelectedPayments(new Set());
    setSelectedMembers(new Set());
    setSelectedPlaces(new Set());
    setSelectedMonths(new Set());
  }, []);

  const anyFilterActive =
    selectedCategoryIds.size > 0 ||
    selectedPayments.size > 0 ||
    selectedMembers.size > 0 ||
    selectedPlaces.size > 0 ||
    selectedMonths.size > 0;

  const handlePressRow = useCallback(
    (expense: ExpenseWithPhotos) => {
      router.push(href(`/trip/${tripId}/expense/${expense.id}`));
    },
    [router, tripId],
  );

  const handleDelete = useCallback(
    async (expense: ExpenseWithPhotos) => {
      try {
        await deleteExpense(expense.id);
      } catch (error) {
        console.warn('Failed to delete expense:', error);
        Alert.alert(t('expensesList.deleteFailedTitle'));
      }
    },
    [deleteExpense, t],
  );

  const labelForGroup = useCallback(
    (group: ExpenseDateGroup): string => {
      if (group.kind === 'today') return t('expensesList.dateToday');
      if (group.kind === 'yesterday') return t('expensesList.dateYesterday');
      return formatDayWithYear(group.date);
    },
    [t],
  );

  if (!trip || !tripId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.missing}>
          <Text style={{ color: theme.textSecondary }}>{t('trips.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasExpenses = expenses.length > 0;
  const filteredAway = hasExpenses && sections.length === 0;

  // ----- Pill summary helpers -----

  function summarize(
    selected: Set<string>,
    options: FilterOption[],
    fallback: string,
    countKey: 'expenses.filterNCategories' | 'expenses.filterNSelected',
  ): string {
    if (selected.size === 0) return fallback;
    if (selected.size <= 2) {
      const labels = options.filter((o) => selected.has(o.id)).map((o) => o.label);
      return labels.join(', ');
    }
    return t(countKey, { count: selected.size });
  }

  const categorySummary = summarize(
    selectedCategoryIds,
    categoryOptions,
    t('expenses.filterAll'),
    'expenses.filterNCategories',
  );
  const paymentSummary = summarize(
    selectedPayments,
    paymentOptions,
    t('expenses.filterAllPayments'),
    'expenses.filterNSelected',
  );
  const memberSummary = summarize(
    selectedMembers,
    memberOptions,
    t('expenses.filterEveryone'),
    'expenses.filterNSelected',
  );
  const placeSummary = summarize(
    selectedPlaces,
    placeOptions,
    t('expenses.filterAllPlaces'),
    'expenses.filterNSelected',
  );
  const monthSummary = summarize(
    selectedMonths,
    monthOptions,
    t('expenses.filterAllTime'),
    'expenses.filterNSelected',
  );

  const listHeader = (
    <View>
      {stats ? (
        <ExpenseStatsStrip
          trip={trip}
          totalSpent={stats.totalSpent}
          dailyAverage={stats.dailyAverage}
          daysElapsed={stats.daysElapsed}
          budgetHome={stats.budgetHome}
          budgetRemaining={stats.budgetRemaining}
          expenseCount={expenseCount}
        />
      ) : null}

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('expensesList.searchPlaceholder')}
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={[
          styles.searchInput,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
      >
        <FilterPill
          label={t('expenses.filterCategory')}
          summary={categorySummary}
          active={selectedCategoryIds.size > 0}
          onPress={() => setOpenFilter('category')}
        />
        <FilterPill
          label={t('expenses.filterPayment')}
          summary={paymentSummary}
          active={selectedPayments.size > 0}
          onPress={() => setOpenFilter('payment')}
        />
        {isSharedTrip ? (
          <FilterPill
            label={t('expenses.filterMember')}
            summary={memberSummary}
            active={selectedMembers.size > 0}
            onPress={() => setOpenFilter('member')}
          />
        ) : null}
        <FilterPill
          label={t('expenses.filterLocation')}
          summary={placeSummary}
          active={selectedPlaces.size > 0}
          onPress={() => setOpenFilter('place')}
        />
        <FilterPill
          label={t('expenses.filterMonth')}
          summary={monthSummary}
          active={selectedMonths.size > 0}
          onPress={() => setOpenFilter('month')}
        />
        {anyFilterActive ? (
          <Pressable
            onPress={handleClearAll}
            style={[
              styles.clearButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            accessibilityLabel={t('expenses.filterClearAll')}
            hitSlop={6}
          >
            <Text style={[styles.clearButtonText, { color: theme.textSecondary }]}>✕</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );

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
        <Pressable
          onPress={() => {
            void syncEngine.triggerSync();
          }}
          style={[
            styles.headerButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          hitSlop={8}
        >
          <SyncStatusDot />
        </Pressable>
      </View>

      <KeyboardAwareWrapper hasBottomTab style={styles.flex}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={hasExpenses ? listHeader : null}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderSectionHeader={({ section }) => (
          <View
            style={[
              styles.sectionHeader,
              { backgroundColor: theme.bg, borderBottomColor: theme.borderLight },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {labelForGroup(section)}
            </Text>
            <Text style={[styles.sectionSubtotal, { color: theme.textSecondary }]}>
              {formatAmount(section.subtotal, trip.homeCurrency)}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const loggedById = item.expense.userId;
          const isSelfLogged = loggedById === currentUserId;
          const loggedByName = isSharedTrip ? memberNames[loggedById] ?? null : null;
          // Split + non-participant: don't override the displayed amount —
          // user sees the full amount with the SPLIT badge (they owe nothing).
          const userSplitExists = splits.some(
            (s) =>
              s.expenseId === item.expense.id &&
              s.userId === currentUserId &&
              s.deletedAt === null,
          );
          const skipShareOverride = item.expense.isSplit && !userSplitExists;
          return (
            <SwipeableExpenseCard
              expense={item.displayExpense}
              category={categoryById.get(item.expense.categoryId) ?? null}
              homeCurrency={trip.homeCurrency}
              onPress={() => handlePressRow(item.expense)}
              onDelete={() => handleDelete(item.expense)}
              confirmTitle={t('expensesList.deleteConfirmTitle')}
              confirmBody={t('expensesList.deleteConfirmBody')}
              confirmLabel={t('common.delete')}
              cancelLabel={t('common.cancel')}
              deleteLabel={t('expensesList.deleteAction')}
              loggedByName={loggedByName}
              isSelfLogged={isSelfLogged}
              canDelete={isSelfLogged}
              userShareAmount={
                skipShareOverride ? undefined : item.userShareAmount
              }
              userShareConverted={
                skipShareOverride ? undefined : item.userShareConverted
              }
            />
          );
        }}
        ListEmptyComponent={
          filteredAway ? (
            <View style={[styles.empty, { borderColor: theme.borderLight }]}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {t('expensesList.emptyFilteredTitle')}
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {t('expensesList.emptyFilteredBody')}
              </Text>
            </View>
          ) : (
            <View style={[styles.empty, { borderColor: theme.borderLight }]}>
              <Text style={styles.emptyEmoji}>💸</Text>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {t('tripView.emptyExpensesTitle')}
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {t('tripView.emptyExpensesBody')}
              </Text>
            </View>
          )
        }
      />
      </KeyboardAwareWrapper>

      <Pressable
        onPress={() => router.push(href(`/add-expense?tripId=${tripId}`))}
        style={({ pressed }) => [
          styles.fab,
          I18nManager.isRTL ? styles.fabLeft : styles.fabRight,
          { shadowColor: theme.accent, transform: [{ scale: pressed ? 0.96 : 1 }] },
        ]}
        accessibilityLabel={t('tripView.addExpense')}
      >
        <LinearGradient
          colors={theme.fabGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <Text style={styles.fabPlus}>＋</Text>
        </LinearGradient>
      </Pressable>

      <FilterModal
        visible={openFilter === 'category'}
        title={t('expenses.filterCategory')}
        options={categoryOptions}
        selectedIds={selectedCategoryIds}
        onToggle={toggleIn(selectedCategoryIds, setSelectedCategoryIds)}
        onSelectAll={() => setSelectedCategoryIds(new Set(categoryOptions.map((o) => o.id)))}
        onClear={() => setSelectedCategoryIds(new Set())}
        onDone={() => setOpenFilter(null)}
      />
      <FilterModal
        visible={openFilter === 'payment'}
        title={t('expenses.filterPayment')}
        options={paymentOptions}
        selectedIds={selectedPayments}
        onToggle={toggleIn(selectedPayments, setSelectedPayments)}
        onSelectAll={() => setSelectedPayments(new Set(paymentOptions.map((o) => o.id)))}
        onClear={() => setSelectedPayments(new Set())}
        onDone={() => setOpenFilter(null)}
      />
      <FilterModal
        visible={openFilter === 'member'}
        title={t('expenses.filterMember')}
        options={memberOptions}
        selectedIds={selectedMembers}
        onToggle={toggleIn(selectedMembers, setSelectedMembers)}
        onSelectAll={() => setSelectedMembers(new Set(memberOptions.map((o) => o.id)))}
        onClear={() => setSelectedMembers(new Set())}
        onDone={() => setOpenFilter(null)}
      />
      <FilterModal
        visible={openFilter === 'place'}
        title={t('expenses.filterLocation')}
        options={placeOptions}
        selectedIds={selectedPlaces}
        onToggle={toggleIn(selectedPlaces, setSelectedPlaces)}
        onSelectAll={() => setSelectedPlaces(new Set(placeOptions.map((o) => o.id)))}
        onClear={() => setSelectedPlaces(new Set())}
        onDone={() => setOpenFilter(null)}
      />
      <FilterModal
        visible={openFilter === 'month'}
        title={t('expenses.filterMonth')}
        options={monthOptions}
        selectedIds={selectedMonths}
        onToggle={toggleIn(selectedMonths, setSelectedMonths)}
        onSelectAll={() => setSelectedMonths(new Set(monthOptions.map((o) => o.id)))}
        onClear={() => setSelectedMonths(new Set())}
        onDone={() => setOpenFilter(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
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
  headerTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerEmoji: { fontSize: 24 },
  headerTitle: { ...typography.itemTitle, flex: 1 },
  searchInput: {
    borderRadius: sizing.radiusInput,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  pillRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.base,
    alignItems: 'center',
  },
  clearButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: { fontSize: 14, fontWeight: '700', lineHeight: 16 },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    borderBottomWidth: 1,
  },
  sectionTitle: { ...typography.sectionTitle },
  sectionSubtotal: { ...typography.amountSmall },
  empty: {
    borderRadius: sizing.radiusCard,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: spacing.xxl,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.sm },
  emptyTitle: { ...typography.itemTitle, marginBottom: 4 },
  emptyBody: { ...typography.secondary, textAlign: 'center' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute',
    bottom: 90,
    width: 62,
    height: 62,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  fabRight: { right: 20 },
  fabLeft: { left: 20 },
  fabInner: {
    flex: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPlus: { color: '#FFFFFF', fontSize: 30, fontWeight: '700', lineHeight: 32 },
});
