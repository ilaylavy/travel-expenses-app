// Web build of TripMap. Uses @vis.gl/react-google-maps to wrap the same
// Google Maps SDK that react-native-maps wraps on native. The clustering
// hook (useExpenseClustering) drives both platforms via the MapHandle
// abstraction in src/components/map/types.ts; the rest of this file is
// the vis.gl-specific glue.
//
// Phase 4 (photo upload, location capture) and Phase 5 (hosting) are not
// gated on this file — what's here lights up the map tab on web with the
// same clustering and pin behaviour the native app already has.
import {
  APIProvider,
  Map as GoogleMap,
  Marker,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import type { TripMapHandle } from '@/components/map/types';
import { spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useExpenseClustering } from '@/hooks/useExpenseClustering';
import { useFocusExpense } from '@/hooks/useFocusExpense';
import { useWebMapHandle } from '@/hooks/useWebMapHandle';
import { useMapViewportSync } from '@/hooks/useMapViewportSync';
import type { Category } from '@/types/category';
import type { ExpenseWithPhotos } from '@/types/expense';

const API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_WEB ??
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
  '';

// Builds a small data:image/svg+xml URL for a colored pin. Legacy <Marker>
// accepts an icon URL; SVG inline keeps it sharp at any zoom level.
function pinIconUrl(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" fill="${color}" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"/><circle cx="12" cy="12" r="4" fill="white"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function clusterIconUrl(count: number): string {
  const size = count > 99 ? 40 : count > 9 ? 36 : 32;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="#5B6CFF" stroke="rgba(255,255,255,0.6)" stroke-width="2"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" fill="white" font-family="-apple-system,system-ui,sans-serif" font-size="14" font-weight="700">${count}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface TripMapProps {
  allExpenses: ExpenseWithPhotos[];
  visibleExpenses: ExpenseWithPhotos[];
  categoryById: Map<string, Category>;
  homeCurrency: string;
  selectedExpenseId: string | null;
  onPressExpense: (expense: ExpenseWithPhotos) => void;
  focusExpenseId?: string | null;
  onFocusHandled?: () => void;
}

interface ImperativeHandleRef {
  current: TripMapHandle | null;
}

export const TripMap = forwardRef<TripMapHandle, TripMapProps>(function TripMap(
  props,
  ref,
) {
  // The imperative handle (panTo) only works once useMap() has resolved.
  // We bridge that through a ref the inner component populates.
  const innerHandleRef = useRef<TripMapHandle | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      panTo: (coords) => innerHandleRef.current?.panTo(coords),
    }),
    [],
  );

  if (!API_KEY) {
    return <MissingKeyState />;
  }

  return (
    <APIProvider apiKey={API_KEY}>
      <GoogleMap
        defaultCenter={{ lat: 20, lng: 0 }}
        defaultZoom={2}
        style={styles.map}
        gestureHandling="greedy"
        disableDefaultUI={false}
        clickableIcons={false}
      >
        <MapInner {...props} handleRef={innerHandleRef} />
      </GoogleMap>
    </APIProvider>
  );
});

interface MapInnerProps extends TripMapProps {
  handleRef: ImperativeHandleRef;
}

function MapInner({
  allExpenses,
  visibleExpenses,
  categoryById,
  onPressExpense,
  focusExpenseId,
  onFocusHandled,
  handleRef,
}: MapInnerProps) {
  const map = useMap();
  const mapHandle = useWebMapHandle({ map, handleRef });

  const { items, setRegion, focusExpense, zoomIntoCluster } = useExpenseClustering({
    allExpenses,
    visibleExpenses,
    mapHandle,
  });

  useMapViewportSync({ map, setRegion });

  useFocusExpense({
    focusExpenseId,
    allExpenses,
    focusExpense,
    onPressExpense,
    onFocusHandled,
  });

  return (
    <>
      {items.map((item) => {
        const position = {
          lat: Number(item.latitude),
          lng: Number(item.longitude),
        };
        if (item.type === 'pin') {
          const category = categoryById.get(item.expense.categoryId) ?? null;
          const color = category?.color ?? '#5B6CFF';
          return (
            <Marker
              key={item.key}
              position={position}
              icon={pinIconUrl(color)}
              onClick={() => onPressExpense(item.expense)}
            />
          );
        }
        return (
          <Marker
            key={item.key}
            position={position}
            icon={clusterIconUrl(item.count)}
            onClick={() => zoomIntoCluster(item.expenses)}
          />
        );
      })}
    </>
  );
}

function MissingKeyState() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.missingKey,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Icon name="map-pin" size={40} color={theme.textSecondary} stroke={1.8} />
      <Text style={[styles.missingKeyTitle, { color: theme.text }]}>
        Map unavailable
      </Text>
      <Text style={[styles.missingKeyBody, { color: theme.textSecondary }]}>
        EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_WEB (or EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) is not set for the web build.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  missingKey: {
    position: 'absolute',
    top: '40%',
    left: spacing.lg,
    right: spacing.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
  },
  // (formerly emoji — replaced by SVG map-pin.)
  missingKeyTitle: { ...typography.itemTitle, marginBottom: 4 },
  missingKeyBody: { ...typography.secondary, textAlign: 'center' },
});
