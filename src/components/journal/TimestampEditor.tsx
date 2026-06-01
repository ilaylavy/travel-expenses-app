// Time-only picker for editing a timeline row's occurredAt. We keep the
// date portion of the original ISO untouched (rows can't migrate days
// from here — that's a different flow) and only let the user adjust
// hours/minutes. Saving emits a fresh ISO string back to the parent.
//
// Uses @react-native-community/datetimepicker — Android renders a native
// dialog inline (no extra Save button needed; the dialog itself returns
// the value), iOS renders a spinner that we wrap with our own Save CTA.

import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  initialISO: string | null;
  onSave: (iso: string) => void;
  onDismiss: () => void;
}

export function TimestampEditor({ initialISO, onSave, onDismiss }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Date | null>(
    initialISO ? new Date(initialISO) : null,
  );
  if (!initialISO || !draft) return null;
  const initial = new Date(initialISO);

  const handleChange = (_: DateTimePickerEvent, date?: Date): void => {
    if (Platform.OS === 'android') {
      // Android dialog returns immediately on confirm/dismiss. event.type
      // is 'set' when the user confirmed, 'dismissed' otherwise. The
      // picker auto-dismisses; we either save or close.
      if (_.type === 'set' && date) {
        const next = new Date(initial);
        next.setHours(date.getHours(), date.getMinutes(), 0, 0);
        onSave(next.toISOString());
      } else {
        onDismiss();
      }
      return;
    }
    // iOS spinner: track changes locally, commit on Save tap.
    if (date) setDraft(date);
  };

  const handleSave = (): void => {
    const next = new Date(initial);
    next.setHours(draft.getHours(), draft.getMinutes(), 0, 0);
    onSave(next.toISOString());
  };

  // Android: render the picker directly without a modal — it manages its
  // own dialog surface and dismissing the modal first leaves a stale
  // backdrop behind.
  if (Platform.OS === 'android') {
    return (
      <DateTimePicker
        value={initial}
        mode="time"
        display="default"
        onChange={handleChange}
      />
    );
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDismiss}>
      <Pressable onPress={onDismiss} style={styles.backdrop}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <DateTimePicker
            value={draft}
            mode="time"
            display="spinner"
            onChange={handleChange}
          />
          <Pressable
            onPress={handleSave}
            style={[styles.btn, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.btnText}>{t('common.save')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    alignItems: 'center',
  },
  btn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 12,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
