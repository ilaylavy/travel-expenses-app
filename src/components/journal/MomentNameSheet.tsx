// Title + cover sheet shown after the user confirms a selection. The title
// is optional (empty → null → renders as "Untitled Moment"). The cover
// defaults to the first photo-entry member when the user has picked any
// photo members; otherwise no cover.
//
// V1 keeps the cover picker minimal — a tappable row that cycles through
// candidate photo entries. The richer grid picker comes in Phase 9.

import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  visible: boolean;
  defaultCoverEntryId: string | null;
  candidatePhotoEntryIds: string[];
  initialTitle?: string | null;
  onDismiss: () => void;
  onSave: (title: string | null, coverEntryId: string | null) => void;
}

export function MomentNameSheet({
  visible,
  defaultCoverEntryId,
  candidatePhotoEntryIds,
  initialTitle = null,
  onDismiss,
  onSave,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle ?? '');
  const [coverEntryId, setCoverEntryId] = useState<string | null>(
    defaultCoverEntryId,
  );

  // Re-seed when the sheet opens for a new selection.
  useEffect(() => {
    if (visible) {
      setTitle(initialTitle ?? '');
      setCoverEntryId(defaultCoverEntryId);
    }
  }, [visible, defaultCoverEntryId, initialTitle]);

  const commit = (): void => {
    const trimmed = title.trim();
    onSave(trimmed.length === 0 ? null : trimmed, coverEntryId);
  };

  // Cycle through candidate cover entries; null means "no cover".
  const cycleCover = (): void => {
    if (candidatePhotoEntryIds.length === 0) return;
    if (coverEntryId == null) {
      setCoverEntryId(candidatePhotoEntryIds[0] ?? null);
      return;
    }
    const idx = candidatePhotoEntryIds.indexOf(coverEntryId);
    if (idx < 0 || idx === candidatePhotoEntryIds.length - 1) {
      setCoverEntryId(null);
    } else {
      setCoverEntryId(candidatePhotoEntryIds[idx + 1] ?? null);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={styles.eyebrowRow}>
            <View style={[styles.glyphDisc, { backgroundColor: theme.accent }]}>
              <Text style={styles.glyph}>✦</Text>
            </View>
            <Text style={[styles.eyebrow, { color: theme.accent }]}>
              {t('journal.createMoment').toUpperCase()}
            </Text>
          </View>
          <TextInput
            autoFocus
            value={title}
            onChangeText={setTitle}
            placeholder={t('journal.momentNamePlaceholder')}
            placeholderTextColor={theme.textMuted}
            maxLength={60}
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.border },
            ]}
            returnKeyType="done"
            onSubmitEditing={commit}
          />
          {candidatePhotoEntryIds.length > 0 ? (
            <Pressable
              onPress={cycleCover}
              style={({ pressed }) => [
                styles.coverRow,
                { borderColor: theme.border, backgroundColor: theme.bgSoft },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.coverEmoji]}>📷</Text>
              <Text style={[styles.coverLabel, { color: theme.text }]}>
                {coverEntryId == null
                  ? t('journal.momentSetCover')
                  : t('journal.momentChangeCover')}
              </Text>
              <Text style={[styles.coverHint, { color: theme.textMuted }]}>
                {coverEntryId == null
                  ? '—'
                  : `${candidatePhotoEntryIds.indexOf(coverEntryId) + 1}/${candidatePhotoEntryIds.length}`}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              onPress={onDismiss}
              hitSlop={6}
              style={({ pressed }) => [
                styles.cancelBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={[styles.cancelTxt, { color: theme.textMuted }]}>
                {t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={commit}
              style={({ pressed }) => [
                styles.saveBtn,
                {
                  backgroundColor: theme.accent,
                  shadowColor: theme.accent,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.saveTxt}>{t('common.save')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    padding: 20,
    paddingBottom: 32,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  glyphDisc: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { color: '#fff', fontSize: 12, fontWeight: '900' },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  coverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  coverEmoji: { fontSize: 18 },
  coverLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  coverHint: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  cancelTxt: { fontSize: 14, fontWeight: '700' },
  saveBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  saveTxt: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
});
