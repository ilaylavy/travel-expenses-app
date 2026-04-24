import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExpenseCard } from '@/components/expense/ExpenseCard';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useCategoryStore } from '@/stores/categoryStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTripStore } from '@/stores/tripStore';
import { href } from '@/utils/nav';

export default function TripExpensesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;

  const trip = useTripStore((s) => s.trips.find((x) => x.id === tripId));
  const expenses = useExpenseStore((s) => s.expenses);
  const activeTripId = useExpenseStore((s) => s.activeTripId);
  const loadForTrip = useExpenseStore((s) => s.loadForTrip);
  const categories = useCategoryStore((s) => s.categories);

  useEffect(() => {
    if (tripId && activeTripId !== tripId) void loadForTrip(tripId);
  }, [tripId, activeTripId, loadForTrip]);

  const categoryById = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c]));
    return map;
  }, [categories]);

  if (!trip || !tripId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.missing}>
          <Text style={{ color: theme.textSecondary }}>{t('trips.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{t('tripView.tabExpenses')}</Text>
        <Pressable
          onPress={() => router.push(href(`/add-expense?tripId=${tripId}`))}
          style={[styles.addButton, { backgroundColor: theme.accent }]}
          hitSlop={8}
        >
          <Text style={styles.addButtonText}>＋</Text>
        </Pressable>
      </View>

      <FlatList
        data={expenses}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <ExpenseCard
            expense={item}
            category={categoryById.get(item.categoryId) ?? null}
            homeCurrency={trip.homeCurrency}
          />
        )}
        ListEmptyComponent={
          <View style={[styles.empty, { borderColor: theme.borderLight }]}>
            <Text style={styles.emptyEmoji}>💸</Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {t('tripView.emptyExpensesTitle')}
            </Text>
            <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
              {t('tripView.emptyExpensesBody')}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: typography.title,
  addButton: {
    width: sizing.headerButton,
    height: sizing.headerButton,
    borderRadius: sizing.headerButtonRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl },
  empty: {
    borderRadius: sizing.radiusCard,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: spacing.xxl,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.sm },
  emptyTitle: { ...typography.itemTitle, marginBottom: 4 },
  emptyBody: { ...typography.secondary, textAlign: 'center' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
