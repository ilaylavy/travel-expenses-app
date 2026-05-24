// Timeline row for one voice clip. Gutter + play button with a
// transcript preview limited to three lines. Tap the transcript area to
// open the full transcript (Phase 3); on a failed transcription the same
// tap triggers a re-transcribe. Long-press opens the delete confirm
// (Phase 3).

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useVoiceClipPlayback } from '@/hooks/useVoiceClipPlayback';
import type { VoiceClip } from '@/types/voice';

import { TimestampGutter } from './TimestampGutter';

interface Props {
  clip: VoiceClip;
  onOpenTranscript: () => void;
  onLongPress: () => void;
  onRetranscribe: () => void;
}

export function VoiceClipRow({
  clip,
  onOpenTranscript,
  onLongPress,
  onRetranscribe,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { isPlaying, toggle } = useVoiceClipPlayback(clip);

  const isPending =
    clip.transcriptStatus === 'pending' || clip.transcriptStatus === 'processing';
  const isFailed = clip.transcriptStatus === 'failed';

  const transcriptText = isPending
    ? t('journal.transcribing')
    : isFailed
      ? t('journal.transcribeFailed')
      : (clip.transcript ?? '');

  return (
    <Pressable
      onLongPress={onLongPress}
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <TimestampGutter occurredAt={clip.occurredAt} />
      <View style={styles.body}>
        <Text style={[styles.type, { color: theme.textMuted }]}>
          🎤 {t('journal.voiceLength', { seconds: clip.durationSec })}
        </Text>
        <View style={[styles.player, { backgroundColor: theme.accentSoft }]}>
          <Pressable
            onPress={() => {
              void toggle();
            }}
            hitSlop={8}
            style={[styles.playBtn, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.playBtnText}>{isPlaying ? '⏸' : '▶'}</Text>
          </Pressable>
          <View style={[styles.waves, { backgroundColor: theme.accentSoft }]} />
        </View>
        <Pressable
          onPress={isFailed ? onRetranscribe : onOpenTranscript}
          style={styles.transcriptWrap}
        >
          {isPending ? (
            <View style={styles.pendingRow}>
              <ActivityIndicator size="small" color={theme.textMuted} />
              <Text style={[styles.transcript, { color: theme.textMuted }]}>
                {transcriptText}
              </Text>
            </View>
          ) : (
            <Text
              numberOfLines={3}
              style={[
                styles.transcript,
                { color: isFailed ? theme.red : theme.text },
              ]}
            >
              {transcriptText}
            </Text>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  body: { flex: 1 },
  type: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 12,
  },
  playBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnText: { color: '#fff', fontSize: 12 },
  waves: { flex: 1, height: 18, borderRadius: 4, opacity: 0.6 },
  transcriptWrap: { marginTop: 6 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  transcript: { fontSize: 11 },
});
