// Web build of photoService. Web has no filesystem and no expo-image-picker;
// photo selection happens through a hidden <input type="file"> we click
// programmatically. Each picked File becomes a blob: URL we hold in an
// in-memory Map keyed by URL — the upload path looks up the original Blob
// by that URL when the user saves the expense.
//
// localUri on web rows is always null (the blob: URL dies on refresh and
// the device that captured it is the only one that has the bytes). The
// canonical render path is the signed URL via getSignedPhotoUrl.
//
// Failure mode: if upload fails after the expense is created, the blob is
// still in our Map, but a refresh wipes it. The expense_photos row may
// reference a storage_path that doesn't exist; the gallery falls back to
// "photo failed to load" and the orphan storage_path is retained. A future
// retry queue can address this if it becomes a real issue.

import { supabase } from './supabase';

export interface PickedPhoto {
  uri: string;
}

// Map of blob URL → File. Lookups are O(1) and bounded by however many
// photos the user is staging in the entry form before saving.
const blobByUrl = new Map<string, File>();

interface PickFilesOptions {
  accept: string;
  multiple?: boolean;
  capture?: 'environment' | 'user';
}

// Programmatic file picker. The <input> is appended off-screen, click()'d,
// and removed once the user finishes (selects a file or cancels). Most
// modern browsers fire a 'cancel' event on dismiss; older ones don't, in
// which case the promise simply resolves on the next change event from a
// future picker.
function pickFiles(opts: PickFilesOptions): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = opts.accept;
    if (opts.multiple) input.multiple = true;
    if (opts.capture) input.setAttribute('capture', opts.capture);
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    const cleanup = (): void => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      cleanup();
      resolve(files);
    };
    // 'cancel' fires when the user closes the picker without selecting.
    input.addEventListener('cancel', () => {
      cleanup();
      resolve([]);
    });

    input.click();
  });
}

function registerFile(file: File): PickedPhoto {
  const url = URL.createObjectURL(file);
  blobByUrl.set(url, file);
  return { uri: url };
}

export async function capturePhoto(): Promise<PickedPhoto | null> {
  // capture="environment" hints to mobile browsers that the back camera is
  // preferred. Desktop browsers ignore the attribute and just open the file
  // picker — which is the same as pickPhotosFromLibrary on those devices.
  const files = await pickFiles({ accept: 'image/*', capture: 'environment' });
  if (files.length === 0) return null;
  return registerFile(files[0]);
}

export async function pickPhotosFromLibrary(): Promise<PickedPhoto[]> {
  const files = await pickFiles({ accept: 'image/*', multiple: true });
  return files.map(registerFile);
}

// On native this resizes + recompresses the image and copies it to the
// document directory. On web the blob URL is already a stable reference
// to the in-memory File, so we just return it as-is. Canvas-based
// downscaling could be added here if upload sizes get out of hand.
export async function processAndPersistPhoto(
  pickerUri: string,
  _photoId: string,
): Promise<string> {
  return pickerUri;
}

// Hit the r2-media-url Edge Function for a presigned URL.
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

// Looks up the staged File by blob URL and uploads its bytes to R2 via a
// presigned PUT URL at the same trip/expense/photo key as the native
// variant. The Map entry is purged on success so we don't hold the bytes
// longer than needed.
export async function uploadPhotoToStorage(args: UploadArgs): Promise<string> {
  const file = blobByUrl.get(args.localUri);
  if (!file) {
    throw new Error(
      `uploadPhotoToStorage: no in-memory file for ${args.localUri}. ` +
        `The page may have been refreshed mid-upload.`,
    );
  }
  const path =
    args.kind === 'expense-photo'
      ? `${args.tripId}/${args.expenseId}/${args.photoId}.jpg`
      : `${args.tripId}/journal/${args.photoId}.jpg`;

  // One-shot retry on 403 covers the rare URL-expired race; the sync queue
  // handles any other failure with its outer retry.
  let attempts = 0;
  let lastStatus = 0;
  while (attempts < 2) {
    attempts += 1;
    const { url } = await requestPresignedR2Url(args.kind, path, 'PUT');
    const res = await fetch(url, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'image/jpeg' },
    });
    lastStatus = res.status;
    if (res.ok) {
      blobByUrl.delete(args.localUri);
      URL.revokeObjectURL(args.localUri);
      return path;
    }
    if (res.status !== 403) break;
  }
  throw new Error(`R2 PUT failed with status ${lastStatus} after ${attempts} attempt(s)`);
}

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

export async function deleteLocalPhoto(localUri: string | null): Promise<void> {
  if (!localUri) return;
  if (!localUri.startsWith('blob:')) return;
  const had = blobByUrl.has(localUri);
  blobByUrl.delete(localUri);
  if (had) URL.revokeObjectURL(localUri);
}

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
