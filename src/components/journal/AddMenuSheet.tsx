// Bottom-anchored action sheet shown when the user taps the JournalFab.
// Four rows: Add photos, Record voice, Add expense, Create Moment.
// Create Moment is disabled (with a helper line) when the day has no
// entries yet — selection mode needs at least one row to pick.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onAddPhotos: () => void;
  onRecordVoice: () => void;
  onAddExpense: () => void;
  onCreateMoment: () => void;
  momentEnabled: boolean;
}

export function AddMenuSheet({
  visible,
  onDismiss,
  onAddPhotos,
  onRecordVoice,
  onAddExpense,
  onCreateMoment,
  momentEnabled,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Pressable style={styles.row} onPress={onAddPhotos}>
            <Text style={[styles.label, { color: theme.text }]}>
              📸  {t('journal.addPhotos')}
            </Text>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Pressable style={styles.row} onPress={onRecordVoice}>
            <Text style={[styles.label, { color: theme.text }]}>
              🎤  {t('journal.recordVoice')}
            </Text>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Pressable style={styles.row} onPress={onAddExpense}>
            <Text style={[styles.label, { color: theme.text }]}>
              💳  {t('journal.addExpense')}
            </Text>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Pressable
            style={[styles.row, !momentEnabled && { opacity: 0.5 }]}
            disabled={!momentEnabled}
            onPress={onCreateMoment}
          >
            <Text style={[styles.label, { color: theme.accent }]}>
              ✦  {t('journal.createMoment')}
            </Text>
            {!momentEnabled ? (
              <Text style={[styles.help, { color: theme.textMuted }]}>
                {t('journal.createMomentDisabled')}
              </Text>
            ) : null}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 90,
    overflow: 'hidden',
  },
  row: { paddingVertical: 16, paddingHorizontal: 18 },
  label: { fontSize: 16, fontWeight: '700' },
  help: { fontSize: 11, fontWeight: '500', marginTop: 4 },
  divider: { height: StyleSheet.hairlineWidth },
});
