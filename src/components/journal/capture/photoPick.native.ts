// Photo-pick orchestrator for the journal's "add photos" action. Imperative
// flow (not a component) because the FAB's action sheet kicks it off and we
// need to:
//   1. Resolve current user + trip from Zustand.
//   2. Ask for the gallery permission.
//   3. Multi-select photos via expo-image-picker, asking for EXIF.
//   4. For each asset: parse the EXIF DateTimeOriginal and combine it with
//      `args.dayDate` so the photo lands on the day the user is viewing
//      but keeps its original time-of-day. Persist a downscaled local copy.
//   5. Create a single journal_photo_entries row anchored to the earliest
//      combined timestamp so the entry slots into the right vertical
//      position on the timeline for that day.
//
// Previously the EXIF date was clamped into the trip's date range and any
// out-of-range photo was placed on the nearest trip day. That was confusing
// when uploading newer photos to an older day (or vice versa). Now the rule
// is simple: the photo lands on `args.dayDate` (the day you're looking at),
// keeping its time-of-day from EXIF when available.

import * as ImagePicker from 'expo-image-picker';

import * as journalPhotoEntries from '@/db/queries/journalPhotoEntries';
import { processAndPersistPhoto } from '@/services/photoService';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { combineDateWithTimeOfDay } from '@/utils/date';
import { parseExifDateTimeOriginal } from '@/utils/exifTime';
import { newId } from '@/utils/id';

interface Args {
  tripId: string;
  // The day the user is currently viewing. Every photo lands on this day,
  // regardless of EXIF (no clamping, no nearest-day snapping).
  dayDate: string;
}

export async function runJournalPhotoPick(args: Args): Promise<void> {
  const me = useAuthStore.getState().session?.user.id;
  if (!me) return;

  const trip = useTripStore.getState().trips.find((tr) => tr.id === args.tripId);
  if (!trip) return;

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    allowsMultipleSelection: true,
    exif: true,
  });
  if (result.canceled || result.assets.length === 0) return;

  // Use the upload moment as the fallback reference time for photos that
  // don't carry EXIF (screenshots, edited copies, etc.). Pinning all
  // no-EXIF photos in one upload to the same instant keeps their order
  // stable inside the day.
  const nowIso = new Date().toISOString();
  let earliest: string | null = null;

  try {
    const photoRefs = await Promise.all(
      result.assets.map(async (asset, idx) => {
        const exifRaw = (asset.exif as Record<string, unknown> | undefined)?.[
          'DateTimeOriginal'
        ];
        const exifTaken = parseExifDateTimeOriginal(
          typeof exifRaw === 'string' ? exifRaw : null,
        );
        // Anchor to the chosen day; keep the time-of-day from EXIF if we
        // have it, otherwise use "now". No clamping to the trip range —
        // the user explicitly picked which day this belongs to.
        const occurredAt = combineDateWithTimeOfDay(
          args.dayDate,
          exifTaken ?? nowIso,
        );
        if (!earliest || occurredAt < earliest) {
          earliest = occurredAt;
        }
        const photoId = newId();
        const localUri = await processAndPersistPhoto(asset.uri, photoId);
        return {
          localUri,
          sortOrder: idx,
          exifTakenAt: exifTaken,
        };
      }),
    );

    await journalPhotoEntries.createEntry({
      tripId: args.tripId,
      userId: me,
      occurredAt: earliest ?? combineDateWithTimeOfDay(args.dayDate, nowIso),
      caption: null,
      isPrivate: false,
      photos: photoRefs,
    });
  } catch (error) {
    console.warn('runJournalPhotoPick failed:', error);
  }
}
