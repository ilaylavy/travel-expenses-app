// Bottom-sheet voice recorder. expo-audio's recording API is hook-only
// (no imperative constructor), and the polling done by `useAudioRecorderState`
// will keep talking to a SharedObject that may have been released — so we
// lazy-mount the recorder body only while the sheet is actually visible.
// That keeps the recorder's lifetime tied to the modal session and lets the
// hook's own cleanup release the native object cleanly on close.
//
// State machine inside the body: idle → recording → finished → (saved|discarded).
// The `finishedUri` field gates the save/discard pair, so save() can only run
// on a successfully stopped recording.

import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import type { RecordingOptions } from 'expo-audio';

import * as voiceClips from '@/db/queries/voiceClips';
import {
  persistVoiceClipFile,
  requestMicPermission,
} from '@/services/voiceClipService';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import { newId } from '@/utils/id';

const MAX_SECONDS = 300;
const WARN_AT = MAX_SECONDS - 30;

// Mono / 64kbps voice settings — derived from HIGH_QUALITY (m4a, AAC, 44.1kHz)
// with channel + bitrate overrides so transcripts upload quickly without losing
// intelligibility. Stays in .m4a so the r2-media-url voice-clip validator
// accepts the path.
const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
};

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
  dayDate,
  onDismiss,
  onSaved,
}: Props) {
  const theme = useTheme();
  // Keep the outer modal shell so the slide animation works, but only render
  // the recorder body (and thus only call the expo-audio hooks) while the
  // sheet is open. This avoids polling a released SharedObject when the
  // sheet is dismissed.
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          {visible ? (
            <RecorderBody
              tripId={tripId}
              dayDate={dayDate}
              onDismiss={onDismiss}
              onSaved={onSaved}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

interface BodyProps {
  tripId: string;
  dayDate: string;
  onDismiss: () => void;
  onSaved: () => void;
}

function RecorderBody({
  tripId,
  // dayDate is reserved for future use — recordings are stamped with
  // `new Date().toISOString()` at save time. Keep it in the props so the
  // public surface matches the rest of the journal capture flow.
  dayDate: _dayDate,
  onDismiss,
  onSaved,
}: BodyProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 250);
  const elapsed = Math.floor((recorderState.durationMillis ?? 0) / 1000);
  const recording = recorderState.isRecording;

  const [finishedUri, setFinishedUri] = useState<string | null>(null);
  const [finishedDuration, setFinishedDuration] = useState(0);

  const stop = useCallback(async (): Promise<void> => {
    if (!recorder.isRecording) return;
    try {
      await recorder.stop();
      const tempUri = recorder.uri;
      if (!tempUri) {
        console.warn('VoiceRecordSheet stop: recorder produced no URI');
        return;
      }
      const clipId = newId();
      const targetUri = await persistVoiceClipFile(tempUri, clipId);
      const durationSec = Math.max(
        1,
        Math.round((recorderState.durationMillis ?? 0) / 1000),
      );
      setFinishedUri(targetUri);
      setFinishedDuration(durationSec);
      // Tear the iOS recording session down only after we've safely read uri.
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    } catch (error) {
      console.warn('VoiceRecordSheet stop failed:', error);
    }
  }, [recorder, recorderState.durationMillis]);

  // Force-stop at the cap. The recorderState ticks every 250ms so we don't
  // need our own interval — just react when it crosses the threshold.
  useEffect(() => {
    if (!recording) return;
    if (elapsed >= MAX_SECONDS) void stop();
  }, [recording, elapsed, stop]);

  async function start(): Promise<void> {
    const granted = await requestMicPermission();
    if (!granted) return;
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
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
    // Stopping a still-running recorder before unmount lets iOS release the
    // audio session cleanly. The hook's own cleanup will release the
    // SharedObject on the next render cycle.
    if (recorder.isRecording) {
      void recorder.stop().catch(() => undefined);
    }
    setFinishedUri(null);
    setFinishedDuration(0);
    onDismiss();
  }

  return (
    <>
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
    </>
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
