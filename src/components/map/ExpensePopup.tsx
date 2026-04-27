import { Pressable, StyleSheet, Text, View } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Category } from '@/types/category';
import type { ExpenseWithPhotos } from '@/types/expense';
import { getCategoryColor, getCategorySoftColor } from '@/utils/categoryColor';
import { getCategoryDisplayName } from '@/utils/categoryName';
import { formatAmount } from '@/utils/currency';

interface ExpensePopupProps {
  expense: ExpenseWithPhotos;
  category: Category | null;
  homeCurrency: string;
  onPress: () => void;
  onClose: () => void;
}

export function ExpensePopup({
  expense,
  category,
  homeCurrency,
  onPress,
  onClose,
}: ExpensePopupProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const color = category ? getCategoryColor(category.color, theme) : theme.accent;
  const soft = category ? getCategorySoftColor(category.color, theme) : theme.accentSoft;
  const showConverted = expense.currency !== homeCurrency;
  const primary = formatAmount(expense.amount, expense.currency);
  const secondary = showConverted
    ? formatAmount(expense.convertedAmount, homeCurrency)
    : null;
  const categoryName = category ? getCategoryDisplayName(category, t) : null;
  const title = expense.note?.trim() || categoryName || '—';
  const metaParts = [categoryName, expense.expenseDate].filter(Boolean);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.borderLight,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: soft, borderColor: color }]}>
        <Text style={styles.emoji}>{category?.emoji ?? '•'}</Text>
      </View>
      <View style={styles.middle}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        {metaParts.length > 0 ? (
          <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
            {metaParts.join(' · ')}
          </Text>
        ) : null}
        {expense.placeName ? (
          <Text style={[styles.place, { color: theme.textMuted }]} numberOfLines={1}>
            📍 {expense.placeName}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text
          style={[
            styles.amount,
            { color: expense.isRefund ? theme.green : theme.text },
          ]}
          numberOfLines={1}
        >
          {expense.isRefund ? '+' : ''}
          {primary}
        </Text>
        {secondary ? (
          <Text style={[styles.secondary, { color: theme.textMuted }]} numberOfLines={1}>
            ≈ {secondary}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onClose}
        hitSlop={10}
        style={[styles.close, { backgroundColor: theme.bgSoft }]}
      >
        <Text style={[styles.closeText, { color: theme.textMuted }]}>✕</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: sizing.radiusCard,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  icon: {
    width: sizing.categoryIconMedium,
    height: sizing.categoryIconMedium,
    borderRadius: sizing.radiusIcon,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 20 },
  middle: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.itemTitle },
  meta: { ...typography.secondary },
  place: { ...typography.caption },
  right: { alignItems: 'flex-end', gap: 2 },
  amount: { ...typography.amountSmall },
  secondary: { ...typography.caption },
  close: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 12, fontWeight: '700' },
});
