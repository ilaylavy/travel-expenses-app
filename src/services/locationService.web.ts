// Web build of the locationService. The browser exposes geolocation via
// navigator.geolocation; we promisify it and bail to null on permission
// denial / timeout the same way the native variant does. Reverse geocoding
// is intentionally skipped on web v1 — the Geocoding API is metered, and
// shipping a placeName-less expense is fine for now (the user can edit it
// later or re-pick the location). Phase 5+ can wire up reverse geocoding
// via Supabase Edge Function if it becomes a real ask.

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  placeName: string | null;
  countryCode: string | null;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const TIMEOUT_MS = 10_000;

function getPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => {
        console.warn('Location capture failed:', error.message);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}

export async function getCurrentCoordinates(): Promise<Coordinates | null> {
  const position = await getPosition();
  if (!position) return null;
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

export async function captureCurrentLocation(): Promise<CapturedLocation | null> {
  const position = await getPosition();
  if (!position) return null;
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    // Reverse geocoding is unavailable on web for now — see file header.
    placeName: null,
    countryCode: null,
  };
}
