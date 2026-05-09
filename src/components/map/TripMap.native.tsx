// Native build of TripMap. Wraps react-native-maps and the per-pin tracked
// markers. The route stays the orchestrator (filter chips, locate button,
// popup overlay); this component owns the map surface and the clustering
// hook because the hook needs imperative access to the map.
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { StyleSheet } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';

import { CategoryPin, ClusterPin } from '@/components/map/ExpensePin';
import { TrackedMarker } from '@/components/map/TrackedMarker';
import type { MapHandle, TripMapHandle } from '@/components/map/types';
import { useExpenseClustering } from '@/hooks/useExpenseClustering';
import type { Category } from '@/types/category';
import type { ExpenseWithPhotos } from '@/types/expense';
import { formatAmount } from '@/utils/currency';

export interface TripMapProps {
  allExpenses: ExpenseWithPhotos[];
  visibleExpenses: ExpenseWithPhotos[];
  categoryById: Map<string, Category>;
  homeCurrency: string;
  selectedExpenseId: string | null;
  onPressExpense: (expense: ExpenseWithPhotos) => void;
  // When set, TripMap centers the map on the matching expense and reports
  // it back via onPressExpense so the route's popup opens. onFocusHandled
  // fires once the focus has been processed so the route can clear the URL
  // param.
  focusExpenseId?: string | null;
  onFocusHandled?: () => void;
}

export const TripMap = forwardRef<TripMapHandle, TripMapProps>(function TripMap(
  {
    allExpenses,
    visibleExpenses,
    categoryById,
    homeCurrency,
    selectedExpenseId,
    onPressExpense,
    focusExpenseId,
    onFocusHandled,
  },
  ref,
) {
  const mapRef = useRef<MapView | null>(null);

  // Build a MapHandle once — refs don't trigger renders, so this stable
  // object always defers to whatever mapRef.current is when called.
  const mapHandle = useMemo<MapHandle>(
    () => ({
      animateToRegion: (region) => {
        mapRef.current?.animateToRegion(
          {
            latitude: region.latitude,
            longitude: region.longitude,
            latitudeDelta: region.latitudeDelta,
            longitudeDelta: region.longitudeDelta,
          },
          400,
        );
      },
      fitToCoordinates: (coords) => {
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 120, right: 60, bottom: 200, left: 60 },
          animated: true,
        });
      },
    }),
    [],
  );

  const { initialRegion, setRegion, items, focusExpense, zoomIntoCluster } =
    useExpenseClustering({
      allExpenses,
      visibleExpenses,
      mapHandle,
    });

  useImperativeHandle(
    ref,
    () => ({
      panTo: (coords) => {
        mapRef.current?.animateToRegion(
          {
            latitude: coords.latitude,
            longitude: coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          350,
        );
      },
    }),
    [],
  );

  // Focus a specific expense when the route passes ?focusExpenseId=...
  // Open the popup via onPressExpense; clear the URL via onFocusHandled.
  const focusHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusExpenseId) return;
    if (focusHandledRef.current === focusExpenseId) return;
    const target = allExpenses.find((e) => e.id === focusExpenseId);
    if (!target) return;
    if (target.latitude == null || target.longitude == null) {
      focusHandledRef.current = focusExpenseId;
      onFocusHandled?.();
      return;
    }
    focusExpense(target);
    onPressExpense(target);
    focusHandledRef.current = focusExpenseId;
    onFocusHandled?.();
  }, [focusExpenseId, allExpenses, focusExpense, onPressExpense, onFocusHandled]);

  return (
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
          const isSelected = selectedExpenseId === item.expense.id;
          const amountLabel = formatAmount(
            item.expense.convertedAmount,
            homeCurrency,
          );
          return (
            <TrackedMarker
              key={item.key}
              identity={`${item.key}:${isSelected ? '1' : '0'}`}
              coordinate={{
                latitude: item.latitude,
                longitude: item.longitude,
              }}
              onPress={() => onPressExpense(item.expense)}
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
  );
});
