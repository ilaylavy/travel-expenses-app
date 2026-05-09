import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

export interface PickedPhoto {
  uri: string;
}

const PHOTOS_DIR = `${FileSystem.documentDirectory}photos/`;
const BUCKET = 'expense-photos';

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

// atob is available in Hermes / modern RN runtimes used by Expo SDK 52+.
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Upload a locally-persisted photo to the private expense-photos bucket.
// Object key: <tripId>/<expenseId>/<photoId>.jpg. RLS on storage.objects
// enforces trip-membership via the first path segment.
export async function uploadPhotoToStorage(args: {
  tripId: string;
  expenseId: string;
  photoId: string;
  localUri: string;
}): Promise<string> {
  const path = `${args.tripId}/${args.expenseId}/${args.photoId}.jpg`;
  const base64 = await FileSystem.readAsStringAsync(args.localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const body = base64ToArrayBuffer(base64);
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

// In-memory signed-URL cache. Signed URLs are issued for an hour; we treat
// them as valid for 50 minutes to leave headroom for clock skew and slow
// network. The cache is process-local — no need to persist it.
const SIGNED_TTL_MS = 50 * 60 * 1000;
const signedCache = new Map<string, { url: string; expiresAt: number }>();

export async function getSignedPhotoUrl(
  storagePath: string,
): Promise<string | null> {
  if (!storagePath) return null;
  const cached = signedCache.get(storagePath);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.url;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error || !data) {
    console.warn('createSignedUrl failed:', error);
    return null;
  }
  signedCache.set(storagePath, {
    url: data.signedUrl,
    expiresAt: now + SIGNED_TTL_MS,
  });
  return data.signedUrl;
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

// Remove an object from Storage. Used by sync when it processes an
// expense_photos delete entry. Empty paths and missing objects are no-ops.
export async function deletePhotoFromStorage(
  storagePath: string | null | undefined,
): Promise<void> {
  if (!storagePath) return;
  signedCache.delete(storagePath);
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) throw error;
}
