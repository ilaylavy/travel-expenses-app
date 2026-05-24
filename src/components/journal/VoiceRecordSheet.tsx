// Bottom-sheet voice recorder. Owns the Audio.Recording instance via a ref so
// the auto-stop timer doesn't race a stale closure, drives a 1-second elapsed
// tick, warns at MAX_SECONDS - 30s and force-stops at MAX_SECONDS. Persisted
// recording state lives in a ref because we read it from inside the tick
// without making setElapsed depend on it.
//
// State machine: idle → recording → finished → (saved|discarded). The
// `finishedUri` field gates the save/discard pair, so save() can only run on
// a successfully stopped recording.

import { Audio } from 'expo-av';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import * as voiceClips from '@/db/queries/voiceClips';
import {
  createRecording,
  finishRecording,
  requestMicPermission,
} from '@/services/voiceClipService';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import { newId } from '@/utils/id';

const MAX_SECONDS = 300;
const WARN_AT = MAX_SECONDS - 30;

interface Props {
  visible: boolean;
  tripId: string;
  dayDate: string;
  onDismiss: () => void;
  onSaved: () => void;
}

export function VoiceRecordSheet({
  visible,
  tripId,
  // dayDate is reserved for future use — recordings are stamped with
  // `new Date().toISOString()` at save time. Keep it in the props so the
  // public surface matches the rest of the journal capture flow.
  dayDate: _dayDate,
  onDismiss,
  onSaved,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);
  const [finishedUri, setFinishedUri] = useState<string | null>(null);
  const [finishedDuration, setFinishedDuration] = useState(0);

  // Reset state every time the sheet re-opens. We don't reset on close so the
  // discard path can clean up explicitly without racing the reset.
  useEffect(() => {
    if (!visible) return;
    setElapsed(0);
    setRecording(false);
    setFinishedUri(null);
    setFinishedDuration(0);
  }, [visible]);

  const stop = useCallback(async (): Promise<void> => {
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;
    try {
      const result = await finishRecording(rec, newId());
      setRecording(false);
      setFinishedUri(result.localUri);
      setFinishedDuration(result.durationSec);
    } catch (error) {
      console.warn('VoiceRecordSheet stop failed:', error);
      setRecording(false);
    }
  }, []);

  // 1Hz tick driven only by the `recording` flag. setElapsed uses the prev
  // state callback so we never read a stale `elapsed`. Auto-stop fires once
  // when we cross the cap; using recordingRef.current to gate it instead of
  // the React state ensures the stale-closure scenario can't double-fire.
  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        if (next >= MAX_SECONDS && recordingRef.current) {
          void stop();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [recording, stop]);

  // Best-effort cleanup if the sheet unmounts mid-recording. We never await
  // here because cleanup runs synchronously; the recording object handles its
  // own teardown if its consumer abandons it.
  useEffect(() => {
    return () => {
      const rec = recordingRef.current;
      if (!rec) return;
      recordingRef.current = null;
      void rec.stopAndUnloadAsync().catch(() => {
        // Swallow — the recording may already be finalized.
      });
    };
  }, []);

  async function start(): Promise<void> {
    const granted = await requestMicPermission();
    if (!granted) return;
    try {
      const rec = await createRecording();
      recordingRef.current = rec;
      setElapsed(0);
      setRecording(true);
    } catch (error) {
      console.warn('VoiceRecordSheet start failed:', error);
    }
  }

  async function save(): Promise<void> {
    if (!finishedUri) return;
    const me = useAuthStore.getState().session?.user.id;
    if (!me) return;
    try {
      await voiceClips.createClip({
        tripId,
        userId: me,
        occurredAt: new Date().toISOString(),
        localUri: finishedUri,
        durationSec: finishedDuration,
        isPrivate: false,
      });
      onSaved();
    } catch (error) {
      console.warn('VoiceRecordSheet save failed:', error);
    }
  }

  function discard(): void {
    // If the user dismisses while a recording is in flight, give the recorder
    // a chance to tear down so the audio session is released cleanly.
    const rec = recordingRef.current;
    if (rec) {
      recordingRef.current = null;
      void rec.stopAndUnloadAsync().catch(() => {
        // Swallow — see the unmount cleanup above.
      });
    }
    setFinishedUri(null);
    setFinishedDuration(0);
    setElapsed(0);
    setRecording(false);
    onDismiss();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={discard}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>
            {t('journal.recordingTitle')}
          </Text>
          <Text style={[styles.timer, { color: theme.text }]}>
            {`${formatSeconds(elapsed)} / ${formatSeconds(MAX_SECONDS)}`}
          </Text>
          {elapsed >= WARN_AT && recording ? (
            <Text style={[styles.warn, { color: theme.red }]}>
              {t('journal.recordingCapWarning', {
                seconds: Math.max(0, MAX_SECONDS - elapsed),
              })}
            </Text>
          ) : null}
          {!recording && !finishedUri ? (
            <Pressable
              onPress={start}
              style={({ pressed }) => [
                styles.recBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <LinearGradient
                colors={[theme.red, theme.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.recLabel}>●</Text>
            </Pressable>
          ) : null}
          {recording ? (
            <Pressable
              onPress={stop}
              style={[styles.stopBtn, { borderColor: theme.red }]}
            >
              <Text style={[styles.stopLabel, { color: theme.red }]}>
                {t('journal.stopRecording')}
              </Text>
            </Pressable>
          ) : null}
          {finishedUri ? (
            <View style={styles.actions}>
              <Pressable
                onPress={discard}
                style={[styles.actionBtn, { borderColor: theme.border }]}
              >
                <Text style={[styles.actionLabel, { color: theme.text }]}>
                  {t('journal.discardRecording')}
                </Text>
              </Pressable>
              <Pressable
                onPress={save}
                style={[
                  styles.actionBtn,
                  { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
              >
                <Text style={[styles.actionLabel, { color: '#FFFFFF' }]}>
                  {t('journal.saveRecording')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function formatSeconds(s: number): string {
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  timer: { fontSize: 32, fontWeight: '800', marginVertical: 16 },
  warn: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  recBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginVertical: 16,
  },
  recLabel: { color: '#FFFFFF', fontSize: 36 },
  stopBtn: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 16,
    borderWidth: 2,
    marginVertical: 16,
  },
  stopLabel: { fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
  },
  actionLabel: { fontSize: 14, fontWeight: '700' },
});
