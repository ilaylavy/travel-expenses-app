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
  // Native can still hand us a stale file:// (different app bundle, app
  // reinstall, sync from another device). Once Image fires onError on a
  // local URI we drop it and re-resolve through the signed URL.
  const [localFailed, setLocalFailed] = useState(false);

  useEffect(() => {
    setLocalFailed(false);
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

  // Image onError → fall back from a dead local URI to the signed URL.
  // Only triggers on the local-first render; once we're already showing a
  // signed URL, onError is the real failure path and we have nothing to fall
  // back to.
  const handleImageError = (): void => {
    if (localFailed) return;
    setLocalFailed(true);
    setUri(null);
    if (!photo.storagePath) return;
    void (async () => {
      const signed = await getSignedPhotoUrl(photo.storagePath);
      setUri(signed);
    })();
  };

  return (
    <Pressable onPress={onPress}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.photoThumb, { borderColor }]}
          onError={handleImageError}
        />
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
