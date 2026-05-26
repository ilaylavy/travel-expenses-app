import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import type { RecentNoteSuggestion } from '@/db/queries/expenseAnalytics';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

export function NoteSuggestionsRow({
  notes,
  onPick,
}: {
  notes: RecentNoteSuggestion[];
  onPick: (s: RecentNoteSuggestion) => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (notes.length === 0) return null;

  return (
    <View>
      <Text style={[styles.microLabel, { color: theme.textMuted }]}>
        {t('expense.recentNotes')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {notes.map((s) => (
          <Pressable
            key={s.note}
            onPress={() => onPick(s)}
            style={({ pressed }) => [
              styles.noteChip,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
          >
            <Text
              style={[styles.noteChipText, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {s.categoryEmoji} {s.note}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  microLabel: {
    ...typography.micro,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  noteChip: {
    paddingHorizontal: spacing.md + 2, // 14 — chip compact geometry
    paddingVertical: 7,
    borderRadius: sizing.radiusPill,
    borderWidth: borderWidth.hairline,
    maxWidth: 220,
  },
  noteChipText: { fontSize: 13, fontWeight: '500' },
});
