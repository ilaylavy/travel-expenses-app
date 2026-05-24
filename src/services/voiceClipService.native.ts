// Voice clip upload + signed-URL cache + local file persistence.
//
// Recording itself lives in VoiceRecordSheet.tsx now — expo-audio (the
// SDK 54 replacement for the deprecated expo-av) only exposes
// useAudioRecorder as a React hook, with no imperative constructor. We
// therefore keep the file-system + R2 helpers here and let the screen
// own the recorder lifecycle.

import * as FileSystem from 'expo-file-system/legacy';
import { requestRecordingPermissionsAsync } from 'expo-audio';

import { supabase } from './supabase';

const CLIPS_DIR = `${FileSystem.documentDirectory}voice-clips/`;
const PRESIGN_TTL_MS = 50 * 60 * 1000;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CLIPS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CLIPS_DIR, { intermediates: true });
  }
}

export async function requestMicPermission(): Promise<boolean> {
  const { granted } = await requestRecordingPermissionsAsync();
  return granted;
}

// Copy a recorder's temporary file into the durable documents dir under a
// stable name. Returns the new file:// URI suitable for uploads + playback.
export async function persistVoiceClipFile(
  sourceUri: string,
  clipId: string,
): Promise<string> {
  await ensureDir();
  const targetUri = `${CLIPS_DIR}${clipId}.m4a`;
  await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  return targetUri;
}

// Upload + URL-cache plumbing — analogous to photoService's helpers but with
// kind:'voice-clip', a separate path shape, and audio/mp4 Content-Type.
interface PresignedResponse {
  url: string;
  expiresAt: string;
}

async function requestPresigned(
  path: string,
  op: 'PUT' | 'GET',
): Promise<PresignedResponse> {
  const { data, error } = await supabase.functions.invoke<PresignedResponse>(
    'r2-media-url',
    { body: { kind: 'voice-clip', path, op } },
  );
  if (error) throw error;
  if (!data?.url) throw new Error('r2-media-url: empty response');
  return data;
}

export async function uploadVoiceClipToStorage(args: {
  tripId: string;
  clipId: string;
  localUri: string;
}): Promise<string> {
  const path = `${args.tripId}/${args.clipId}.m4a`;
  let attempts = 0;
  let lastStatus = 0;
  while (attempts < 2) {
    attempts += 1;
    const { url } = await requestPresigned(path, 'PUT');
    const res = await FileSystem.uploadAsync(url, args.localUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': 'audio/mp4' },
    });
    lastStatus = res.status;
    if (res.status >= 200 && res.status < 300) return path;
    if (res.status !== 403) break;
  }
  throw new Error(
    `R2 PUT (voice-clip) failed with status ${lastStatus} after ${attempts} attempt(s)`,
  );
}

const signedCache = new Map<string, { url: string; expiresAt: number }>();

export async function getSignedVoiceClipUrl(
  storagePath: string,
): Promise<string | null> {
  if (!storagePath) return null;
  const cached = signedCache.get(storagePath);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.url;
  try {
    const { url } = await requestPresigned(storagePath, 'GET');
    signedCache.set(storagePath, { url, expiresAt: now + PRESIGN_TTL_MS });
    return url;
  } catch (error) {
    console.warn('r2-media-url GET (voice-clip) failed:', error);
    return null;
  }
}

export async function deleteVoiceClipFromStorage(
  storagePath: string | null | undefined,
): Promise<void> {
  if (!storagePath) return;
  signedCache.delete(storagePath);
  const { error } = await supabase.functions.invoke('r2-media-url', {
    body: { kind: 'voice-clip', path: storagePath, op: 'DELETE' },
  });
  if (error) throw error;
}

export async function deleteLocalVoiceClip(localUri: string | null): Promise<void> {
  if (!localUri) return;
  if (!localUri.startsWith(CLIPS_DIR)) return;
  try {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
  } catch (error) {
    console.warn('deleteLocalVoiceClip failed:', error);
  }
}
