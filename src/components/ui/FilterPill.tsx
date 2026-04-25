import { Pressable, StyleSheet, Text } from 'react-native';

import { sizing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

interface FilterPillProps {
  label: string;
  summary: string;
  active: boolean;
  onPress: () => void;
}

export function FilterPill({ label, summary, active, onPress }: FilterPillProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: active ? theme.accentSoft : theme.surface,
          borderColor: active ? theme.accent : theme.border,
        },
      ]}
    >
      <Text
        style={[
          styles.pillText,
          { color: active ? theme.accent : theme.textSecondary },
        ]}
        numberOfLines={1}
      >
        {label}: {summary} ▾
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: sizing.radiusChip,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '600', maxWidth: 200 },
});
