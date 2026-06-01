// Image layout for a journal photo entry. Adapts to count:
//   1 photo:   full-width 1.5:1 hero tile.
//   2 photos:  two side-by-side 1:1 tiles.
//   3 photos:  one full-width hero + two half-width tiles (Polaroid spread).
//   4 photos:  2×2 grid.
//   5+:        2×2 with a "+N" overlay on the fourth tile.
//
// Lesson #6: individual photo `Pressable.onPress` absorbs touches, so a
// long-press on the photo will NEVER trigger the row's outer onLongPress
// unless we wire `onLongPress` on each photo tile. So callers can pass:
//   - onPhotoPress(index)       → open gallery at index (always)
//   - onPhotoLongPress(index)   → photo-specific long-press (e.g. set THIS
//                                 photo as cover, remove THIS photo)
//   - onLongPress               → fallback for the empty space inside the
//                                 grid (e.g. open entry-level actions sheet)

import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSignedJournalPhotoUrl } from '@/hooks/useSignedJournalPhotoUrl';
import { useTheme } from '@/hooks/useTheme';
import type { JournalPhoto } from '@/types/journal';

interface Props {
  photos: JournalPhoto[];
  onOpen: (index: number) => void;
  onPhotoLongPress?: (index: number) => void;
  onLongPress?: () => void;
}

const TILE_RADIUS = 14;
const TILE_GAP = 4;

export function PhotoGrid({ photos, onOpen, onPhotoLongPress, onLongPress }: Props) {
  if (photos.length === 0) return null;

  if (photos.length === 1) {
    return (
      <PhotoTile
        photo={photos[0]!}
        onPress={() => onOpen(0)}
        onLongPress={
          onPhotoLongPress
            ? () => onPhotoLongPress(0)
            : onLongPress
        }
        style={styles.heroSolo}
      />
    );
  }

  if (photos.length === 2) {
    return (
      <View style={[styles.pair, { gap: TILE_GAP }]}>
        {photos.map((p, idx) => (
          <PhotoTile
            key={p.id}
            photo={p}
            onPress={() => onOpen(idx)}
            onLongPress={
              onPhotoLongPress
                ? () => onPhotoLongPress(idx)
                : onLongPress
            }
            style={styles.pairCell}
          />
        ))}
      </View>
    );
  }

  if (photos.length === 3) {
    return (
      <View style={{ gap: TILE_GAP }}>
        <PhotoTile
          photo={photos[0]!}
          onPress={() => onOpen(0)}
          onLongPress={
            onPhotoLongPress
              ? () => onPhotoLongPress(0)
              : onLongPress
          }
          style={styles.heroOfThree}
        />
        <View style={[styles.pair, { gap: TILE_GAP }]}>
          {[1, 2].map((idx) => (
            <PhotoTile
              key={photos[idx]!.id}
              photo={photos[idx]!}
              onPress={() => onOpen(idx)}
              onLongPress={
                onPhotoLongPress
                  ? () => onPhotoLongPress(idx)
                  : onLongPress
              }
              style={styles.pairCell}
            />
          ))}
        </View>
      </View>
    );
  }

  // 4+ photos → 2x2 with +N overlay if necessary
  const tiles = photos.slice(0, 4);
  const remaining = photos.length - tiles.length;
  return (
    <View style={styles.gridFour}>
      {tiles.map((p, idx) => (
        <PhotoTile
          key={p.id}
          photo={p}
          onPress={() => onOpen(idx)}
          onLongPress={
            onPhotoLongPress
              ? () => onPhotoLongPress(idx)
              : onLongPress
          }
          style={styles.gridFourCell}
          overlay={
            idx === 3 && remaining > 0 ? (
              <View style={styles.moreOverlay}>
                <Text style={styles.moreText}>+{remaining}</Text>
              </View>
            ) : null
          }
        />
      ))}
    </View>
  );
}

function PhotoTile({
  photo,
  onPress,
  onLongPress,
  style,
  overlay,
}: {
  photo: JournalPhoto;
  onPress: () => void;
  onLongPress?: () => void;
  style: object;
  overlay?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [
        style,
        styles.tileBase,
        pressed && { opacity: 0.88 },
      ]}
    >
      <TileImage photo={photo} />
      {overlay}
    </Pressable>
  );
}

function TileImage({ photo }: { photo: JournalPhoto }) {
  const url = useSignedJournalPhotoUrl(photo.storagePath);
  const theme = useTheme();
  const uri = url ?? photo.localUri;
  if (!uri) {
    return (
      <View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.bgSoft }]}
      />
    );
  }
  return (
    <Image
      source={{ uri }}
      style={StyleSheet.absoluteFillObject}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  tileBase: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  heroSolo: {
    width: '100%',
    aspectRatio: 1.5,
    borderRadius: TILE_RADIUS,
    overflow: 'hidden',
  },
  pair: {
    flexDirection: 'row',
  },
  pairCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: TILE_RADIUS,
    overflow: 'hidden',
  },
  heroOfThree: {
    width: '100%',
    aspectRatio: 2,
    borderRadius: TILE_RADIUS,
    overflow: 'hidden',
  },
  gridFour: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  gridFourCell: {
    width: '49%',
    aspectRatio: 1,
    borderRadius: TILE_RADIUS,
    overflow: 'hidden',
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
