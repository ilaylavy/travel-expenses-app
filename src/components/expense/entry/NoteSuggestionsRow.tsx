import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
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
            style={[
              styles.noteChip,
              { backgroundColor: theme.surface, borderColor: theme.border },
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
  microLabel: { ...typography.micro, marginTop: spacing.xs, marginBottom: spacing.xs },
  chipRow: { gap: spacing.sm, paddingVertical: 4 },
  noteChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: sizing.radiusChip,
    borderWidth: 1,
    maxWidth: 220,
  },
  noteChipText: { fontSize: 13, fontWeight: '500' },
});
