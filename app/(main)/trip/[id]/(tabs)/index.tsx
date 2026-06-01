import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SwipeableExpenseCard } from '@/components/expense/card/SwipeableExpenseCard';
import {
  ExpenseFilterChips,
  type ExpenseFilterKey,
} from '@/components/expense/list/ExpenseFilterChips';
import { ExpenseStatsStrip } from '@/components/expense/stats/ExpenseStatsStrip';
import { Icon } from '@/components/Icon';
import { AskAnythingCard } from '@/components/trip/AskAnythingCard';
import { BalanceCard } from '@/components/trip/BalanceCard';
import { Avatar } from '@/components/ui/Avatar';
import type { FilterOption } from '@/components/ui/FilterModal';
import { KeyboardAwareWrapper } from '@/components/ui/KeyboardAwareWrapper';
import { SyncStatusDot } from '@/components/ui/SyncStatusDot';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { SettlementAttributedError } from '@/db/queries/errors';
import { getProfileName } from '@/db/queries/profiles';
import { listTripMembers } from '@/db/queries/trips';
import { useExpenseShareGetter } from '@/hooks/useExpenseShareGetter';
import { useIsRTL } from '@/hooks/useIsRTL';
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
import type { ExpenseWithPhotos } from '@/types/expense';
import { computeBalance } from '@/utils/balance';
import { selectBalanceCardSummary } from '@/utils/balanceDisplay';
import { getCategoryDisplayName } from '@/utils/category';
import { formatAmount, todayDateString } from '@/utils/currency';
import { formatDayWithYear, todayIsoDate } from '@/utils/date';
import {
  groupExpensesByDate,
  type ExpenseDateGroup,
  type ExpenseListItem,
} from '@/utils/expenseGrouping';
import { initials } from '@/utils/initials';
import { href } from '@/utils/nav';
import { aggregate } from '@/utils/statsAggregations';
import { getTripTint } from '@/utils/tripTint';

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

// Memoized expense row. Pulled out so re-renders of the parent screen
// (search input, scroll-threshold toggle, etc.) don't cascade into every
// row re-rendering — that's what was triggering the VirtualizedList
// "slow to update" warning. Per-item closures for press/delete are bound
// internally with `item` as a stable dep.
interface ExpenseRowProps {
  item: ExpenseListItem;
  category: Category | null;
  homeCurrency: string;
  loggedByName: string | null;
  isSelfLogged: boolean;
  userParticipatesInSplit: boolean;
  onPress: (expense: ExpenseWithPhotos) => void;
  onDelete: (expense: ExpenseWithPhotos) => void;
  confirmTitle: string;
  confirmBody: string;
  confirmLabel: string;
  cancelLabel: string;
  deleteLabel: string;
}

function ExpenseRowImpl({
  item,
  category,
  homeCurrency,
  loggedByName,
  isSelfLogged,
  userParticipatesInSplit,
  onPress,
  onDelete,
  confirmTitle,
  confirmBody,
  confirmLabel,
  cancelLabel,
  deleteLabel,
}: ExpenseRowProps) {
  const handlePress = useCallback(() => onPress(item.expense), [onPress, item.expense]);
  const handleDelete = useCallback(() => onDelete(item.expense), [onDelete, item.expense]);
  // Split + non-participant: don't override the displayed amount —
  // user sees the full amount with the SPLIT badge (they owe nothing).
  const skipShareOverride = item.expense.isSplit && !userParticipatesInSplit;
  return (
    <SwipeableExpenseCard
      expense={item.displayExpense}
      category={category}
      homeCurrency={homeCurrency}
      onPress={handlePress}
      onDelete={handleDelete}
      confirmTitle={confirmTitle}
      confirmBody={confirmBody}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      deleteLabel={deleteLabel}
      loggedByName={loggedByName}
      isSelfLogged={isSelfLogged}
      canDelete={isSelfLogged}
      userShareAmount={skipShareOverride ? undefined : item.userShareAmount}
      userShareConverted={skipShareOverride ? undefined : item.userShareConverted}
    />
  );
}

