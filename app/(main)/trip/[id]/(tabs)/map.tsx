import { useGlobalSearchParams, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type Region,
} from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryPin, ClusterPin } from '@/components/map/ExpensePin';
import { ExpensePopup } from '@/components/map/ExpensePopup';
import { FilterModal, type FilterOption } from '@/components/ui/FilterModal';
import { FilterPill } from '@/components/ui/FilterPill';
import { sizing, spacing, typography } from '@/constants/theme';
import { getProfileName } from '@/db/queries/profiles';
import { listTripMembers } from '@/db/queries/trips';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import {
  selectCategoriesForTrip,
  useCategoryStore,
} from '@/stores/categoryStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTripStore } from '@/stores/tripStore';
import { getCurrentCoordinates } from '@/services/locationService';
import type { ExpenseWithPhotos } from '@/types/expense';
import { getCategoryDisplayName } from '@/utils/category';
import { formatAmount } from '@/utils/currency';
import {
  boundsForExpenses,
  clusterExpenses,
  locatedExpenses as filterLocated,
} from '@/utils/mapCluster';
import { href } from '@/utils/nav';

const FALLBACK_REGION: Region = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 120,
  longitudeDelta: 120,
};

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

export default function TripMapScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
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

  const mapRef = useRef<MapView | null>(null);
  const focusHandledRef = useRef<string | null>(null);
  const suppressVisibleFitRef = useRef(false);

  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(() => new Set());
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(() => new Set());
  const [selectedPlaces, setSelectedPlaces] = useState<Set<string>>(() => new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(() => new Set());
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
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

  // ----- Filter option lists derived from located expenses -----

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

  // ----- Filtering -----

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

  const anyFilterActive =
    selectedCategoryIds.size > 0 ||
    selectedPayments.size > 0 ||
    selectedMembers.size > 0 ||
    selectedPlaces.size > 0 ||
    selectedMonths.size > 0;

  // ----- Map region & fitting -----

  const [initialRegion] = useState<Region>(() => {
    const bounds = boundsForExpenses(expenses);
    return bounds ?? FALLBACK_REGION;
  });
  const [region, setRegion] = useState<Region>(initialRegion);
  const didInitialFitRef = useRef(boundsForExpenses(expenses) !== null);

  // Initial fit: once expenses load with at least one located item, fit the map.
  useEffect(() => {
    if (didInitialFitRef.current) return;
    const bounds = boundsForExpenses(expenses);
    if (bounds && mapRef.current) {
      mapRef.current.animateToRegion(bounds, 400);
      didInitialFitRef.current = true;
    }
  }, [expenses]);

  // Focus a specific expense when navigated to with `?focusExpenseId=...`
  // (e.g., from the location field on the expense detail screen).
  useEffect(() => {
    if (!focusExpenseId) return;
    if (focusHandledRef.current === focusExpenseId) return;
    const target = expenses.find((e) => e.id === focusExpenseId);
    if (!target) return;
    if (target.latitude == null || target.longitude == null) {
      focusHandledRef.current = focusExpenseId;
      router.setParams({ focusExpenseId: undefined });
      return;
    }
    didInitialFitRef.current = true;
    suppressVisibleFitRef.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: target.latitude,
        longitude: target.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      },
      400,
    );
    setSelectedExpense(target);
    focusHandledRef.current = focusExpenseId;
    router.setParams({ focusExpenseId: undefined });
  }, [focusExpenseId, expenses, router]);

  // Refit on filter changes — fits to the *visible* set so the user always
  // sees the pins they care about.
  const visibleSignature = useMemo(
    () => visibleExpenses.map((e) => e.id).join(','),
    [visibleExpenses],
  );
  useEffect(() => {
    if (!didInitialFitRef.current) return;
    if (!mapRef.current) return;
    if (visibleExpenses.length === 0) return;
    if (suppressVisibleFitRef.current) {
      suppressVisibleFitRef.current = false;
      return;
    }
    const coords = visibleExpenses.map((e) => ({
      latitude: e.latitude as number,
      longitude: e.longitude as number,
    }));
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 120, right: 60, bottom: 200, left: 60 },
      animated: true,
    });
    // visibleExpenses recomputes when filters change; this signature is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSignature]);

  const items = useMemo(
    () => clusterExpenses(visibleExpenses, region),
    [visibleExpenses, region],
  );

  const zoomIntoCluster = (members: ExpenseWithPhotos[]) => {
    if (!mapRef.current || members.length === 0) return;
    let minLat = members[0].latitude as number;
    let maxLat = minLat;
    let minLng = members[0].longitude as number;
    let maxLng = minLng;
    for (let i = 1; i < members.length; i += 1) {
      const lat = members[i].latitude as number;
      const lng = members[i].longitude as number;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    const next: Region = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.6, 0.004),
      longitudeDelta: Math.max((maxLng - minLng) * 1.6, 0.004),
    };
    mapRef.current.animateToRegion(next, 300);
  };

  const toggleIn = useCallback(
    (set: Set<string>, setter: (s: Set<string>) => void) => (id: string) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setter(next);
    },
    [],
  );

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
      mapRef.current?.animateToRegion(
        {
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        350,
      );
    } finally {
      setLoadingLocation(false);
    }
  };

  // ----- Pill summaries -----

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

  if (!trip || !tripId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.center}>
          <Text style={{ color: theme.textSecondary }}>{t('trips.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
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

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {items.map((item) => {
          if (item.type === 'pin') {
            const category = categoryById.get(item.expense.categoryId) ?? null;
            const isSelected = selectedExpense?.id === item.expense.id;
            const amountLabel = formatAmount(
              item.expense.convertedAmount,
              trip.homeCurrency,
            );
            return (
              <TrackedMarker
                key={item.key}
                identity={`${item.key}:${isSelected ? '1' : '0'}`}
                coordinate={{
                  latitude: item.latitude,
                  longitude: item.longitude,
                }}
                onPress={() => setSelectedExpense(item.expense)}
                anchor={{ x: 0.5, y: 1 }}
              >
                <CategoryPin
                  category={category}
                  selected={isSelected}
                  amountLabel={amountLabel}
                />
              </TrackedMarker>
            );
          }
          return (
            <TrackedMarker
              key={item.key}
              identity={item.key}
              coordinate={{ latitude: item.latitude, longitude: item.longitude }}
              onPress={() => zoomIntoCluster(item.expenses)}
              anchor={{ x: 0.5, y: 1 }}
            >
              <ClusterPin count={item.count} />
            </TrackedMarker>
          );
        })}
      </MapView>

      <SafeAreaView
        style={styles.topOverlay}
        edges={['top']}
        pointerEvents="box-none"
      >
        {locatedAll.length > 0 ? (
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
                <Text style={[styles.clearButtonText, { color: theme.textSecondary }]}>
                  ✕
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        ) : null}
      </SafeAreaView>

      {locatedAll.length > 0 ? (
        <Pressable
          onPress={handleLocateMe}
          accessibilityLabel={t('map.myLocation')}
          style={[
            styles.locateButton,
            I18nManager.isRTL ? styles.locateButtonLeft : styles.locateButtonRight,
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

      <FilterModal
        visible={openFilter === 'category'}
        title={t('expenses.filterCategory')}
        options={categoryOptions}
        selectedIds={selectedCategoryIds}
        onToggle={toggleIn(selectedCategoryIds, setSelectedCategoryIds)}
        onSelectAll={() =>
          setSelectedCategoryIds(new Set(categoryOptions.map((o) => o.id)))
        }
        onClear={() => setSelectedCategoryIds(new Set())}
        onDone={() => setOpenFilter(null)}
      />
      <FilterModal
        visible={openFilter === 'payment'}
        title={t('expenses.filterPayment')}
        options={paymentOptions}
        selectedIds={selectedPayments}
        onToggle={toggleIn(selectedPayments, setSelectedPayments)}
        onSelectAll={() =>
          setSelectedPayments(new Set(paymentOptions.map((o) => o.id)))
        }
        onClear={() => setSelectedPayments(new Set())}
        onDone={() => setOpenFilter(null)}
      />
      <FilterModal
        visible={openFilter === 'member'}
        title={t('expenses.filterMember')}
        options={memberOptions}
        selectedIds={selectedMembers}
        onToggle={toggleIn(selectedMembers, setSelectedMembers)}
        onSelectAll={() =>
          setSelectedMembers(new Set(memberOptions.map((o) => o.id)))
        }
        onClear={() => setSelectedMembers(new Set())}
        onDone={() => setOpenFilter(null)}
      />
      <FilterModal
        visible={openFilter === 'place'}
        title={t('expenses.filterLocation')}
        options={placeOptions}
        selectedIds={selectedPlaces}
        onToggle={toggleIn(selectedPlaces, setSelectedPlaces)}
        onSelectAll={() =>
          setSelectedPlaces(new Set(placeOptions.map((o) => o.id)))
        }
        onClear={() => setSelectedPlaces(new Set())}
        onDone={() => setOpenFilter(null)}
      />
      <FilterModal
        visible={openFilter === 'month'}
        title={t('expenses.filterMonth')}
        options={monthOptions}
        selectedIds={selectedMonths}
        onToggle={toggleIn(selectedMonths, setSelectedMonths)}
        onSelectAll={() =>
          setSelectedMonths(new Set(monthOptions.map((o) => o.id)))
        }
        onClear={() => setSelectedMonths(new Set())}
        onDone={() => setOpenFilter(null)}
      />
    </View>
  );
}

interface TrackedMarkerProps {
  identity: string;
  coordinate: { latitude: number; longitude: number };
  anchor: { x: number; y: number };
  onPress: () => void;
  children: React.ReactNode;
}

// Wraps <Marker> so we can briefly enable tracksViewChanges on first render
// and whenever the rendered content changes — Google Maps on Android needs
// this to re-snapshot custom Views, otherwise pins draw as empty space.
function TrackedMarker({
  identity,
  coordinate,
  anchor,
  onPress,
  children,
}: TrackedMarkerProps) {
  const [tracks, setTracks] = useState(true);

  useEffect(() => {
    setTracks(true);
    const handle = setTimeout(() => setTracks(false), 250);
    return () => clearTimeout(handle);
  }, [identity]);

  return (
    <Marker
      coordinate={coordinate}
      onPress={onPress}
      anchor={anchor}
      tracksViewChanges={tracks}
    >
      {children}
    </Marker>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  pillRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
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
