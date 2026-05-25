// Long-press action sheet for a timeline row. Surfaces the mutations
// available on a given row: edit timestamp (all kinds), set as cover
// (photo entries only), re-transcribe (voice clips only), Remove from
// Moment (members only), and delete (destructive).

import { Modal, Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { ThemeColors } from '@/constants/theme';
import type { TimelineItem } from '@/utils/journalTimeline';

interface Props {
  item: TimelineItem | null;
  isMember?: boolean;
  onDismiss: () => void;
  onEditTimestamp: () => void;
  onSetCover: () => void;
  onRetranscribe: () => void;
  onRemoveFromMoment?: () => void;
  onDelete: () => void;
}

export function TimelineItemActions({
  item,
  isMember,
  onDismiss,
  onEditTimestamp,
  onSetCover,
  onRetranscribe,
  onRemoveFromMoment,
  onDelete,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  if (!item) return null;

  const showSetCover = item.kind === 'photo';
  const showRetranscribe = item.kind === 'voice';
  const showRemoveFromMoment = isMember === true && onRemoveFromMoment != null;

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
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Row
            label={`🕒  ${t('journal.editTime')}`}
            onPress={onEditTimestamp}
            theme={theme}
          />
          {showSetCover ? (
            <Row
              label={`⭐  ${t('journal.setAsCover')}`}
              onPress={onSetCover}
              theme={theme}
            />
          ) : null}
          {showRetranscribe ? (
            <Row
              label={`🔁  ${t('journal.retranscribe')}`}
              onPress={onRetranscribe}
              theme={theme}
            />
          ) : null}
          {showRemoveFromMoment ? (
            <Row
              label={`✦  ${t('journal.momentMemberRemove')}`}
              onPress={onRemoveFromMoment!}
              theme={theme}
            />
          ) : null}
          <Row label={`🗑  ${deleteLabel}`} destructive onPress={onDelete} theme={theme} />
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
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.bgSoft },
      ]}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: '700',
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
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 80,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  row: { paddingVertical: 14, paddingHorizontal: 18 },
});
