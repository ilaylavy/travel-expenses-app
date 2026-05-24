// Inline tap-to-edit chip for a journal day's location. Tap opens a text
// input; submitting (Enter or blur) commits the trimmed value, empty clears
// it. Long-press also clears, falling back to the auto-inferred location
// from expenses.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  value: string | null;
  isAuto: boolean;
  onChange: (next: string | null) => void;
}

export function LocationEditor({ value, onChange }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  const commit = (): void => {
    const trimmed = draft.trim();
    onChange(trimmed.length === 0 ? null : trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <View style={styles.row}>
        <TextInput
          autoFocus
          value={draft}
          onChangeText={setDraft}
          placeholder={t('journal.locationPlaceholder')}
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          onBlur={commit}
          onSubmitEditing={commit}
          returnKeyType="done"
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        setDraft(value ?? '');
        setEditing(true);
      }}
      onLongPress={() => onChange(null)}
      style={styles.row}
    >
      <Text style={[styles.chip, { color: theme.textMuted }]}>
        📍 {value ?? t('journal.locationPlaceholder')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  chip: { fontSize: 12, fontWeight: '500' },
  input: {
    flex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    fontSize: 14,
  },
});
