// Resolves a journal photo's R2 storage path to a presigned GET URL via the
// shared photoService cache. Returns null while pending, and on failure
// (network error, deleted object) so the caller can render a placeholder.

import { useEffect, useState } from 'react';

import { getSignedPhotoUrl } from '@/services/photoService';

export function useSignedJournalPhotoUrl(storagePath: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!storagePath) {
      setUrl(null);
      return;
    }
    void (async () => {
      const u = await getSignedPhotoUrl(storagePath, 'journal-photo');
      if (!cancelled) setUrl(u);
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  return url;
}
