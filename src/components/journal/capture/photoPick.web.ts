// Web variant of the journal photo-pick orchestrator. On web, expo-image-picker
// has spotty support, so we delegate to photoService.web.ts which uses a
// hidden <input type="file"> instead. The file input cannot expose EXIF
// (browsers strip it), so we have no DateTimeOriginal to recover — every
// photo's time-of-day is the upload moment.
//
// Day anchoring matches the native variant (Bug 1 fix philosophy): the photo
// lands on `args.dayDate` (the day the user is viewing), regardless of when
// the underlying file was taken. No clamping to the trip range — the user
// explicitly picked which day this belongs to.
//
// Upload happens inline inside journalPhotoEntries.createEntry (web variant)
// rather than through the sync queue, because the web build has no local
// SQLite and no background sync engine.

import { Alert } from 'react-native';

import * as journalPhotoEntries from '@/db/queries/journalPhotoEntries';
import { pickPhotosFromLibrary, processAndPersistPhoto } from '@/services/photoService';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { combineDateWithTimeOfDay } from '@/utils/date';
import { newId } from '@/utils/id';

interface Args {
  tripId: string;
  // The day the user is currently viewing. Every photo lands on this day.
  dayDate: string;
}

export async function runJournalPhotoPick(args: Args): Promise<void> {
  const me = useAuthStore.getState().session?.user.id;
  if (!me) return;

  const trip = useTripStore.getState().trips.find((tr) => tr.id === args.tripId);
  if (!trip) return;

  const picked = await pickPhotosFromLibrary();
  if (picked.length === 0) return;

  // No EXIF on web; use the upload moment as the time-of-day for every
  // photo. Pinning all photos in one upload to the same instant keeps
  // their order stable inside the day.
  const nowIso = new Date().toISOString();
  const occurredAt = combineDateWithTimeOfDay(args.dayDate, nowIso);

  try {
    const photoRefs = await Promise.all(
      picked.map(async (asset, idx) => {
        const photoId = newId();
        const localUri = await processAndPersistPhoto(asset.uri, photoId);
        return {
          localUri,
          sortOrder: idx,
          exifTakenAt: null as string | null,
        };
      }),
    );

    await journalPhotoEntries.createEntry({
      tripId: args.tripId,
      userId: me,
      occurredAt,
      caption: null,
      isPrivate: false,
      photos: photoRefs,
    });
  } catch (error) {
    // Log the full error for devtools inspection. createEntry rolls back
    // the parent entry on failure (see journalPhotoEntries.web.ts) so the
    // user doesn't end up with an empty zombie entry in the timeline.
    console.warn('runJournalPhotoPick (web) failed:', error);
    // Surface a user-visible message so the failure doesn't look like a
    // mysterious "I uploaded but nothing showed up". RN's Alert renders
    // on web via window.alert.
    const message =
      error instanceof Error
        ? error.message
        : 'Could not upload photo. Please try again.';
    Alert.alert('Photo upload failed', message);
  }
}
