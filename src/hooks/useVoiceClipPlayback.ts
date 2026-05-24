// One-clip playback controller built on expo-audio's imperative
// createAudioPlayer (the SDK 54 replacement for expo-av's Audio.Sound).
//
// We don't use useAudioPlayer because the source URL is async-resolved
// (presigned R2 GET on the first toggle when the clip has no localUri).
// createAudioPlayer lets us defer construction until we have a URL while
// keeping the same imperative play/pause shape.

import { useEffect, useRef, useState } from 'react';
import { createAudioPlayer } from 'expo-audio';

import { getSignedVoiceClipUrl } from '@/services/voiceClipService';
import type { VoiceClip } from '@/types/voice';

type AudioPlayer = ReturnType<typeof createAudioPlayer>;

interface PlaybackController {
  isPlaying: boolean;
  toggle: () => Promise<void>;
}

export function useVoiceClipPlayback(clip: VoiceClip): PlaybackController {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      const p = playerRef.current;
      playerRef.current = null;
      if (!p) return;
      try {
        p.pause();
      } catch {
        // ignore — player may already be released
      }
      try {
        p.remove();
      } catch {
        // ignore
      }
    };
  }, []);

  async function toggle(): Promise<void> {
    const existing = playerRef.current;
    if (existing && isPlaying) {
      try {
        existing.pause();
      } catch {
        // ignore
      }
      setIsPlaying(false);
      return;
    }
    if (!existing) {
      const uri = clip.localUri ?? (await getSignedVoiceClipUrl(clip.storagePath));
      if (!uri) return;
      const player = createAudioPlayer({ uri });
      playerRef.current = player;
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
          try {
            void player.seekTo(0);
          } catch {
            // ignore
          }
        }
      });
      try {
        player.play();
        setIsPlaying(true);
      } catch (error) {
        console.warn('useVoiceClipPlayback: play failed', error);
      }
      return;
    }
    try {
      existing.play();
      setIsPlaying(true);
    } catch (error) {
      console.warn('useVoiceClipPlayback: resume failed', error);
    }
  }

  return { isPlaying, toggle };
}
