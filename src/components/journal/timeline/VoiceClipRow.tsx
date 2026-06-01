// Timeline row for one voice clip. New layout: [SpineNode] [body], no
// wrapping card. The body is a rounded chip containing a play button + a
// decorative waveform bar + duration tag, with the transcript flowing below
// in body text up to 3 lines. Pending/failed states swap the transcript for
// the appropriate status copy.
//
// Drag lives on the SpineNode. Body taps drive playback / transcript open;
// body long-press opens the actions sheet.

import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SpineNode } from '@/components/journal/SpineNode';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useVoiceClipPlayback } from '@/hooks/useVoiceClipPlayback';
import type { VoiceClip } from '@/types/voice';

interface Props {
  clip: VoiceClip;
  loggedByName?: string | null;
  onOpenTranscript: () => void;
  onLongPress: () => void;
  onRetranscribe: () => void;
  onDragStart?: () => void;
  isMember?: boolean;
  spineThickness?: 'thin' | 'thick';
  spineCapTop?: boolean;
  spineCapBottom?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelectToggle?: () => void;
  animateIn?: boolean;
}

const WAVE_BARS = 28;

export function VoiceClipRow({
  clip,
  loggedByName,
  onOpenTranscript,
  onLongPress,
  onRetranscribe,
  onDragStart,
  isMember,
  spineThickness,
  spineCapTop,
  spineCapBottom,
  selectable,
  selected,
  onSelectToggle,
  animateIn,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { isPlaying, toggle } = useVoiceClipPlayback(clip);

  const isPending =
    clip.transcriptStatus === 'pending' || clip.transcriptStatus === 'processing';
  const isFailed = clip.transcriptStatus === 'failed';
  const transcript = isPending
    ? t('journal.transcribing')
    : isFailed
      ? t('journal.transcribeFailed')
      : (clip.transcript ?? '');

  const opacity = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(animateIn ? -8 : 0)).current;
  useEffect(() => {
    if (!animateIn) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start();
  }, [animateIn, opacity, translateY]);

  return (
    <Animated.View
      style={[styles.row, { opacity, transform: [{ translateY }] }]}
    >
      <SpineNode
        occurredAt={clip.occurredAt}
        loggedByName={loggedByName ?? undefined}
        variant={isMember ? 'member' : 'solo'}
        onDragStart={onDragStart}
        selectable={selectable}
        selected={selected}
        spineThickness={spineThickness}
        spineCapTop={spineCapTop}
        spineCapBottom={spineCapBottom}
      />
      <View style={styles.body}>
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={420}
          style={styles.bodyInner}
        >
          <View
            style={[
              styles.chip,
              {
                backgroundColor: theme.accentSoft,
                borderColor: theme.accent,
              },
            ]}
          >
            <Pressable
              onPress={() => {
                void toggle();
              }}
              hitSlop={8}
              style={[styles.playBtn, { backgroundColor: theme.accent }]}
            >
              <Text style={styles.playGlyph}>{isPlaying ? '⏸' : '▶'}</Text>
            </Pressable>
            <View style={styles.wave}>
              {Array.from({ length: WAVE_BARS }).map((_, i) => {
                // Two overlaid sine waves at different frequencies — looks
                // a bit more organic than a single wave without needing real
                // amplitude data.
                const h = 4 + Math.abs(Math.sin(i * 0.55) * 8 + Math.cos(i * 0.3) * 4);
                return (
                  <View
                    key={i}
                    style={[
                      styles.waveBar,
                      {
                        backgroundColor: theme.accent,
                        height: h,
                        opacity: isPlaying ? 0.95 : 0.55,
                      },
                    ]}
                  />
                );
              })}
            </View>
            <Text style={[styles.duration, { color: theme.accent }]}>
              {formatDuration(clip.durationSec)}
            </Text>
          </View>
          {transcript.length > 0 || isPending || isFailed ? (
            <Pressable
              onPress={isFailed ? onRetranscribe : onOpenTranscript}
              style={styles.transcriptWrap}
            >
              {isPending ? (
                <View style={styles.pendingRow}>
                  <ActivityIndicator size="small" color={theme.textMuted} />
                  <Text style={[styles.transcript, { color: theme.textMuted }]}>
                    {transcript}
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
                  {transcript}
                </Text>
              )}
            </Pressable>
          ) : null}
        </Pressable>
        {selectable && onSelectToggle ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onSelectToggle}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 18,
  },
  body: {
    flex: 1,
    paddingTop: 4,
    position: 'relative',
  },
  bodyInner: { gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: { color: '#fff', fontSize: 13, fontWeight: '800' },
  wave: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 22,
  },
  waveBar: {
    width: 2,
    borderRadius: 1,
  },
  duration: {
    fontSize: 11,
    fontWeight: '800',
    minWidth: 32,
    textAlign: 'right',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  transcriptWrap: {},
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  transcript: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});
