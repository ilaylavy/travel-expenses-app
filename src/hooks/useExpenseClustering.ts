import { useEffect, useMemo, useRef, useState } from 'react';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';

import type { ExpenseWithPhotos } from '@/types/expense';
import {
  boundsForExpenses,
  clusterExpenses,
} from '@/utils/mapCluster';

const FALLBACK_REGION: Region = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 120,
  longitudeDelta: 120,
};

// Owns map region state + viewport-keyed clustering for the trip map. The
// caller passes the visible expense set; the hook fits the map on first load
// and on each filter change (visibleExpenses identity).
export function useExpenseClustering({
  allExpenses,
  visibleExpenses,
  mapRef,
}: {
  allExpenses: ExpenseWithPhotos[];
  visibleExpenses: ExpenseWithPhotos[];
  mapRef: React.RefObject<MapView | null>;
}) {
  const [initialRegion] = useState<Region>(() => {
    const bounds = boundsForExpenses(allExpenses);
    return bounds ?? FALLBACK_REGION;
  });
  const [region, setRegion] = useState<Region>(initialRegion);
  const didInitialFitRef = useRef(boundsForExpenses(allExpenses) !== null);
  const suppressVisibleFitRef = useRef(false);

  // Initial fit: once expenses load with at least one located item, fit the map.
  useEffect(() => {
    if (didInitialFitRef.current) return;
    const bounds = boundsForExpenses(allExpenses);
    if (bounds && mapRef.current) {
      mapRef.current.animateToRegion(bounds, 400);
      didInitialFitRef.current = true;
    }
  }, [allExpenses, mapRef]);

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

  const focusExpense = (target: ExpenseWithPhotos) => {
    if (target.latitude == null || target.longitude == null) return;
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

  return {
    initialRegion,
    region,
    setRegion,
    items,
    focusExpense,
    zoomIntoCluster,
  };
}
