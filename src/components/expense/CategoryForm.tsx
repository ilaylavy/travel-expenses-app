import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { CATEGORY_COLOR_TOKENS, getCategoryColor, type CategoryColorToken } from '@/utils/categoryColor';

const CATEGORY_EMOJI_OPTIONS = [
  '🍽️', '🥗', '🍔', '🍕', '☕', '🍺', '🍰',
  '🚗', '🚕', '🚌', '🚆', '✈️', '⛵',
  '🏨', '🏕️', '🎒', '🎫', '🎢', '🎨',
  '🛍️', '👟', '💄', '🎁', '📱', '💊',
  '⛽', '🧺', '📦', '💡', '💵',
];

export interface CategoryFormValues {
  name: string;
  emoji: string;
  color: CategoryColorToken;
}

interface CategoryFormProps {
  initial?: Partial<CategoryFormValues>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: CategoryFormValues) => Promise<void>;
  footer?: React.ReactNode;
}

export function CategoryForm({
  initial,
  submitLabel,
  submittingLabel,
  onSubmit,
  footer,
}: CategoryFormProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? CATEGORY_EMOJI_OPTIONS[0]);
  const [color, setColor] = useState<CategoryColorToken>(initial?.color ?? 'accent');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) return setError(t('categoryForm.errors.nameRequired'));
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), emoji, color });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('categoryForm.errors.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{t('categoryForm.name')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('categoryForm.namePlaceholder')}
          placeholderTextColor={theme.textMuted}
          style={[
            styles.input,
            { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
          ]}
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{t('categoryForm.emoji')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {CATEGORY_EMOJI_OPTIONS.map((e) => {
            const selected = e === emoji;
            return (
              <Pressable
                key={e}
                onPress={() => setEmoji(e)}
                style={[
                  styles.emojiChip,
                  {
                    backgroundColor: selected ? theme.accentSoft : theme.surface,
                    borderColor: selected ? theme.accent : theme.border,
                  },
                ]}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{t('categoryForm.color')}</Text>
        <View style={styles.row}>
          {CATEGORY_COLOR_TOKENS.map((token) => {
            const selected = token === color;
            const resolved = getCategoryColor(token, theme);
            return (
              <Pressable
                key={token}
                onPress={() => setColor(token)}
                style={[
                  styles.colorDot,
                  {
                    backgroundColor: resolved,
                    borderColor: selected ? theme.text : 'transparent',
                  },
                ]}
              />
            );
          })}
        </View>
      </View>

      {error && <Text style={[styles.error, { color: theme.red }]}>{error}</Text>}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        style={({ pressed }) => [
          styles.submit,
          { backgroundColor: theme.accent, opacity: submitting || pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={styles.submitText}>{submitting ? submittingLabel : submitLabel}</Text>
      </Pressable>

      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, paddingBottom: spacing.xxl * 2, gap: spacing.base },
  field: { gap: spacing.sm },
  label: typography.subtitle,
  input: {
    borderRadius: sizing.radiusInput,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: 4 },
  emojiChip: {
    width: 48,
    height: 48,
    borderRadius: sizing.radiusButton,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 22 },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
  error: { ...typography.caption, marginTop: -spacing.xs },
  submit: {
    borderRadius: sizing.radiusButton,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
});
