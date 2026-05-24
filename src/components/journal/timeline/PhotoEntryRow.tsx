// Timeline row for one journal photo entry. Combines TimestampGutter on
// the inline-start, a PhotoGrid for the photos themselves, and an
// inline-editable caption underneath. Tap the caption text to edit;
// blur commits (empty → null clears). Long-press opens the delete
// confirm (wired in Phase 3).

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { JournalPhotoEntryWithPhotos } from '@/types/journal';

import { PhotoGrid } from './PhotoGrid';
import { TimestampGutter } from './TimestampGutter';

interface Props {
  entry: JournalPhotoEntryWithPhotos;
  onCaptionChange: (next: string | null) => void;
  onOpenPhoto: (index: number) => void;
  onLongPress: () => void;
}

export function PhotoEntryRow({ entry, onCaptionChange, onOpenPhoto, onLongPress }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.caption ?? '');

  const photoCountLabel =
    entry.photos.length === 1
      ? t('journal.photoCount_one', { count: 1 })
      : t('journal.photoCount_other', { count: entry.photos.length });

  return (
    <Pressable
      onLongPress={onLongPress}
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <TimestampGutter occurredAt={entry.occurredAt} />
      <View style={styles.body}>
        <Text style={[styles.type, { color: theme.textMuted }]}>
          📸 {photoCountLabel}
        </Text>
        <PhotoGrid photos={entry.photos} onOpen={onOpenPhoto} />
        {editing ? (
          <TextInput
            autoFocus
            value={draft}
            onChangeText={setDraft}
            placeholder={t('journal.captionPlaceholder')}
            placeholderTextColor={theme.textMuted}
            maxLength={200}
            style={[
              styles.captionInput,
              { color: theme.text, borderColor: theme.border },
            ]}
            onBlur={() => {
              const trimmed = draft.trim();
              onCaptionChange(trimmed.length === 0 ? null : trimmed);
              setEditing(false);
            }}
          />
        ) : (
          <Pressable onPress={() => setEditing(true)}>
            <Text
              style={[
                styles.caption,
                { color: theme.text, opacity: entry.caption ? 1 : 0.5 },
              ]}
            >
              {entry.caption ?? t('journal.captionPlaceholder')}
            </Text>
          </Pressable>
        )}
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
  caption: { marginTop: 6, fontSize: 11 },
  captionInput: {
    marginTop: 6,
    fontSize: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
  },
});
