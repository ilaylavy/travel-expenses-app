// Web build of TrackedMarker. Wraps vis.gl's AdvancedMarker so the call
// site (TripMap) can stay platform-agnostic. The native variant has the
// tracksViewChanges juggle to coax Google Maps on Android into re-snapshotting
// custom views; web's <AdvancedMarker> renders DOM directly and never needs
// that, so the `identity` prop is accepted but ignored here.
import { AdvancedMarker } from '@vis.gl/react-google-maps';
import type { ReactNode } from 'react';

interface TrackedMarkerProps {
  identity: string;
  coordinate: { latitude: number; longitude: number };
  // Anchor in `{x, y}` form. AdvancedMarker uses anchorPoint constants
  // (BOTTOM_CENTER, etc.); we translate the most common values and fall
  // back to BOTTOM_CENTER for everything else (which is what the native
  // pins use anyway — anchor.x = 0.5, anchor.y = 1).
  anchor: { x: number; y: number };
  onPress: () => void;
  children: ReactNode;
}

export function TrackedMarker({
  coordinate,
  onPress,
  children,
}: TrackedMarkerProps) {
  return (
    <AdvancedMarker
      position={{ lat: coordinate.latitude, lng: coordinate.longitude }}
      onClick={onPress}
    >
      {children}
    </AdvancedMarker>
  );
}