const ExpenseRow = memo(ExpenseRowImpl);

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

export default function TripExpensesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const isRTL = useIsRTL();
  const params = useGlobalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;

  const trip = useTripStore((s) => s.trips.find((x) => x.id === tripId));
  const expenses = useExpenseStore((s) => s.expenses);
  const splits = useExpenseStore((s) => s.splits);
  const activeTripId = useExpenseStore((s) => s.activeTripId);
  const loadForTrip = useExpenseStore((s) => s.loadForTrip);
  const deleteExpense = useExpenseStore((s) => s.deleteExpense);
  const allCategories = useCategoryStore((s) => s.categories);
  const settlements = useSettlementStore((s) => s.settlements);
  const activeSettlementTripId = useSettlementStore((s) => s.activeTripId);
  const loadSettlementsForTrip = useSettlementStore((s) => s.loadForTrip);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  // Future-dated expenses collapse under an "Upcoming" header by default so
  // today sits at the top of the list. UI-only state.
  const [showUpcoming, setShowUpcoming] = useState(false);

  // SectionList ref — used by the floating scroll-to-top button.
  const listRef = useRef<SectionList<ExpenseListItem, ExpenseDateGroup>>(null);

  const scrollToTop = useCallback((animated: boolean) => {
    listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated });
  }, []);

  // Scroll-driven header animation. Native-driver-friendly props only
  // (opacity + transform) so scrolling stays smooth on Android.
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0.75],
    extrapolate: 'clamp',
  });
  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, -4],
    extrapolate: 'clamp',
  });
  const onScroll = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: true },
      ),
    [scrollY],
  );

  // Toggle the scroll-to-top button when the user is past ~300px. A simple
  // threshold listener — cheaper than animating the button's opacity since
  // it only re-renders on threshold crossings.
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const next = value > 300;
      setShowScrollTop((prev) => (prev === next ? prev : next));
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);

  const handleRefresh = useCallback(async (): Promise<void> => {
    if (!tripId) return;
    setRefreshing(true);
    try {
      await syncEngine.triggerSync();
      await loadForTrip(tripId);
    } finally {
      setRefreshing(false);
    }
  }, [tripId, loadForTrip]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(() => new Set());
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(() => new Set());
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(() => new Set());
  const [selectedPlaces, setSelectedPlaces] = useState<Set<string>>(() => new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(() => new Set());
  const [openFilter, setOpenFilter] = useState<ExpenseFilterKey | null>(null);

  const isSharedTrip = Object.keys(memberNames).length > 1;

  useEffect(() => {
    if (tripId && activeTripId !== tripId) void loadForTrip(tripId);
  }, [tripId, activeTripId, loadForTrip]);

  useEffect(() => {
    if (tripId && activeSettlementTripId !== tripId) void loadSettlementsForTrip(tripId);
  }, [tripId, activeSettlementTripId, loadSettlementsForTrip]);

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

  const balanceSummary = useMemo(() => {
    if (!isSharedTrip || !currentUserId) return null;
    const { settlements: netted } = computeBalance({
      expenses,
      splits,
      settlementPayments: settlements,
    });
    return selectBalanceCardSummary(netted, currentUserId);
  }, [isSharedTrip, currentUserId, expenses, splits, settlements]);

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

  const getShareForExpense = useExpenseShareGetter({
    expenses: filteredExpenses,
    splits,
    currentUserId,
  });

  const sections = useMemo<ExpenseDateGroup[]>(
    () => groupExpensesByDate(filteredExpenses, getShareForExpense),
    [filteredExpenses, getShareForExpense],
  );

  // Split the (date-descending) groups into future vs. today-and-earlier.
  // Future days form a contiguous prefix because the list is sorted desc.
  const { presentSections, futureSections } = useMemo(() => {
    const today = todayIsoDate();
    const future: ExpenseDateGroup[] = [];
    const present: ExpenseDateGroup[] = [];
    for (const s of sections) {
      if (s.date > today) future.push(s);
      else present.push(s);
    }
    return { presentSections: present, futureSections: future };
  }, [sections]);

  // Precomputed: which expenses the current user has an active split row in.
  // Used to decide whether to show their per-row share (participant) vs the
  // full amount with a SPLIT badge (non-participant). Lifted out of the row
  // closure so the row component can stay memoized across parent re-renders.
  const userSplitsByExpense = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (!currentUserId) return set;
    for (const s of splits) {
      if (s.userId !== currentUserId || s.deletedAt !== null) continue;
      set.add(s.expenseId);
    }
    return set;
  }, [splits, currentUserId]);


  const handleClearAll = useCallback(() => {
    setSelectedCategoryIds(new Set());
    setSelectedPayments(new Set());
    setSelectedMembers(new Set());
    setSelectedPlaces(new Set());
    setSelectedMonths(new Set());
  }, []);

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
        if (error instanceof SettlementAttributedError) {
          Alert.alert(t('balances.editBlockedTitle'), t('balances.editBlockedBody'));
          return;
        }
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

  const filtersActive =
    query.trim() !== '' ||
    selectedCategoryIds.size > 0 ||
    selectedPayments.size > 0 ||
    selectedMembers.size > 0 ||
    selectedPlaces.size > 0 ||
    selectedMonths.size > 0;

  // Collapse future days under the "Upcoming" header so today is at the top.
  // Expand when the user opts in, when filtering/searching (so matches aren't
  // hidden behind the collapse), or when there's nothing earlier to show.
  const showUpcomingEffective =
    showUpcoming || filtersActive || presentSections.length === 0;
  const displayedSections = showUpcomingEffective ? sections : presentSections;
  const showUpcomingToggle =
    !filtersActive && futureSections.length > 0 && presentSections.length > 0;
  const upcomingCount = futureSections.reduce((n, s) => n + s.data.length, 0);
  const upcomingTotal = futureSections.reduce((sum, s) => sum + s.subtotal, 0);

  const hasExpenses = expenses.length > 0;
  const filteredAway = hasExpenses && displayedSections.length === 0;

  // Hoist row-level i18n strings out of renderItem so the memoized row
  // doesn't re-evaluate t() per row per render.
  const confirmTitleLabel = t('expensesList.deleteConfirmTitle');
  const confirmBodyLabel = t('expensesList.deleteConfirmBody');
  const confirmActionLabel = t('common.delete');
  const cancelActionLabel = t('common.cancel');
  const deleteActionLabel = t('expensesList.deleteAction');

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

      <AskAnythingCard onPress={() => router.push(href(`/trip/${tripId}/ask`))} />

      {balanceSummary && isSharedTrip ? (
        <BalanceCard
          summary={balanceSummary}
          topOtherName={
            balanceSummary.top ? memberNames[balanceSummary.top.otherUserId] : undefined
          }
          currency={trip.homeCurrency}
          onPress={() => router.push(href(`/trip/${tripId}/balances`))}
        />
      ) : null}

      <View
        style={[
          styles.searchWrap,
          {
            backgroundColor: theme.surface,
            borderColor: searchFocused ? theme.accent : theme.border,
          },
        ]}
      >
        <Icon name="search" size={16} color={theme.textMuted} stroke={1.8} style={styles.searchIcon} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder={t('expensesList.searchPlaceholder')}
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.searchInput, { color: theme.text }]}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={8}
            style={[styles.searchClear, { backgroundColor: theme.bgSoft }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <Icon name="x" size={11} color={theme.textSecondary} stroke={2.2} />
          </Pressable>
        ) : null}
      </View>

      <ExpenseFilterChips
        isSharedTrip={isSharedTrip}
        openFilter={openFilter}
        onOpenFilter={setOpenFilter}
        categoryOptions={categoryOptions}
        paymentOptions={paymentOptions}
        memberOptions={memberOptions}
        placeOptions={placeOptions}
        monthOptions={monthOptions}
        selectedCategoryIds={selectedCategoryIds}
        selectedPayments={selectedPayments}
        selectedMembers={selectedMembers}
        selectedPlaces={selectedPlaces}
        selectedMonths={selectedMonths}
        onSetCategoryIds={setSelectedCategoryIds}
        onSetPayments={setSelectedPayments}
        onSetMembers={setSelectedMembers}
        onSetPlaces={setSelectedPlaces}
        onSetMonths={setSelectedMonths}
        onClearAll={handleClearAll}
      />

      {showUpcomingToggle ? (
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowUpcoming((v) => !v);
          }}
          style={({ pressed }) => [
            styles.upcomingToggle,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityState={{ expanded: showUpcoming }}
          accessibilityLabel={t('expensesList.upcoming')}
        >
          <View style={styles.upcomingToggleLeft}>
            <Icon
              name={
                showUpcoming ? 'chevron-down' : isRTL ? 'chevron-left' : 'chevron-right'
              }
              size={16}
              color={theme.textSecondary}
              stroke={2.2}
            />
            <Text style={[styles.upcomingToggleLabel, { color: theme.text }]}>
              {t('expensesList.upcoming')}
            </Text>
            <View style={[styles.upcomingBadge, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.upcomingBadgeText, { color: theme.accent }]}>
                {upcomingCount}
              </Text>
            </View>
          </View>
          <Text style={[styles.upcomingTotal, { color: theme.textSecondary }]}>
            {formatAmount(upcomingTotal, trip.homeCurrency)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <Animated.View
        style={[
          styles.header,
          {
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslateY }],
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
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
      </Animated.View>

      <KeyboardAwareWrapper hasBottomTab style={styles.flex}>
        <Animated.SectionList
          ref={listRef as React.Ref<SectionList<ExpenseListItem, ExpenseDateGroup>>}
          onScroll={onScroll}
          scrollEventThrottle={16}
          sections={displayedSections}
          keyExtractor={(item) => item.key}
          stickySectionHeadersEnabled
          contentContainerStyle={styles.list}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          ListHeaderComponent={hasExpenses ? listHeader : null}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: theme.bg }]}>
              <View style={styles.sectionHeaderLeft}>
                <View style={[styles.sectionDot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  {labelForGroup(section)}
                </Text>
              </View>
              <Text style={[styles.sectionSubtotal, { color: theme.textSecondary }]}>
                {formatAmount(section.subtotal, trip.homeCurrency)}
              </Text>
            </View>
          )}
          renderItem={({ item }) => {
            const loggedById = item.expense.userId;
            const isSelfLogged = loggedById === currentUserId;
            const loggedByName = isSharedTrip ? memberNames[loggedById] ?? null : null;
            return (
              <ExpenseRow
                item={item}
                category={categoryById.get(item.expense.categoryId) ?? null}
                homeCurrency={trip.homeCurrency}
                loggedByName={loggedByName}
                isSelfLogged={isSelfLogged}
                userParticipatesInSplit={userSplitsByExpense.has(item.expense.id)}
                onPress={handlePressRow}
                onDelete={handleDelete}
                confirmTitle={confirmTitleLabel}
                confirmBody={confirmBodyLabel}
                confirmLabel={confirmActionLabel}
                cancelLabel={cancelActionLabel}
                deleteLabel={deleteActionLabel}
              />
            );
          }}
          ListEmptyComponent={
            filteredAway ? (
              <View style={[styles.empty, { borderColor: theme.border }]}>
                <View style={[styles.emptyGlow, { backgroundColor: theme.accentSoft }]}>
                  <Icon name="search" size={30} color={theme.accent} stroke={1.8} />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  {t('expensesList.emptyFilteredTitle')}
                </Text>
                <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                  {t('expensesList.emptyFilteredBody')}
                </Text>
                <Pressable
                  onPress={handleClearAll}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.emptyCta,
                    {
                      backgroundColor: theme.accentSoft,
                      borderColor: theme.accent,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    },
                  ]}
                >
                  <Text style={[styles.emptyCtaText, { color: theme.accent }]}>
                    {t('expenses.filterClearAll')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={[styles.empty, { borderColor: theme.border }]}>
                <View style={[styles.emptyGlow, { backgroundColor: theme.accentSoft }]}>
                  <Icon name="plus" size={30} color={theme.accent} stroke={2} />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  {t('tripView.emptyExpensesTitle')}
                </Text>
                <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                  {t('tripView.emptyExpensesBody')}
                </Text>
                <Pressable
                  onPress={() => router.push(href(`/add-expense?tripId=${tripId}`))}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.emptyCta,
                    styles.emptyCtaRow,
                    {
                      backgroundColor: theme.accentSoft,
                      borderColor: theme.accent,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    },
                  ]}
                >
                  <Icon name="plus" size={14} color={theme.accent} stroke={2.2} />
                  <Text style={[styles.emptyCtaText, { color: theme.accent }]}>
                    {t('tripView.addExpense')}
                  </Text>
                </Pressable>
              </View>
            )
          }
        />
      </KeyboardAwareWrapper>

      {showScrollTop ? (
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            scrollToTop(true);
          }}
          style={({ pressed }) => [
            styles.scrollTop,
            isRTL ? styles.scrollTopLeft : styles.scrollTopRight,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
          accessibilityLabel={t('expensesList.scrollToTop')}
          accessibilityRole="button"
        >
          <Icon name="chevron-up" size={18} color={theme.accent} stroke={2.4} />
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push(href(`/add-expense?tripId=${tripId}`));
        }}
        style={({ pressed }) => [
          styles.fab,
          isRTL ? styles.fabLeft : styles.fabRight,
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
          <Icon name="plus" size={28} color="#FFFFFF" stroke={2.4} />
        </LinearGradient>
      </Pressable>
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
  // (headerButtonText was replaced by SVG chevron-left.)
  headerTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerTitle: { ...typography.itemTitle, flex: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: sizing.radiusInput,
    borderWidth: borderWidth.hairline,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8, // compact form geometry; intermediate between sm/md
    gap: 8,
    marginBottom: spacing.sm,
  },
  searchIcon: {},
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 2,
  },
  searchClear: {
    width: 22,
    height: 22,
    borderRadius: sizing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearText: { fontSize: 11, fontWeight: '700', lineHeight: 12 },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    marginBottom: 2, // optical tighten before the first card
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionDot: {
    width: 5,
    height: 5,
    borderRadius: sizing.radiusPill,
  },
  sectionTitle: { ...typography.sectionTitle },
  sectionSubtotal: { ...typography.amountSmall },
  empty: {
    borderRadius: sizing.radiusCard,
    borderWidth: borderWidth.hairline,
    borderStyle: 'dashed',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  emptyGlow: {
    width: 72,
    height: 72,
    borderRadius: sizing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2, // optical nudge above title
  },
  emptyTitle: { ...typography.itemTitle, marginBottom: 0 },
  emptyBody: { ...typography.secondary, textAlign: 'center' },
  emptyCta: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: sizing.radiusPill,
    borderWidth: borderWidth.hairline,
  },
  emptyCtaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  emptyCtaText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
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
  scrollTop: {
    position: 'absolute',
    bottom: 160, // stacks just above the + FAB (FAB at bottom: 90, height: 62)
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  scrollTopRight: { right: 28 },
  scrollTopLeft: { left: 28 },
  upcomingToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.base,
    borderRadius: sizing.radiusInput,
    borderWidth: borderWidth.hairline,
    marginTop: spacing.sm,
  },
  upcomingToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  upcomingToggleLabel: { ...typography.sectionTitle },
  upcomingBadge: {
    minWidth: 22,
    paddingHorizontal: 7,
    height: 20,
    borderRadius: sizing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingBadgeText: { fontSize: 12, fontWeight: '800' },
  upcomingTotal: { ...typography.amountSmall },
});
