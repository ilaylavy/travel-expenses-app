// Platform-agnostic map abstractions. Both TripMap.native.tsx and
// TripMap.web.tsx implement TripMapHandle so the route can drive the map
// imperatively without knowing which underlying SDK is wired up.

export interface TripMapHandle {
  // Pan + zoom in to a single coordinate. Used by the locate-me button on
  // the route. Implementations decide their own zoom level.
  panTo: (coords: { latitude: number; longitude: number }) => void;
}

// MapHandle is the abstraction useExpenseClustering uses to drive the map.
// Native creates one over a react-native-maps mapRef; web creates one over
// the google.maps.Map instance returned by useMap(). Either way the hook
// stays platform-agnostic.
export interface MapHandle {
  // Animate to a region (lat/lng + delta). Delta is interpreted by the
  // implementation — vis.gl translates it to a zoom level.
  animateToRegion: (region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }) => void;
  // Fit the viewport so every passed coordinate is visible, with the
  // implementation choosing reasonable padding.
  fitToCoordinates: (
    coords: Array<{ latitude: number; longitude: number }>,
  ) => void;
}
