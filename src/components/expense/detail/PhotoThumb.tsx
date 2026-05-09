import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { sizing } from '@/constants/theme';
import { getSignedPhotoUrl } from '@/services/photoService';
import type { ExpensePhoto } from '@/types/expense';
import { isWebViewableUri } from '@/utils/photoUri';

export function PhotoThumb({
  photo,
  borderColor,
  onPress,
}: {
  photo: ExpensePhoto;
  borderColor: string;
  onPress: () => void;
}) {
  // Only seed from localUri if this platform can actually render it. Web
  // can't load file:// URIs uploaded by native devices, so it falls through
  // to the signed-URL path below.
  const [uri, setUri] = useState<string | null>(
    isWebViewableUri(photo.localUri) ? photo.localUri : null,
  );

  useEffect(() => {
    if (isWebViewableUri(photo.localUri)) {
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
