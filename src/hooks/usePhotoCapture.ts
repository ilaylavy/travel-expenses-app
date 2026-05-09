import { useCallback, useState } from 'react';

import {
  capturePhoto,
  pickPhotosFromLibrary,
  processAndPersistPhoto,
} from '@/services/photoService';
import { newId } from '@/utils/id';
import type { PersistedPhoto } from '@/hooks/useExpenseEntryForm';

export interface DraftPhoto {
  uri: string;
}

export function usePhotoCapture() {
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);

  const handleCamera = useCallback(async () => {
    const photo = await capturePhoto();
    if (photo) setPhotos((prev) => [...prev, photo]);
  }, []);

  const handleGallery = useCallback(async () => {
    const picked = await pickPhotosFromLibrary();
    if (picked.length > 0) setPhotos((prev) => [...prev, ...picked]);
  }, []);

  const removePhoto = useCallback((uri: string) => {
    setPhotos((prev) => prev.filter((p) => p.uri !== uri));
  }, []);

  // Resize, recompress, and copy each photo into the document directory before
  // persisting. Picker URIs live in the OS temp cache and can be evicted; the
  // durable copy is what we sync. The photo id is generated up-front so the
  // file path can embed it before the DB row is inserted.
  const persistAll = useCallback(async (): Promise<PersistedPhoto[]> => {
    return Promise.all(
      photos.map(async (p) => {
        const photoId = newId();
        const localUri = await processAndPersistPhoto(p.uri, photoId);
        return { id: photoId, localUri };
      }),
    );
  }, [photos]);

  return {
    photos,
    handleCamera,
    handleGallery,
    removePhoto,
    persistAll,
  };
}

export type PhotoCapture = ReturnType<typeof usePhotoCapture>;
