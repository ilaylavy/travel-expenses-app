// Runtime stub for react-native-maps on web. Phase 3 of the web rollout will
// replace consumers (TripMap, TrackedMarker) with @vis.gl/react-google-maps,
// at which point this stub can be deleted. For Phase 1 it lets the route
// files keep importing from 'react-native-maps' so the bundle compiles —
// the actual map UI just renders nothing on web until Phase 3 lands.
import * as React from 'react';

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

const noopMethod = () => {
  // Native MapView ref methods (animateToRegion, fitToCoordinates, …) are
  // called from the route. Returning undefined keeps callers happy.
};

const MapView = React.forwardRef<unknown, AnyProps>((_props, ref) => {
  React.useImperativeHandle(ref, () => ({
    animateToRegion: noopMethod,
    fitToCoordinates: noopMethod,
    animateCamera: noopMethod,
  }));
  return null;
});
MapView.displayName = 'MapViewWebStub';

export default MapView;

export const Marker: React.FC<AnyProps> = () => null;
export const Polyline: React.FC<AnyProps> = () => null;
export const Polygon: React.FC<AnyProps> = () => null;
export const Circle: React.FC<AnyProps> = () => null;
export const Callout: React.FC<AnyProps> = () => null;

export const PROVIDER_GOOGLE = 'google' as const;
export const PROVIDER_DEFAULT = null;
