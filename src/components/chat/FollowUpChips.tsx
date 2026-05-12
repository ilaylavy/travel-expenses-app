import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { borderWidth, sizing, spacing } from '@/constants/theme';
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
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: theme.accentSoft,
              borderColor: theme.accent,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
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
  container: { gap: spacing.md - 2, paddingHorizontal: spacing.xl, paddingVertical: spacing.md - 2 },
  chip: {
    paddingVertical: 8, // chip compact geometry
    paddingHorizontal: spacing.lg,
    borderRadius: sizing.radiusChip,
    borderWidth: borderWidth.hairline,
  },
  text: { fontSize: 12, fontWeight: '600' },
});
