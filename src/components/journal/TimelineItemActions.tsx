// Long-press action sheet for a timeline row. Surfaces the four mutations
// available on a given row: edit timestamp (all kinds), set as cover
// (photo entries only), re-transcribe (voice clips only), and delete
// (destructive — uses the per-kind copy from journal.deletePhotoEntry /
// deleteVoiceClip / deleteExpense for clarity).
//
// Renders as a tap-to-dismiss bottom sheet via React Native's Modal so we
// don't pull in another nav surface. The parent owns the `item` state —
// pass `null` to dismiss.

import { Modal, Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { ThemeColors } from '@/constants/theme';
import type { TimelineItem } from '@/utils/journalTimeline';

interface Props {
  item: TimelineItem | null;
  onDismiss: () => void;
  onEditTimestamp: () => void;
  onSetCover: () => void;
  onRetranscribe: () => void;
  onDelete: () => void;
}

export function TimelineItemActions({
  item,
  onDismiss,
  onEditTimestamp,
  onSetCover,
  onRetranscribe,
  onDelete,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  if (!item) return null;

  const showSetCover = item.kind === 'photo';
  const showRetranscribe = item.kind === 'voice';

  const deleteLabel =
    item.kind === 'photo'
      ? t('journal.deletePhotoEntry')
      : item.kind === 'voice'
        ? t('journal.deleteVoiceClip')
        : t('journal.deleteExpense');

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDismiss}>
      <Pressable onPress={onDismiss} style={styles.backdrop}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Row
            label={`🕒 ${t('journal.editTime')}`}
            onPress={onEditTimestamp}
            theme={theme}
          />
          {showSetCover ? (
            <Row
              label={`⭐ ${t('journal.setAsCover')}`}
              onPress={onSetCover}
              theme={theme}
            />
          ) : null}
          {showRetranscribe ? (
            <Row
              label={`🔁 ${t('journal.retranscribe')}`}
              onPress={onRetranscribe}
              theme={theme}
            />
          ) : null}
          <Row label={`🗑 ${deleteLabel}`} destructive onPress={onDelete} theme={theme} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  label,
  onPress,
  destructive,
  theme,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  theme: ThemeColors;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Text
        style={{
          fontSize: 15,
          fontWeight: '600',
          color: destructive ? theme.red : theme.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 80,
    paddingVertical: 8,
  },
  row: { paddingVertical: 14, paddingHorizontal: 18 },
});
