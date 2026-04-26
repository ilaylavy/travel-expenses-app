import * as Location from 'expo-location';

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  placeName: string | null;
}

function formatPlace(address: Location.LocationGeocodedAddress): string | null {
  const parts = [address.name, address.city ?? address.subregion, address.country].filter(
    (p): p is string => Boolean(p) && typeof p === 'string',
  );
  // Avoid "123, 123 Main St, Paris" duplication when name is just a street number.
  const unique = Array.from(new Set(parts));
  const joined = unique.join(', ');
  return joined.length > 0 ? joined : null;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// GPS-only fix without reverse geocoding. Used by the map's "recenter on me"
// button where a place name isn't needed. Prefers a recent cached fix so the
// map snaps instantly when the OS already has one.
export async function getCurrentCoordinates(): Promise<Coordinates | null> {
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'undetermined') {
      ({ status } = await Location.requestForegroundPermissionsAsync());
    }
    if (status !== 'granted') return null;

    const cached = await Location.getLastKnownPositionAsync({
      maxAge: 60_000,
      requiredAccuracy: 200,
    });
    if (cached) {
      return { latitude: cached.coords.latitude, longitude: cached.coords.longitude };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch (error) {
    console.warn('Location capture failed:', error);
    return null;
  }
}

// Capture GPS once + reverse geocode. Fails silently (returns null) on
// permission denial or timeout so entry is never blocked by location issues.
export async function captureCurrentLocation(): Promise<CapturedLocation | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const { latitude, longitude } = position.coords;
    let placeName: string | null = null;
    try {
      const addresses = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (addresses.length > 0) {
        placeName = formatPlace(addresses[0]);
      }
    } catch {
      // reverse geocode is best-effort
    }

    return { latitude, longitude, placeName };
  } catch (error) {
    console.warn('Location capture failed:', error);
    return null;
  }
}
