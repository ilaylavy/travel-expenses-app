import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryIcon } from '@/components/CategoryIcon';
import { Icon } from '@/components/Icon';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Category } from '@/types/category';
import type { ExpenseWithPhotos } from '@/types/expense';
import { getCategoryDisplayName } from '@/utils/category';
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
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      {category ? (
        <CategoryIcon category={category} size={sizing.categoryIconMedium} radius={sizing.radiusIcon} />
      ) : (
        <View style={[styles.iconFallback, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
          <Icon name="other" size={18} color={theme.accent} stroke={1.8} />
        </View>
      )}
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
          <View style={styles.placeRow}>
            <Icon name="map-pin" size={10} color={theme.textMuted} stroke={1.8} />
            <Text style={[styles.place, { color: theme.textMuted }]} numberOfLines={1}>
              {expense.placeName}
            </Text>
          </View>
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
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={({ pressed }) => [
          styles.close,
          {
            backgroundColor: theme.bgSoft,
            transform: [{ scale: pressed ? 0.9 : 1 }],
          },
        ]}
      >
        <Icon name="x" size={12} color={theme.textMuted} stroke={2.2} />
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
    borderWidth: borderWidth.hairline,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  iconFallback: {
    width: sizing.categoryIconMedium,
    height: sizing.categoryIconMedium,
    borderRadius: sizing.radiusIcon,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.itemTitle },
  meta: { ...typography.secondary },
  place: { ...typography.caption },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  right: { alignItems: 'flex-end', gap: 2 },
  amount: { ...typography.amountSmall },
  secondary: { ...typography.caption },
  close: {
    width: 26,
    height: 26,
    borderRadius: sizing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
