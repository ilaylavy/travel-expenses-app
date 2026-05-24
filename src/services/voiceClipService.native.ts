// Voice clip recording (expo-av) + upload to R2 via r2-media-url.
//
// expo-av is deprecated in Expo SDK 54 in favour of expo-audio. We stay on
// the imperative Audio.Recording class for now because the journal capture
// flow needs to drive the recorder from outside a React component (a hold-
// to-record gesture controller) and expo-audio's hook-based API doesn't
// fit. If a future upgrade splits recording state into a Zustand store,
// migrating to expo-audio becomes feasible.

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from './supabase';

const CLIPS_DIR = `${FileSystem.documentDirectory}voice-clips/`;
const PRESIGN_TTL_MS = 50 * 60 * 1000;

// AAC/M4A — well-supported by expo-av, small at 64kbps. Mono is fine for
// voice. matches the .m4a path shape expected by r2-media-url's voice-clip
// validator.
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: false,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: '.m4a',
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 64000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CLIPS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CLIPS_DIR, { intermediates: true });
  }
}

// Caller manages the recording lifecycle. We don't keep state in this module —
// the screen owns the Audio.Recording instance.
export async function requestMicPermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

export async function createRecording(): Promise<Audio.Recording> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(RECORDING_OPTIONS);
  await recording.startAsync();
  return recording;
}

export interface FinishedRecording {
  localUri: string;
  durationSec: number;
}

export async function finishRecording(
  recording: Audio.Recording,
  clipId: string,
): Promise<FinishedRecording> {
  await recording.stopAndUnloadAsync();
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  const tempUri = recording.getURI();
  if (!tempUri) throw new Error('voiceClipService: recording produced no URI');
  await ensureDir();
  const targetUri = `${CLIPS_DIR}${clipId}.m4a`;
  await FileSystem.copyAsync({ from: tempUri, to: targetUri });
  const status = await recording.getStatusAsync();
  const durationSec = Math.max(
    1,
    Math.round(((status as { durationMillis?: number }).durationMillis ?? 0) / 1000),
  );
  return { localUri: targetUri, durationSec };
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
