import { useEffect } from 'react';
import type { MapRegion } from '@/utils/mapCluster';

export function useMapViewportSync({
  map,
  setRegion,
}: {
  map: google.maps.Map | null;
  setRegion: (region: MapRegion) => void;
}) {
  // Sync map viewport into the clustering hook's region state. Listen on
  // 'idle' (fires once panning/zooming finishes) and translate the bounds
  // back into a MapRegion the clustering algorithm understands.
  useEffect(() => {
    if (!map) return;
    const sync = () => {
      const center = map.getCenter();
      const bounds = map.getBounds();
      if (!center || !bounds) return;
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      setRegion({
        latitude: center.lat(),
        longitude: center.lng(),
        latitudeDelta: Math.max(ne.lat() - sw.lat(), 0.0001),
        longitudeDelta: Math.max(ne.lng() - sw.lng(), 0.0001),
      });
    };
    // addListener can transiently return undefined when the map is mid-
    // teardown (React 19 strict mode invokes effects twice in dev), so we
    // optional-chain the cleanup to avoid the "reading 'remove'" crash.
    const listener = map.addListener('idle', sync);
    sync();
    return () => {
      listener?.remove();
    };
  }, [map, setRegion]);
}
