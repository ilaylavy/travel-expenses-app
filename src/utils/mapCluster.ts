import type { ExpenseWithPhotos } from '@/types/expense';

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export type MapItem =
  | {
      type: 'pin';
      key: string;
      expense: ExpenseWithPhotos;
      latitude: number;
      longitude: number;
    }
  | {
      type: 'cluster';
      key: string;
      count: number;
      latitude: number;
      longitude: number;
      expenses: ExpenseWithPhotos[];
    };

const GRID_CELLS = 8;
// Below this zoom level, every expense renders as its own pin.
const MIN_CLUSTER_DELTA = 0.003;

type LocatedExpense = ExpenseWithPhotos & { latitude: number; longitude: number };

function isLocated(e: ExpenseWithPhotos): e is LocatedExpense {
  return e.latitude != null && e.longitude != null;
}

export function locatedExpenses(expenses: ExpenseWithPhotos[]): LocatedExpense[] {
  return expenses.filter(isLocated);
}

export function clusterExpenses(
  expenses: ExpenseWithPhotos[],
  region: MapRegion,
): MapItem[] {
  const located = locatedExpenses(expenses);
  if (located.length === 0) return [];

  if (region.latitudeDelta < MIN_CLUSTER_DELTA) {
    return located.map((e) => ({
      type: 'pin',
      key: `e:${e.id}`,
      expense: e,
      latitude: e.latitude,
      longitude: e.longitude,
    }));
  }

  const cellLat = region.latitudeDelta / GRID_CELLS;
  const cellLng = region.longitudeDelta / GRID_CELLS;

  const buckets = new Map<string, LocatedExpense[]>();
  for (const e of located) {
    const row = Math.floor(e.latitude / cellLat);
    const col = Math.floor(e.longitude / cellLng);
    const key = `${row}:${col}`;
    const arr = buckets.get(key);
    if (arr) arr.push(e);
    else buckets.set(key, [e]);
  }

  const items: MapItem[] = [];
  for (const [cell, group] of buckets) {
    if (group.length === 1) {
      const e = group[0];
      items.push({
        type: 'pin',
        key: `e:${e.id}`,
        expense: e,
        latitude: e.latitude,
        longitude: e.longitude,
      });
      continue;
    }
    let sumLat = 0;
    let sumLng = 0;
    for (const e of group) {
      sumLat += e.latitude;
      sumLng += e.longitude;
    }
    items.push({
      type: 'cluster',
      key: `c:${cell}:${group.length}`,
      count: group.length,
      latitude: sumLat / group.length,
      longitude: sumLng / group.length,
      expenses: group,
    });
  }
  return items;
}

// Tight bounding region around every located expense, with a little padding.
export function boundsForExpenses(expenses: ExpenseWithPhotos[]): MapRegion | null {
  const located = locatedExpenses(expenses);
  if (located.length === 0) return null;

  let minLat = located[0].latitude;
  let maxLat = located[0].latitude;
  let minLng = located[0].longitude;
  let maxLng = located[0].longitude;
  for (let i = 1; i < located.length; i += 1) {
    const { latitude, longitude } = located[i];
    if (latitude < minLat) minLat = latitude;
    if (latitude > maxLat) maxLat = latitude;
    if (longitude < minLng) minLng = longitude;
    if (longitude > maxLng) maxLng = longitude;
  }

  const padding = 1.4;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * padding, 0.02),
    longitudeDelta: Math.max((maxLng - minLng) * padding, 0.02),
  };
}
