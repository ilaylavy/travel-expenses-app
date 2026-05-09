import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ExpenseFilterChips,
  type ExpenseFilterKey,
} from '@/components/expense/list/ExpenseFilterChips';
import { ExpensePopup } from '@/components/map/ExpensePopup';
import { TripMap } from '@/components/map/TripMap';
import type { TripMapHandle } from '@/components/map/types';
import type { FilterOption } from '@/components/ui/FilterModal';
import { sizing, spacing, typography } from '@/constants/theme';
import { getProfileName } from '@/db/queries/profiles';
import { listTripMembers } from '@/db/queries/trips';
import { useIsRTL } from '@/hooks/useIsRTL';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { getCurrentCoordinates } from '@/services/locationService';
import {
  selectCategoriesForTrip,
  useCategoryStore,
} from '@/stores/categoryStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTripStore } from '@/stores/tripStore';
import type { ExpenseWithPhotos } from '@/types/expense';
import { getCategoryDisplayName } from '@/utils/category';
import { locatedExpenses as filterLocated } from '@/utils/mapCluster';
import { href } from '@/utils/nav';

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

export default function TripMapScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const isRTL = useIsRTL();
  const params = useGlobalSearchParams<{ id: string; focusExpenseId?: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;
  const focusExpenseId = Array.isArray(params.focusExpenseId)
    ? params.focusExpenseId[0]
    : params.focusExpenseId;

  const trip = useTripStore((s) => s.trips.find((x) => x.id === tripId));
  const expenses = useExpenseStore((s) => s.expenses);
  const activeTripId = useExpenseStore((s) => s.activeTripId);
  const loadForTrip = useExpenseStore((s) => s.loadForTrip);
  const allCategories = useCategoryStore((s) => s.categories);

  const tripMapRef = useRef<TripMapHandle | null>(null);

  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(() => new Set());
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(() => new Set());
  const [selectedPlaces, setSelectedPlaces] = useState<Set<string>>(() => new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(() => new Set());
  const [openFilter, setOpenFilter] = useState<ExpenseFilterKey | null>(null);
  const [selectedExpense, setSelectedExpense] =
    useState<ExpenseWithPhotos | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

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

  // Only consider expenses that have coordinates — this whole screen revolves
  // around located expenses, so filter once up front.
  const locatedAll = useMemo(() => filterLocated(expenses), [expenses]);

  const categoryOptions = useMemo<FilterOption[]>(() => {
    const tally = new Map<string, number>();
    for (const e of locatedAll) {
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
  }, [locatedAll, tripCategories, t]);

  const paymentOptions = useMemo<FilterOption[]>(() => {
    const tally = new Map<string, number>();
    for (const e of locatedAll) {
      const m = e.paymentMethod;
      if (!m) continue;
      tally.set(m, (tally.get(m) ?? 0) + 1);
    }
    return Array.from(tally.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([id, count]) => ({ id, label: titleCase(id), count }));
  }, [locatedAll]);

  const memberOptions = useMemo<FilterOption[]>(() => {
    const tally = new Map<string, number>();
    for (const e of locatedAll) {
      tally.set(e.userId, (tally.get(e.userId) ?? 0) + 1);
    }
    return Array.from(tally.entries())
      .map(([id, count]) => ({
        id,
        label: memberNames[id] ?? '—',
        count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [locatedAll, memberNames]);

  const placeOptions = useMemo<FilterOption[]>(() => {
    const seen = new Map<string, { display: string; count: number }>();
    for (const e of locatedAll) {
      const city = extractCity(e.placeName);
      if (!city) continue;
      const key = city.toLowerCase();
      const existing = seen.get(key);
      if (existing) existing.count += 1;
      else seen.set(key, { display: city, count: 1 });
    }
    return Array.from(seen.entries())
      .map(([id, v]) => ({ id, label: v.display, count: v.count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [locatedAll]);

  const monthOptions = useMemo<FilterOption[]>(() => {
    const tally = new Map<string, number>();
    for (const e of locatedAll) {
      const ym = e.expenseDate.slice(0, 7);
      tally.set(ym, (tally.get(ym) ?? 0) + 1);
    }
    return Array.from(tally.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, count]) => ({ id, label: formatYearMonth(id), count }));
  }, [locatedAll]);

  const visibleExpenses = useMemo(() => {
    return locatedAll.filter((e) => {
      if (selectedCategoryIds.size > 0 && !selectedCategoryIds.has(e.categoryId)) {
        return false;
      }
      if (selectedPayments.size > 0) {
        if (!e.paymentMethod || !selectedPayments.has(e.paymentMethod)) return false;
      }
      if (selectedMembers.size > 0 && !selectedMembers.has(e.userId)) return false;
      if (selectedPlaces.size > 0) {
        const city = extractCity(e.placeName);
        if (!city || !selectedPlaces.has(city.toLowerCase())) return false;
      }
      if (selectedMonths.size > 0 && !selectedMonths.has(e.expenseDate.slice(0, 7))) {
        return false;
      }
      return true;
    });
  }, [
    locatedAll,
    selectedCategoryIds,
    selectedPayments,
    selectedMembers,
    selectedPlaces,
    selectedMonths,
  ]);

  const handleClearAll = () => {
    setSelectedCategoryIds(new Set());
    setSelectedPayments(new Set());
    setSelectedMembers(new Set());
    setSelectedPlaces(new Set());
    setSelectedMonths(new Set());
  };

  const handleLocateMe = async () => {
    if (loadingLocation) return;
    setLoadingLocation(true);
    try {
      const coords = await getCurrentCoordinates();
      if (!coords) {
        Alert.alert(t('map.locationPermissionDenied'));
        return;
      }
      tripMapRef.current?.panTo(coords);
    } finally {
      setLoadingLocation(false);
    }
  };

  if (!trip || !tripId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.center}>
          <Text style={{ color: theme.textSecondary }}>{t('trips.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <TripMap
        ref={tripMapRef}
        allExpenses={expenses}
        visibleExpenses={visibleExpenses}
        categoryById={categoryById}
        homeCurrency={trip.homeCurrency}
        selectedExpenseId={selectedExpense?.id ?? null}
        onPressExpense={setSelectedExpense}
        focusExpenseId={focusExpenseId}
        onFocusHandled={() => router.setParams({ focusExpenseId: undefined })}
      />

      <SafeAreaView style={styles.topOverlay} edges={['top']} pointerEvents="box-none">
        {locatedAll.length > 0 ? (
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
        ) : null}
      </SafeAreaView>

      {locatedAll.length > 0 ? (
        <Pressable
          onPress={handleLocateMe}
          accessibilityLabel={t('map.myLocation')}
          style={[
            styles.locateButton,
            isRTL ? styles.locateButtonLeft : styles.locateButtonRight,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              opacity: loadingLocation ? 0.6 : 1,
            },
          ]}
          hitSlop={6}
        >
          <Text style={styles.locateIcon}>📍</Text>
        </Pressable>
      ) : null}

      {visibleExpenses.length === 0 && locatedAll.length === 0 ? (
        <View pointerEvents="none" style={styles.emptyOverlay}>
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={styles.emptyEmoji}>🗺️</Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {t('tripView.mapEmptyTitle')}
            </Text>
            <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
              {t('tripView.mapEmptyBody')}
            </Text>
          </View>
        </View>
      ) : null}

      {selectedExpense ? (
        <SafeAreaView
          style={styles.bottomOverlay}
          edges={['bottom']}
          pointerEvents="box-none"
        >
          <ExpensePopup
            expense={selectedExpense}
            category={categoryById.get(selectedExpense.categoryId) ?? null}
            homeCurrency={trip.homeCurrency}
            onPress={() => {
              router.push(href(`/trip/${tripId}/expense/${selectedExpense.id}`));
            }}
            onClose={() => setSelectedExpense(null)}
          />
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  locateButton: {
    position: 'absolute',
    bottom: 80,
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  locateButtonRight: { right: 16 },
  locateButtonLeft: { left: 16 },
  locateIcon: { fontSize: 20, lineHeight: 22 },
  bottomOverlay: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    bottom: spacing.base,
  },
  emptyOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.base,
  },
  emptyCard: {
    borderRadius: sizing.radiusCard,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    maxWidth: 320,
  },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.sm },
  emptyTitle: { ...typography.itemTitle, marginBottom: 4 },
  emptyBody: { ...typography.secondary, textAlign: 'center' },
});
