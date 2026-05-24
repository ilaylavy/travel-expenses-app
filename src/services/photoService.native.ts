import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

export interface PickedPhoto {
  uri: string;
}

const PHOTOS_DIR = `${FileSystem.documentDirectory}photos/`;

// Launch the system camera. Returns null when the user cancels or denies
// permission so the caller can just carry on without a photo.
export async function capturePhoto(): Promise<PickedPhoto | null> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return null;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      exif: false,
    });
    if (result.canceled || result.assets.length === 0) return null;
    return { uri: result.assets[0].uri };
  } catch (error) {
    console.warn('Camera failed:', error);
    return null;
  }
}

// Pick one or more photos from the photo library. Returns [] when the user
// cancels — never throws back to the caller.
export async function pickPhotosFromLibrary(): Promise<PickedPhoto[]> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return [];
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      exif: false,
    });
    if (result.canceled) return [];
    return result.assets.map((asset) => ({ uri: asset.uri }));
  } catch (error) {
    console.warn('Gallery pick failed:', error);
    return [];
  }
}

async function ensurePhotosDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
}

// Resize + recompress a picker URI and copy the result into the durable
// document directory. Returns the new file:// URI. Receipts don't need 12MP
// and the picker temp cache is OS-evictable, so this gives us both smaller
// uploads and a stable on-disk reference.
export async function processAndPersistPhoto(
  pickerUri: string,
  photoId: string,
): Promise<string> {
  await ensurePhotosDir();
  const manipulated = await ImageManipulator.manipulateAsync(
    pickerUri,
    [{ resize: { width: 2000 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );
  const targetUri = `${PHOTOS_DIR}${photoId}.jpg`;
  await FileSystem.copyAsync({ from: manipulated.uri, to: targetUri });
  return targetUri;
}

// Hit the r2-media-url Edge Function for a presigned URL or a server-side
// DELETE. The function authenticates the JWT, verifies trip membership from
// the first path segment, and returns a short-lived URL (PUT/GET) or
// performs the delete itself (DELETE).
interface PresignedResponse {
  url: string;
  expiresAt: string;
}

async function requestPresignedR2Url(
  kind: 'expense-photo' | 'journal-photo' | 'voice-clip',
  path: string,
  op: 'PUT' | 'GET',
): Promise<PresignedResponse> {
  const { data, error } = await supabase.functions.invoke<PresignedResponse>(
    'r2-media-url',
    { body: { kind, path, op } },
  );
  if (error) throw error;
  if (!data?.url) throw new Error('r2-media-url: empty response');
  return data;
}

type UploadArgs =
  | { kind: 'expense-photo'; tripId: string; expenseId: string; photoId: string; localUri: string }
  | { kind: 'journal-photo'; tripId: string; photoId: string; localUri: string };

// Upload a locally-persisted photo to R2 via a presigned PUT URL. Object key:
// expense-photo: <tripId>/<expenseId>/<photoId>.jpg
// journal-photo: <tripId>/journal/<photoId>.jpg
// The Edge Function gates by trip membership before signing.
export async function uploadPhotoToStorage(args: UploadArgs): Promise<string> {
  const path =
    args.kind === 'expense-photo'
      ? `${args.tripId}/${args.expenseId}/${args.photoId}.jpg`
      : `${args.tripId}/journal/${args.photoId}.jpg`;

  // One-shot retry: if the presigned URL expires between issuance and PUT
  // (rare with a 5-minute TTL, but possible), fetch a fresh URL and try once
  // more before letting the sync queue's outer retry handle it.
  let attempts = 0;
  let lastStatus = 0;
  while (attempts < 2) {
    attempts += 1;
    const { url } = await requestPresignedR2Url(args.kind, path, 'PUT');
    const res = await FileSystem.uploadAsync(url, args.localUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': 'image/jpeg' },
    });
    lastStatus = res.status;
    if (res.status >= 200 && res.status < 300) return path;
    if (res.status !== 403) break;
  }
  throw new Error(`R2 PUT failed with status ${lastStatus} after ${attempts} attempt(s)`);
}

// In-memory signed-URL cache. The Edge Function issues GET URLs valid for an
// hour; we treat them as valid for 50 minutes to leave headroom for clock
// skew and slow networks. The cache is process-local — no need to persist it.
const SIGNED_TTL_MS = 50 * 60 * 1000;
const signedCache = new Map<string, { url: string; expiresAt: number }>();

export async function getSignedPhotoUrl(
  storagePath: string,
  kind: 'expense-photo' | 'journal-photo' = 'expense-photo',
): Promise<string | null> {
  if (!storagePath) return null;
  const cached = signedCache.get(storagePath);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.url;
  try {
    const { url } = await requestPresignedR2Url(kind, storagePath, 'GET');
    signedCache.set(storagePath, { url, expiresAt: now + SIGNED_TTL_MS });
    return url;
  } catch (error) {
    console.warn('r2-media-url GET failed:', error);
    return null;
  }
}

// Best-effort cleanup of a locally-persisted photo. Used on soft-delete so
// the document directory doesn't grow forever. Errors are swallowed because
// a missing file isn't a real problem.
export async function deleteLocalPhoto(localUri: string | null): Promise<void> {
  if (!localUri) return;
  if (!localUri.startsWith(PHOTOS_DIR)) return;
  try {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
  } catch (error) {
    console.warn('deleteLocalPhoto failed:', error);
  }
}

// Remove an object from R2. Server-side delete via the Edge Function — saves
// a round trip vs. presigning a DELETE. Empty paths are a no-op.
export async function deletePhotoFromStorage(
  storagePath: string | null | undefined,
  kind: 'expense-photo' | 'journal-photo' = 'expense-photo',
): Promise<void> {
  if (!storagePath) return;
  signedCache.delete(storagePath);
  const { error } = await supabase.functions.invoke('r2-media-url', {
    body: { kind, path: storagePath, op: 'DELETE' },
  });
  if (error) throw error;
}
