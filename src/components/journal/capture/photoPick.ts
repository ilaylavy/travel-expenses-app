// Photo-pick orchestrator for the journal's "add photos" action. Imperative
// flow (not a component) because the FAB's action sheet kicks it off and we
// need to:
//   1. Resolve current user + trip from Zustand.
//   2. Ask for the gallery permission.
//   3. Multi-select photos via expo-image-picker, asking for EXIF.
//   4. For each asset: parse the EXIF DateTimeOriginal, clamp to the trip
//      window, persist a downscaled local copy via processAndPersistPhoto.
//   5. Create a single journal_photo_entries row referencing every photo,
//      anchored to the earliest occurredAt so the timeline order matches
//      the actual moment-of-capture.
// If any photo's EXIF date was clamped, a single non-blocking alert is
// surfaced so the user understands why an old photo landed on a trip day.

import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import * as journalPhotoEntries from '@/db/queries/journalPhotoEntries';
import i18n from '@/i18n';
import { processAndPersistPhoto } from '@/services/photoService';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { parseExifDateTimeOriginal } from '@/utils/exifTime';
import { newId } from '@/utils/id';
import { clampOccurredAtToTrip } from '@/utils/tripDateClamp';

interface Args {
  tripId: string;
  // dayDate is unused at create time (we anchor to the earliest EXIF moment
  // so the entry slots into the right day on its own), but the caller passes
  // it so a future "force-pin to this day" toggle can plug in here.
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

  let earliest: string | null = null;
  let anyClamped = false;
  try {
    const photoRefs = await Promise.all(
      result.assets.map(async (asset, idx) => {
        const exifRaw = (asset.exif as Record<string, unknown> | undefined)?.[
          'DateTimeOriginal'
        ];
        const exifTaken = parseExifDateTimeOriginal(
          typeof exifRaw === 'string' ? exifRaw : null,
        );
        const clamp = clampOccurredAtToTrip({
          occurredAt: exifTaken ?? new Date().toISOString(),
          tripStartDate: trip.startDate,
          tripEndDate: trip.endDate,
        });
        if (clamp.clamped) anyClamped = true;
        if (!earliest || clamp.occurredAt < earliest) {
          earliest = clamp.occurredAt;
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
      occurredAt: earliest ?? new Date().toISOString(),
      caption: null,
      isPrivate: false,
      photos: photoRefs,
    });
  } catch (error) {
    console.warn('runJournalPhotoPick failed:', error);
    return;
  }

  if (anyClamped) {
    Alert.alert(i18n.t('journal.outsideTripWarning'));
  }
}
