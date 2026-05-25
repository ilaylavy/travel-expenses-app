// Per-category breakdown sheet shown when the user taps the day total.
// Each row is "<emoji> Category  ·  converted amount", sorted high-to-low.
// Subtotal of the breakdown matches the day total in the stats strip.

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Category } from '@/types/category';
import type { ExpenseWithPhotos } from '@/types/expense';
import { formatAmount } from '@/utils/currency';

interface Props {
  visible: boolean;
  expenses: ExpenseWithPhotos[];
  categoriesById: Map<string, Category>;
  homeCurrency: string;
  onDismiss: () => void;
}

export function DaySpendingBreakdown({
  visible,
  expenses,
  categoriesById,
  homeCurrency,
  onDismiss,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();

  const byCat = new Map<string, number>();
  for (const e of expenses) {
    if (e.isExcludedFromDailyMetrics) continue;
    byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + (e.convertedAmount ?? 0));
  }
  const rows = Array.from(byCat.entries())
    .map(([id, amount]) => ({ id, cat: categoriesById.get(id), amount }))
    .sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.eyebrow, { color: theme.accent }]}>SPENT TODAY</Text>
          <Text style={[styles.total, { color: theme.text }]}>
            {formatAmount(total, homeCurrency)}
          </Text>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          {rows.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              {t('journal.emptyDay')}
            </Text>
          ) : (
            <ScrollView style={styles.list}>
              {rows.map((r) => {
                const pct = total > 0 ? r.amount / total : 0;
                return (
                  <View key={r.id} style={styles.row}>
                    <View style={styles.rowHead}>
                      <Text style={[styles.cat, { color: theme.text }]} numberOfLines={1}>
                        {r.cat?.emoji ?? '📦'}  {r.cat?.name ?? '—'}
                      </Text>
                      <Text style={[styles.amt, { color: theme.text }]}>
                        {formatAmount(r.amount, homeCurrency)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.barTrack,
                        { backgroundColor: theme.bgSoft },
                      ]}
                    >
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${Math.max(2, pct * 100)}%`,
                            backgroundColor: theme.accent,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    padding: 22,
    paddingBottom: 32,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '80%',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  total: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
  },
  list: { maxHeight: 380 },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  row: { marginBottom: 12 },
  rowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  cat: { fontSize: 14, fontWeight: '700', flex: 1, paddingInlineEnd: 8 },
  amt: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  barTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
});
