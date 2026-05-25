// Timeline row for one journal photo entry. New layout: [SpineNode] [body],
// no wrapping card. Drag is initiated by long-press on the SpineNode (its
// touch target is enlarged to be easy to grab without colliding with body
// taps). Body taps open photos / enter caption edit; body long-press opens
// the entry-level actions sheet.
//
// Lesson #6: long-press on a single photo is wired via onPhotoLongPress so
// the user can perform photo-specific actions (set this one as cover, remove
// just this photo) without it bubbling to the entry-level actions.

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SpineNode } from '@/components/journal/SpineNode';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { JournalPhotoEntryWithPhotos } from '@/types/journal';

import { PhotoGrid } from './PhotoGrid';

interface Props {
  entry: JournalPhotoEntryWithPhotos;
  loggedByName?: string | null;
  onCaptionChange: (next: string | null) => void;
  onOpenPhoto: (index: number) => void;
  onLongPress: () => void;
  onPhotoLongPress?: (index: number) => void;
  onDragStart?: () => void;
  isMember?: boolean;
  spineThickness?: 'thin' | 'thick';
  spineCapTop?: boolean;
  spineCapBottom?: boolean;
  // Selection mode (Phase 7+).
  selectable?: boolean;
  selected?: boolean;
  onSelectToggle?: () => void;
  // When true, the row mounts with a subtle fade + slide-up. Used by the
  // DayScreen after a fresh create so the new entry quietly arrives instead
  // of popping in.
  animateIn?: boolean;
}

export function PhotoEntryRow({
  entry,
  loggedByName,
  onCaptionChange,
  onOpenPhoto,
  onLongPress,
  onPhotoLongPress,
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.caption ?? '');

  // Keep the draft in sync if the entry's caption is mutated remotely
  // (e.g., realtime updates from a partner editing on another device).
  useEffect(() => {
    if (!editing) setDraft(entry.caption ?? '');
  }, [entry.caption, editing]);

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
        occurredAt={entry.occurredAt}
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
          // The body Pressable doesn't have an onPress — taps on its
          // children (the photo tiles, the caption text) handle themselves.
          // Long-press still bubbles to open the actions sheet.
          style={styles.bodyInner}
        >
          <PhotoGrid
            photos={entry.photos}
            onOpen={onOpenPhoto}
            onLongPress={onLongPress}
            onPhotoLongPress={onPhotoLongPress}
          />
          {editing ? (
            <TextInput
              autoFocus
              value={draft}
              onChangeText={setDraft}
              placeholder={t('journal.captionPlaceholder')}
              placeholderTextColor={theme.textMuted}
              maxLength={200}
              multiline
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
            <Pressable onPress={() => setEditing(true)} hitSlop={4}>
              <Text
                style={[
                  styles.caption,
                  {
                    color: entry.caption ? theme.text : theme.textMuted,
                    fontStyle: entry.caption ? 'normal' : 'italic',
                  },
                ]}
              >
                {entry.caption ?? t('journal.captionPlaceholder')}
              </Text>
            </Pressable>
          )}
        </Pressable>
        {selectable && onSelectToggle ? (
          // Lesson #13: selection-mode tap should toggle on ANY tap of the
          // row body. A transparent overlay is the cleanest way to do this
          // without rewiring every inner Pressable's onPress.
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onSelectToggle}
          />
        ) : null}
      </View>
    </Animated.View>
  );
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
  bodyInner: {
    gap: 8,
  },
  caption: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  captionInput: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    minHeight: 32,
  },
});
