import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryFilterChips } from '@/components/ui/CategoryFilterChips';
import { CategoryPin, ClusterPin } from '@/components/map/ExpensePin';
import { ExpensePopup } from '@/components/map/ExpensePopup';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import {
  selectCategoriesForTrip,
  useCategoryStore,
} from '@/stores/categoryStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTripStore } from '@/stores/tripStore';
import type { ExpenseWithPhotos } from '@/types/expense';
import { boundsForExpenses, clusterExpenses } from '@/utils/mapCluster';
import { href } from '@/utils/nav';

const FALLBACK_REGION: Region = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 120,
  longitudeDelta: 120,
};

export default function TripMapScreen() {
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

  const mapRef = useRef<MapView | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedExpense, setSelectedExpense] =
    useState<ExpenseWithPhotos | null>(null);

  useEffect(() => {
    if (tripId && activeTripId !== tripId) void loadForTrip(tripId);
  }, [tripId, activeTripId, loadForTrip]);

  const tripCategories = useMemo(
    () => selectCategoriesForTrip(allCategories, tripId ?? null),
    [allCategories, tripId],
  );
  const categoryById = useMemo(
    () => new Map(tripCategories.map((c) => [c.id, c])),
    [tripCategories],
  );

  // Only categories with pinned expenses are worth offering in the filter.
  const filterableCategories = useMemo(() => {
    const used = new Set<string>();
    for (const e of expenses) {
      if (e.latitude != null && e.longitude != null) used.add(e.categoryId);
    }
    return tripCategories.filter((c) => used.has(c.id));
  }, [expenses, tripCategories]);

  const visibleExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        if (e.latitude == null || e.longitude == null) return false;
        if (selectedCategoryIds.size === 0) return true;
        return selectedCategoryIds.has(e.categoryId);
      }),
    [expenses, selectedCategoryIds],
  );

  // Initial region is computed once from whatever expenses are loaded at mount.
  // The effect below refits the map the first time located expenses appear.
  const [initialRegion] = useState<Region>(() => {
    const bounds = boundsForExpenses(expenses);
    return bounds ?? FALLBACK_REGION;
  });
  const [region, setRegion] = useState<Region>(initialRegion);

  const didFitRef = useRef(boundsForExpenses(expenses) !== null);
  useEffect(() => {
    if (didFitRef.current) return;
    const bounds = boundsForExpenses(expenses);
    if (bounds && mapRef.current) {
      mapRef.current.animateToRegion(bounds, 400);
      didFitRef.current = true;
    }
  }, [expenses]);

  const items = useMemo(
    () => clusterExpenses(visibleExpenses, region),
    [visibleExpenses, region],
  );

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        onRegionChangeComplete={setRegion}
      >
        {items.map((item) => {
          if (item.type === 'pin') {
            const category = categoryById.get(item.expense.categoryId) ?? null;
            return (
              <Marker
                key={item.key}
                coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                onPress={() => setSelectedExpense(item.expense)}
                tracksViewChanges={false}
                anchor={{ x: 0.5, y: 1 }}
              >
                <CategoryPin category={category} />
              </Marker>
            );
          }
          return (
            <Marker
              key={item.key}
              coordinate={{ latitude: item.latitude, longitude: item.longitude }}
              onPress={() => zoomIntoCluster(item.expenses)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <ClusterPin count={item.count} />
            </Marker>
          );
        })}
      </MapView>

      <SafeAreaView
        style={styles.topOverlay}
        edges={['top']}
        pointerEvents="box-none"
      >
        {filterableCategories.length > 0 ? (
          <CategoryFilterChips
            categories={filterableCategories}
            selectedIds={selectedCategoryIds}
            onToggle={toggleCategory}
            onClear={() => setSelectedCategoryIds(new Set())}
            allLabel={t('tripView.mapAllCategories')}
            elevated
          />
        ) : null}
      </SafeAreaView>

      {visibleExpenses.length === 0 ? (
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
