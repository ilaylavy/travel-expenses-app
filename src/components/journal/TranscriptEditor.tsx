// Full-screen modal for editing a voice clip's transcript. Header has
// Cancel/Save; below it a pinned audio player (using the same playback
// hook as the timeline row) so the user can scrub the recording while
// they clean up the auto-transcription; below that a multiline TextInput.
//
// Hook ordering: useVoiceClipPlayback is conditional on a non-null clip.
// We wrap the player+input in a child component (TranscriptEditorContent)
// that only mounts when clip is set — that way the hook isn't called
// with a placeholder, and order stays consistent across renders.

import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useVoiceClipPlayback } from '@/hooks/useVoiceClipPlayback';
import type { VoiceClip } from '@/types/voice';

interface Props {
  clip: VoiceClip | null;
  onSave: (transcript: string) => void;
  onDismiss: () => void;
}

export function TranscriptEditor({ clip, onSave, onDismiss }: Props) {
  if (!clip) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onDismiss}>
      <TranscriptEditorContent clip={clip} onSave={onSave} onDismiss={onDismiss} />
    </Modal>
  );
}

function TranscriptEditorContent({
  clip,
  onSave,
  onDismiss,
}: {
  clip: VoiceClip;
  onSave: (transcript: string) => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string>(clip.transcript ?? '');
  const { isPlaying, toggle } = useVoiceClipPlayback(clip);

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.bg }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.header}>
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Text style={{ color: theme.textMuted, fontSize: 16 }}>
            {t('common.cancel')}
          </Text>
        </Pressable>
        <Pressable onPress={() => onSave(draft.trim())} hitSlop={8}>
          <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '700' }}>
            {t('common.save')}
          </Text>
        </Pressable>
      </View>
      <View
        style={[
          styles.player,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Pressable
          onPress={() => {
            void toggle();
          }}
          hitSlop={8}
          style={[styles.playBtn, { backgroundColor: theme.accent }]}
        >
          <Text style={styles.playBtnText}>{isPlaying ? '⏸' : '▶'}</Text>
        </Pressable>
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>
          {t('journal.voiceLength', { seconds: clip.durationSec })}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholder={t('journal.captionPlaceholder')}
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { color: theme.text }]}
          autoFocus
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnText: { color: '#fff', fontSize: 14 },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  input: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 200,
    textAlignVertical: 'top',
  },
});
