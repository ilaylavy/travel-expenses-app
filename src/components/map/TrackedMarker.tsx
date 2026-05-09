import { useEffect, useState, type ReactNode } from 'react';
import { Marker } from 'react-native-maps';

interface TrackedMarkerProps {
  identity: string;
  coordinate: { latitude: number; longitude: number };
  anchor: { x: number; y: number };
  onPress: () => void;
  children: ReactNode;
}

// Wraps <Marker> so we can briefly enable tracksViewChanges on first render
// and whenever the rendered content changes — Google Maps on Android needs
// this to re-snapshot custom Views, otherwise pins draw as empty space.
export function TrackedMarker({
  identity,
  coordinate,
  anchor,
  onPress,
  children,
}: TrackedMarkerProps) {
  const [tracks, setTracks] = useState(true);

  useEffect(() => {
    setTracks(true);
    const handle = setTimeout(() => setTracks(false), 250);
    return () => clearTimeout(handle);
  }, [identity]);

  return (
    <Marker
      coordinate={coordinate}
      onPress={onPress}
      anchor={anchor}
      tracksViewChanges={tracks}
    >
      {children}
    </Marker>
  );
}
