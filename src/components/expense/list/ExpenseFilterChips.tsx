import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Icon } from '@/components/Icon';
import { FilterModal, type FilterOption } from '@/components/ui/FilterModal';
import { FilterPill } from '@/components/ui/FilterPill';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

export type ExpenseFilterKey = 'category' | 'payment' | 'member' | 'place' | 'month';

export interface ExpenseFilterChipsProps {
  isSharedTrip: boolean;
  openFilter: ExpenseFilterKey | null;
  onOpenFilter: (key: ExpenseFilterKey | null) => void;

  categoryOptions: FilterOption[];
  paymentOptions: FilterOption[];
  memberOptions: FilterOption[];
  placeOptions: FilterOption[];
  monthOptions: FilterOption[];

  selectedCategoryIds: Set<string>;
  selectedPayments: Set<string>;
  selectedMembers: Set<string>;
  selectedPlaces: Set<string>;
  selectedMonths: Set<string>;

  onSetCategoryIds: (next: Set<string>) => void;
  onSetPayments: (next: Set<string>) => void;
  onSetMembers: (next: Set<string>) => void;
  onSetPlaces: (next: Set<string>) => void;
  onSetMonths: (next: Set<string>) => void;

  onClearAll: () => void;
}

function summarize(
  selected: Set<string>,
  options: FilterOption[],
  fallback: string,
  countLabel: string,
): string {
  if (selected.size === 0) return fallback;
  if (selected.size <= 2) {
    return options.filter((o) => selected.has(o.id)).map((o) => o.label).join(', ');
  }
  return countLabel;
}

function toggleIn(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function ExpenseFilterChips(props: ExpenseFilterChipsProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const {
    isSharedTrip,
    openFilter,
    onOpenFilter,
    categoryOptions,
    paymentOptions,
    memberOptions,
    placeOptions,
    monthOptions,
    selectedCategoryIds,
    selectedPayments,
    selectedMembers,
    selectedPlaces,
    selectedMonths,
    onSetCategoryIds,
    onSetPayments,
    onSetMembers,
    onSetPlaces,
    onSetMonths,
    onClearAll,
  } = props;

  const anyActive =
    selectedCategoryIds.size > 0 ||
    selectedPayments.size > 0 ||
    selectedMembers.size > 0 ||
    selectedPlaces.size > 0 ||
    selectedMonths.size > 0;

  const categorySummary = summarize(
    selectedCategoryIds,
    categoryOptions,
    t('expenses.filterAll'),
    t('expenses.filterNCategories', { count: selectedCategoryIds.size }),
  );
  const paymentSummary = summarize(
    selectedPayments,
    paymentOptions,
    t('expenses.filterAllPayments'),
    t('expenses.filterNSelected', { count: selectedPayments.size }),
  );
  const memberSummary = summarize(
    selectedMembers,
    memberOptions,
    t('expenses.filterEveryone'),
    t('expenses.filterNSelected', { count: selectedMembers.size }),
  );
  const placeSummary = summarize(
    selectedPlaces,
    placeOptions,
    t('expenses.filterAllPlaces'),
    t('expenses.filterNSelected', { count: selectedPlaces.size }),
  );
  const monthSummary = summarize(
    selectedMonths,
    monthOptions,
    t('expenses.filterAllTime'),
    t('expenses.filterNSelected', { count: selectedMonths.size }),
  );

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
      >
        <FilterPill
          label={t('expenses.filterCategory')}
          summary={categorySummary}
          active={selectedCategoryIds.size > 0}
          activeCount={selectedCategoryIds.size}
          onPress={() => onOpenFilter('category')}
        />
        <FilterPill
          label={t('expenses.filterPayment')}
          summary={paymentSummary}
          active={selectedPayments.size > 0}
          activeCount={selectedPayments.size}
          onPress={() => onOpenFilter('payment')}
        />
        {isSharedTrip ? (
          <FilterPill
            label={t('expenses.filterMember')}
            summary={memberSummary}
            active={selectedMembers.size > 0}
            activeCount={selectedMembers.size}
            onPress={() => onOpenFilter('member')}
          />
        ) : null}
        <FilterPill
          label={t('expenses.filterLocation')}
          summary={placeSummary}
          active={selectedPlaces.size > 0}
          activeCount={selectedPlaces.size}
          onPress={() => onOpenFilter('place')}
        />
        <FilterPill
          label={t('expenses.filterMonth')}
          summary={monthSummary}
          active={selectedMonths.size > 0}
          activeCount={selectedMonths.size}
          onPress={() => onOpenFilter('month')}
        />
        {anyActive ? (
          <Pressable
            onPress={onClearAll}
            style={[
              styles.clearButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('expenses.filterClearAll')}
            hitSlop={6}
          >
            <Icon name="x" size={13} color={theme.textSecondary} stroke={2.2} />
          </Pressable>
        ) : null}
      </ScrollView>

      <FilterModal
        visible={openFilter === 'category'}
        title={t('expenses.filterCategory')}
        options={categoryOptions}
        selectedIds={selectedCategoryIds}
        onToggle={(id) => onSetCategoryIds(toggleIn(selectedCategoryIds, id))}
        onSelectAll={() => onSetCategoryIds(new Set(categoryOptions.map((o) => o.id)))}
        onClear={() => onSetCategoryIds(new Set())}
        onDone={() => onOpenFilter(null)}
      />
      <FilterModal
        visible={openFilter === 'payment'}
        title={t('expenses.filterPayment')}
        options={paymentOptions}
        selectedIds={selectedPayments}
        onToggle={(id) => onSetPayments(toggleIn(selectedPayments, id))}
        onSelectAll={() => onSetPayments(new Set(paymentOptions.map((o) => o.id)))}
        onClear={() => onSetPayments(new Set())}
        onDone={() => onOpenFilter(null)}
      />
      <FilterModal
        visible={openFilter === 'member'}
        title={t('expenses.filterMember')}
        options={memberOptions}
        selectedIds={selectedMembers}
        onToggle={(id) => onSetMembers(toggleIn(selectedMembers, id))}
        onSelectAll={() => onSetMembers(new Set(memberOptions.map((o) => o.id)))}
        onClear={() => onSetMembers(new Set())}
        onDone={() => onOpenFilter(null)}
      />
      <FilterModal
        visible={openFilter === 'place'}
        title={t('expenses.filterLocation')}
        options={placeOptions}
        selectedIds={selectedPlaces}
        onToggle={(id) => onSetPlaces(toggleIn(selectedPlaces, id))}
        onSelectAll={() => onSetPlaces(new Set(placeOptions.map((o) => o.id)))}
        onClear={() => onSetPlaces(new Set())}
        onDone={() => onOpenFilter(null)}
      />
      <FilterModal
        visible={openFilter === 'month'}
        title={t('expenses.filterMonth')}
        options={monthOptions}
        selectedIds={selectedMonths}
        onToggle={(id) => onSetMonths(toggleIn(selectedMonths, id))}
        onSelectAll={() => onSetMonths(new Set(monthOptions.map((o) => o.id)))}
        onClear={() => onSetMonths(new Set())}
        onDone={() => onOpenFilter(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    alignItems: 'center',
  },
  clearButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // (formerly clearButtonText — replaced by SVG x icon.)
});
