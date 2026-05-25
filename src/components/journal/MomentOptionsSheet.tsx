// Bottom sheet shown when tapping a Moment's header pill. Surfaces all the
// edit operations: inline title input, Change cover, Add entries, Split,
// Delete. Title commits on blur (the only inline action — everything else
// branches out to a dedicated sheet/mode handled by the parent).

import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { JournalMoment } from '@/types/journal';

interface Props {
  moment: JournalMoment | null;
  onDismiss: () => void;
  onRename: (title: string | null) => void;
  onChangeCover: () => void;
  onAddEntries: () => void;
  onSplit: () => void;
  onDelete: () => void;
}

export function MomentOptionsSheet(props: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [title, setTitle] = useState(props.moment?.title ?? '');

  // Re-seed when a different moment opens.
  useEffect(() => {
    setTitle(props.moment?.title ?? '');
  }, [props.moment?.id, props.moment?.title]);

  if (!props.moment) return null;
  const m = props.moment;

  const commitRename = (): void => {
    const trimmed = title.trim();
    const next = trimmed.length === 0 ? null : trimmed;
    if (next !== m.title) props.onRename(next);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={props.onDismiss}>
      <Pressable style={styles.backdrop} onPress={props.onDismiss}>
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
              MOMENT
            </Text>
          </View>
          <TextInput
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
            onBlur={commitRename}
            onSubmitEditing={commitRename}
          />
          <View style={styles.section}>
            <Row
              label={t('journal.momentChangeCover')}
              glyph="🖼"
              onPress={props.onChangeCover}
            />
            <Row
              label={t('journal.momentAddEntries')}
              glyph="➕"
              onPress={props.onAddEntries}
            />
            <Row label={t('journal.momentSplit')} glyph="✂️" onPress={props.onSplit} />
          </View>
          <Pressable
            onPress={() => {
              Alert.alert(
                t('journal.momentDelete'),
                t('journal.momentDeleteConfirm'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('journal.momentDelete'),
                    style: 'destructive',
                    onPress: props.onDelete,
                  },
                ],
              );
            }}
            style={({ pressed }) => [
              styles.deleteRow,
              { borderColor: theme.red, backgroundColor: theme.redSoft },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.deleteTxt, { color: theme.red }]}>
              🗑  {t('journal.momentDelete')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  label,
  glyph,
  onPress,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: theme.border, backgroundColor: theme.bgSoft },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={styles.rowGlyph}>{glyph}</Text>
      <Text style={[styles.rowTxt, { color: theme.text }]}>{label}</Text>
    </Pressable>
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
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  section: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowGlyph: { fontSize: 16 },
  rowTxt: { fontSize: 14, fontWeight: '700', flex: 1 },
  deleteRow: {
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  deleteTxt: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
});
