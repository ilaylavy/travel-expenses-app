// Image layout for a journal photo entry. A single photo renders as a
// full-width hero tile; 2-4 photos lay out as a 2x2 grid; 5+ collapse to
// a 2x2 grid with the fourth tile showing a "+N" overlay so the user
// knows more are available. Tap → onOpen(index) (gallery viewer is wired
// in Phase 3).

import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSignedJournalPhotoUrl } from '@/hooks/useSignedJournalPhotoUrl';
import { useTheme } from '@/hooks/useTheme';
import type { JournalPhoto } from '@/types/journal';

interface Props {
  photos: JournalPhoto[];
  onOpen: (index: number) => void;
}

export function PhotoGrid({ photos, onOpen }: Props) {
  if (photos.length === 0) return null;
  if (photos.length === 1) {
    return <SingleTile photo={photos[0]} onPress={() => onOpen(0)} />;
  }
  const tiles = photos.slice(0, 4);
  const remaining = photos.length - tiles.length;
  return (
    <View style={styles.grid}>
      {tiles.map((p, idx) => (
        <Pressable
          key={p.id}
          onPress={() => onOpen(idx)}
          style={({ pressed }) => [styles.cell, pressed && { opacity: 0.85 }]}
        >
          <Tile photo={p} />
          {idx === 3 && remaining > 0 ? (
            <View style={styles.moreOverlay}>
              <Text style={styles.moreText}>+{remaining}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

function Tile({ photo }: { photo: JournalPhoto }) {
  // Prefer the local URI while the photo is still pending R2 upload so the
  // user sees their freshly-captured shot immediately. Once the upload
  // completes, storagePath resolves to a signed URL and we swap in.
  const url = useSignedJournalPhotoUrl(photo.storagePath);
  const theme = useTheme();
  const uri = url ?? photo.localUri;
  if (!uri) {
    return <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.surface }]} />;
  }
  return <Image source={{ uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />;
}

function SingleTile({ photo, onPress }: { photo: JournalPhoto; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.single, pressed && { opacity: 0.9 }]}>
      <Tile photo={photo} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  single: {
    width: '100%',
    aspectRatio: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 12,
    overflow: 'hidden',
    aspectRatio: 1,
  },
  cell: { width: '50%', height: '50%', position: 'relative' },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
