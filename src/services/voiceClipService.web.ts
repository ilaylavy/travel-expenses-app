// Web variant — thin playback/upload shim. The native variant owns recording
// via expo-audio; on web the recorder runs in the browser (MediaRecorder via
// expo-audio's web shim) and produces a blob: URL we can upload directly.
// We still need uploadVoiceClipToStorage / getSignedVoiceClipUrl /
// deleteVoiceClipFromStorage so web playback works against the same API.

import { supabase } from './supabase';

const PRESIGN_TTL_MS = 50 * 60 * 1000;

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
  const blob = await fetch(args.localUri).then((r) => r.blob());
  const { url } = await requestPresigned(path, 'PUT');
  const res = await fetch(url, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': 'audio/mp4' },
  });
  if (!(res.status >= 200 && res.status < 300)) {
    throw new Error(`R2 PUT (voice-clip) failed: ${res.status}`);
  }
  return path;
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
  } catch {
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

// Web has no Expo FileSystem; deleteLocalVoiceClip is a no-op shim so
// callers don't need a platform check.
export async function deleteLocalVoiceClip(_localUri: string | null): Promise<void> {
  return;
}

// Native-only stub to keep the import contract uniform — the journal
// capture screen won't call this on web.
export async function requestMicPermission(): Promise<boolean> {
  return false;
}

// Native persists a recorder's temporary file into a permanent local URI so
// the file survives long enough to be uploaded. On web there is no
// filesystem to persist to — the blob: URL the MediaRecorder produces is
// already addressable for uploadVoiceClipToStorage (which does
// `fetch(blobUri).blob()`). The identity shim keeps VoiceRecordSheet's
// flow uniform across platforms.
export async function persistVoiceClipFile(
  sourceUri: string,
  _clipId: string,
): Promise<string> {
  return sourceUri;
}
