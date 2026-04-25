import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface FollowUpChipsProps {
  chips: string[];
  onPress: (text: string) => void;
}

export function FollowUpChips({ chips, onPress }: FollowUpChipsProps) {
  const theme = useTheme();
  if (chips.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {chips.map((chip, idx) => (
        <Pressable
          key={`${idx}-${chip}`}
          onPress={() => onPress(chip)}
          style={[
            styles.chip,
            { backgroundColor: theme.accentSoft, borderColor: theme.accent },
          ]}
          hitSlop={4}
        >
          <Text style={[styles.text, { color: theme.accent }]}>{chip}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, paddingHorizontal: 18, paddingVertical: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
  },
  text: { fontSize: 12, fontWeight: '600' },
});
