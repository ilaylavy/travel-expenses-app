import { useEffect, useMemo, useRef, useState } from 'react';

import type { MapHandle } from '@/components/map/types';
import type { ExpenseWithPhotos } from '@/types/expense';
import {
  boundsForExpenses,
  clusterExpenses,
  type MapItem,
  type MapRegion,
} from '@/utils/mapCluster';

const FALLBACK_REGION: MapRegion = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 120,
  longitudeDelta: 120,
};

// Owns map region state + viewport-keyed clustering for the trip map. The
// caller passes the visible expense set and a MapHandle that abstracts away
// whichever map SDK is wired up underneath (react-native-maps on native,
// vis.gl on web). The hook is platform-agnostic — every imperative call
// goes through the handle.
export function useExpenseClustering({
  allExpenses,
  visibleExpenses,
  mapHandle,
}: {
  allExpenses: ExpenseWithPhotos[];
  visibleExpenses: ExpenseWithPhotos[];
  mapHandle: MapHandle | null;
}): {
  initialRegion: MapRegion;
  region: MapRegion;
  setRegion: (region: MapRegion) => void;
  items: MapItem[];
  focusExpense: (target: ExpenseWithPhotos) => void;
  zoomIntoCluster: (members: ExpenseWithPhotos[]) => void;
} {
  const [initialRegion] = useState<MapRegion>(() => {
    const bounds = boundsForExpenses(allExpenses);
    return bounds ?? FALLBACK_REGION;
  });
  const [region, setRegion] = useState<MapRegion>(initialRegion);
  const didInitialFitRef = useRef(boundsForExpenses(allExpenses) !== null);
  const suppressVisibleFitRef = useRef(false);

  // Initial fit: once expenses load with at least one located item, fit the
  // map. Re-runs when mapHandle becomes available so web (where the handle
  // is null until <Map> mounts) catches up on the first fit.
  useEffect(() => {
    if (didInitialFitRef.current) return;
    const bounds = boundsForExpenses(allExpenses);
    if (bounds && mapHandle) {
      mapHandle.animateToRegion(bounds);
      didInitialFitRef.current = true;
    }
  }, [allExpenses, mapHandle]);

  // Refit on filter changes — fits to the *visible* set so the user always
  // sees the pins they care about.
  const visibleSignature = useMemo(
    () => visibleExpenses.map((e) => e.id).join(','),
    [visibleExpenses],
  );
  useEffect(() => {
    if (!didInitialFitRef.current) return;
    if (!mapHandle) return;
    if (visibleExpenses.length === 0) return;
    if (suppressVisibleFitRef.current) {
      suppressVisibleFitRef.current = false;
      return;
    }
    const coords = visibleExpenses.map((e) => ({
      latitude: e.latitude as number,
      longitude: e.longitude as number,
    }));
    mapHandle.fitToCoordinates(coords);
    // visibleExpenses recomputes when filters change; this signature is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSignature, mapHandle]);

  const items = useMemo(
    () => clusterExpenses(visibleExpenses, region),
    [visibleExpenses, region],
  );

  const focusExpense = (target: ExpenseWithPhotos) => {
    if (target.latitude == null || target.longitude == null) return;
    didInitialFitRef.current = true;
    suppressVisibleFitRef.current = true;
    mapHandle?.animateToRegion({
      latitude: target.latitude,
      longitude: target.longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    });
  };

  const zoomIntoCluster = (members: ExpenseWithPhotos[]) => {
    if (!mapHandle || members.length === 0) return;
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
    mapHandle.animateToRegion({
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.6, 0.004),
      longitudeDelta: Math.max((maxLng - minLng) * 1.6, 0.004),
    });
  };

  return {
    initialRegion,
    region,
    setRegion,
    items,
    focusExpense,
    zoomIntoCluster,
  };
}
