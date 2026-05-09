import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { sizing } from '@/constants/theme';
import { getSignedPhotoUrl } from '@/services/photoService';
import type { ExpensePhoto } from '@/types/expense';

export function PhotoThumb({
  photo,
  borderColor,
  onPress,
}: {
  photo: ExpensePhoto;
  borderColor: string;
  onPress: () => void;
}) {
  const [uri, setUri] = useState<string | null>(photo.localUri ?? null);

  useEffect(() => {
    if (photo.localUri) {
      setUri(photo.localUri);
      return;
    }
    if (!photo.storagePath) return;
    let cancelled = false;
    (async () => {
      const signed = await getSignedPhotoUrl(photo.storagePath);
      if (!cancelled) setUri(signed);
    })();
    return () => {
      cancelled = true;
    };
  }, [photo.localUri, photo.storagePath]);

  return (
    <Pressable onPress={onPress}>
      {uri ? (
        <Image source={{ uri }} style={[styles.photoThumb, { borderColor }]} />
      ) : (
        <View
          style={[styles.photoThumb, { borderColor, backgroundColor: borderColor }]}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  photoThumb: {
    width: 96,
    height: 96,
    borderRadius: sizing.radiusSmall,
    borderWidth: 1,
  },
});
