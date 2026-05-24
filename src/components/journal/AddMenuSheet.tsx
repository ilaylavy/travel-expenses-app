// Bottom-anchored action sheet shown when the user taps the JournalFab. Three
// presentational rows: add photos (gallery), record a voice clip, jump to the
// expense entry screen. Behavior lives entirely in the parent; this component
// only renders the choices and notifies the parent on press.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onAddPhotos: () => void;
  onRecordVoice: () => void;
  onAddExpense: () => void;
}

export function AddMenuSheet({
  visible,
  onDismiss,
  onAddPhotos,
  onRecordVoice,
  onAddExpense,
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
        {/* Inner Pressable swallows taps so picking a row doesn't dismiss
            via the backdrop before the parent's onPress handler runs. */}
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Pressable style={styles.row} onPress={onAddPhotos}>
            <Text style={[styles.label, { color: theme.text }]}>
              {`📸  ${t('journal.addPhotos')}`}
            </Text>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Pressable style={styles.row} onPress={onRecordVoice}>
            <Text style={[styles.label, { color: theme.text }]}>
              {`🎤  ${t('journal.recordVoice')}`}
            </Text>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Pressable style={styles.row} onPress={onAddExpense}>
            <Text style={[styles.label, { color: theme.text }]}>
              {`📋  ${t('journal.addExpense')}`}
            </Text>
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
  label: { fontSize: 16, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth },
});
