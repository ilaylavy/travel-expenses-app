import { useEffect, useMemo } from 'react';

import type { MapHandle, TripMapHandle } from '@/components/map/types';

export function useWebMapHandle({
  map,
  handleRef,
}: {
  map: google.maps.Map | null;
  handleRef: React.MutableRefObject<TripMapHandle | null>;
}) {
  // MapHandle for the clustering hook. Translates the platform-agnostic
  // Region (latitude/delta) into google.maps panTo/fitBounds calls.
  const mapHandle = useMemo<MapHandle | null>(() => {
    if (!map) return null;
    return {
      animateToRegion: (region) => {
        map.panTo({ lat: region.latitude, lng: region.longitude });
        // longitudeDelta is in degrees; Google zoom is log2(360 / delta).
        // The clamp keeps us inside the legal zoom range.
        const zoom = Math.max(
          0,
          Math.min(20, Math.round(Math.log2(360 / Math.max(region.longitudeDelta, 0.0001)))),
        );
        map.setZoom(zoom);
      },
      fitToCoordinates: (coords) => {
        if (coords.length === 0) return;
        let north = coords[0].latitude;
        let south = north;
        let east = coords[0].longitude;
        let west = east;
        for (let i = 1; i < coords.length; i += 1) {
          const { latitude, longitude } = coords[i];
          if (latitude > north) north = latitude;
          if (latitude < south) south = latitude;
          if (longitude > east) east = longitude;
          if (longitude < west) west = longitude;
        }
        map.fitBounds({ north, south, east, west }, 64);
      },
    };
  }, [map]);

  // Imperative handle for the parent's panTo. Re-registers when map changes.
  useEffect(() => {
    if (!map) {
      handleRef.current = null;
      return;
    }
    handleRef.current = {
      panTo: (coords) => {
        map.panTo({ lat: coords.latitude, lng: coords.longitude });
        map.setZoom(15);
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [map, handleRef]);

  return mapHandle;
}
