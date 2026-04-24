import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SwipeableExpenseCard } from '@/components/expense/SwipeableExpenseCard';
import { CategoryFilterChips } from '@/components/ui/CategoryFilterChips';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import {
  selectCategoriesForTrip,
  useCategoryStore,
} from '@/stores/categoryStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTripStore } from '@/stores/tripStore';
import type { ExpenseWithPhotos } from '@/types/expense';
import { formatAmount } from '@/utils/currency';
import { formatDayWithYear } from '@/utils/date';
import { groupExpensesByDate, type ExpenseDateGroup } from '@/utils/expenseGrouping';
import { href } from '@/utils/nav';

export default function TripExpensesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useGlobalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;

  const trip = useTripStore((s) => s.trips.find((x) => x.id === tripId));
  const expenses = useExpenseStore((s) => s.expenses);
  const activeTripId = useExpenseStore((s) => s.activeTripId);
  const loadForTrip = useExpenseStore((s) => s.loadForTrip);
  const deleteExpense = useExpenseStore((s) => s.deleteExpense);
  const allCategories = useCategoryStore((s) => s.categories);

  const [query, setQuery] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (tripId && activeTripId !== tripId) void loadForTrip(tripId);
  }, [tripId, activeTripId, loadForTrip]);

  const tripCategories = useMemo(
    () => selectCategoriesForTrip(allCategories, tripId ?? null),
    [allCategories, tripId],
  );
  const categoryById = useMemo(
    () => new Map(tripCategories.map((c) => [c.id, c])),
    [tripCategories],
  );

  // Only offer chips for categories that have at least one expense in the trip.
  const filterableCategories = useMemo(() => {
    const used = new Set<string>();
    for (const e of expenses) used.add(e.categoryId);
    return tripCategories.filter((c) => used.has(c.id));
  }, [expenses, tripCategories]);

  const filteredExpenses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses.filter((e) => {
      if (selectedCategoryIds.size > 0 && !selectedCategoryIds.has(e.categoryId)) {
        return false;
      }
      if (q === '') return true;
      const note = (e.note ?? '').toLowerCase();
      const place = (e.placeName ?? '').toLowerCase();
      return note.includes(q) || place.includes(q);
    });
  }, [expenses, query, selectedCategoryIds]);

  const sections = useMemo<ExpenseDateGroup[]>(
    () => groupExpensesByDate(filteredExpenses),
    [filteredExpenses],
  );

  const toggleCategory = useCallback((id: string) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearCategories = useCallback(() => {
    setSelectedCategoryIds(new Set());
  }, []);

  const handlePressRow = useCallback(
    (expense: ExpenseWithPhotos) => {
      router.push(href(`/trip/${tripId}/expense/${expense.id}`));
    },
    [router],
  );

  const handleDelete = useCallback(
    async (expense: ExpenseWithPhotos) => {
      try {
        await deleteExpense(expense.id);
      } catch (error) {
        console.warn('Failed to delete expense:', error);
        Alert.alert(t('expensesList.deleteFailedTitle'));
      }
    },
    [deleteExpense, t],
  );

  const labelForGroup = useCallback(
    (group: ExpenseDateGroup): string => {
      if (group.kind === 'today') return t('expensesList.dateToday');
      if (group.kind === 'yesterday') return t('expensesList.dateYesterday');
      return formatDayWithYear(group.date);
    },
    [t],
  );

  if (!trip || !tripId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.missing}>
          <Text style={{ color: theme.textSecondary }}>{t('trips.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasExpenses = expenses.length > 0;
  const filteredAway = hasExpenses && sections.length === 0;

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

      {hasExpenses ? (
        <>
          <View style={styles.searchWrap}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('expensesList.searchPlaceholder')}
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={[
                styles.searchInput,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
            />
          </View>
          {filterableCategories.length > 0 ? (
            <CategoryFilterChips
              categories={filterableCategories}
              selectedIds={selectedCategoryIds}
              onToggle={toggleCategory}
              onClear={clearCategories}
              allLabel={t('expensesList.filterAll')}
            />
          ) : null}
        </>
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderSectionHeader={({ section }) => (
          <View
            style={[
              styles.sectionHeader,
              { backgroundColor: theme.bg, borderBottomColor: theme.borderLight },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {labelForGroup(section)}
            </Text>
            <Text style={[styles.sectionSubtotal, { color: theme.textSecondary }]}>
              {formatAmount(section.subtotal, trip.homeCurrency)}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <SwipeableExpenseCard
            expense={item.displayExpense}
            category={categoryById.get(item.expense.categoryId) ?? null}
            homeCurrency={trip.homeCurrency}
            onPress={() => handlePressRow(item.expense)}
            onDelete={() => handleDelete(item.expense)}
            confirmTitle={t('expensesList.deleteConfirmTitle')}
            confirmBody={t('expensesList.deleteConfirmBody')}
            confirmLabel={t('common.delete')}
            cancelLabel={t('common.cancel')}
            deleteLabel={t('expensesList.deleteAction')}
          />
        )}
        ListEmptyComponent={
          filteredAway ? (
            <View style={[styles.empty, { borderColor: theme.borderLight }]}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {t('expensesList.emptyFilteredTitle')}
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {t('expensesList.emptyFilteredBody')}
              </Text>
            </View>
          ) : (
            <View style={[styles.empty, { borderColor: theme.borderLight }]}>
              <Text style={styles.emptyEmoji}>💸</Text>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {t('tripView.emptyExpensesTitle')}
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {t('tripView.emptyExpensesBody')}
              </Text>
            </View>
          )
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
  searchWrap: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  searchInput: {
    borderRadius: sizing.radiusInput,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '500',
  },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    borderBottomWidth: 1,
  },
  sectionTitle: { ...typography.sectionTitle },
  sectionSubtotal: { ...typography.amountSmall },
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
