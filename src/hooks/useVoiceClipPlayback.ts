// Lightweight wrapper around expo-av's Audio.Sound for one voice clip.
// Resolves to a local URI when the clip hasn't been uploaded yet; falls
// back to a presigned R2 GET via getSignedVoiceClipUrl once the upload
// completes. The sound instance is lazily created on first play and
// disposed on unmount.
//
// expo-av is deprecated in Expo SDK 54 in favour of expo-audio, but the
// imperative Audio.Sound API still works and matches what the voice
// recording service already uses. Migrating both together makes sense
// later — for now, parity with the rest of the journal code wins.

import { Audio, type AVPlaybackStatus } from 'expo-av';
import { useEffect, useRef, useState } from 'react';

import { getSignedVoiceClipUrl } from '@/services/voiceClipService';
import type { VoiceClip } from '@/types/voice';

interface PlaybackController {
  isPlaying: boolean;
  toggle: () => Promise<void>;
}

export function useVoiceClipPlayback(clip: VoiceClip): PlaybackController {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      const sound = soundRef.current;
      soundRef.current = null;
      if (sound) void sound.unloadAsync().catch(() => undefined);
    };
  }, []);

  async function toggle(): Promise<void> {
    const existing = soundRef.current;
    if (existing && isPlaying) {
      await existing.pauseAsync();
      setIsPlaying(false);
      return;
    }
    if (!existing) {
      const uri = clip.localUri ?? (await getSignedVoiceClipUrl(clip.storagePath));
      if (!uri) return;
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status: AVPlaybackStatus) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            setIsPlaying(false);
            const s = soundRef.current;
            if (s) void s.setPositionAsync(0).catch(() => undefined);
          }
        },
      );
      soundRef.current = sound;
      setIsPlaying(true);
      return;
    }
    await existing.playAsync();
    setIsPlaying(true);
  }

  return { isPlaying, toggle };
}
