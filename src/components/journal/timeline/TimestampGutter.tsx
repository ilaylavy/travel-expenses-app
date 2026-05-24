// Shared HH:MM gutter on the inline-start of every timeline row. Tiny
// muted label so all three row types (photo / voice / expense) align on a
// single vertical edge regardless of payload size. `flexDirection: row`
// at the row level mirrors automatically in RTL.

import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export function TimestampGutter({ occurredAt }: { occurredAt: string }) {
  const theme = useTheme();
  const d = new Date(occurredAt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return (
    <View style={styles.gutter}>
      <Text style={[styles.text, { color: theme.textMuted }]}>
        {hh}:{mm}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gutter: { minWidth: 38, paddingTop: 2 },
  text: { fontSize: 10 },
});
