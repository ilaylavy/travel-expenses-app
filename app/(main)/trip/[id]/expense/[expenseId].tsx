import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExpenseHero } from '@/components/expense/detail/ExpenseHero';
import { ExpensePhotosSection } from '@/components/expense/detail/ExpensePhotosSection';
import { ExpenseSplitBreakdown } from '@/components/expense/detail/ExpenseSplitBreakdown';
import { FieldCard } from '@/components/expense/detail/FieldCard';
import { PhotoGalleryModal } from '@/components/expense/photo/PhotoGalleryModal';
import { Icon } from '@/components/Icon';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { SettlementAttributedError } from '@/db/queries/errors';
import { getProfileName } from '@/db/queries/profiles';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import {
  selectCategoriesForTrip,
  useCategoryStore,
} from '@/stores/categoryStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTripStore } from '@/stores/tripStore';
import type { Category } from '@/types/category';
import type { ExpensePhoto, ExpenseSplit, ExpenseWithPhotos } from '@/types/expense';
import { getCategoryDisplayName } from '@/utils/category';
import { showConfirmDialog } from '@/utils/confirmDialog';
import { formatAmount } from '@/utils/currency';
import { formatDayWithYear } from '@/utils/date';
import { href } from '@/utils/nav';
import { shareExpense } from '@/utils/share';

function paymentLabel(method: string, t: (key: string) => string): string {
  if (method === 'cash') return t('expense.paymentCash');
  if (method === 'credit') return t('expense.paymentCredit');
  if (method === 'debit') return t('expense.paymentDebit');
  return method;
}

export default function ExpenseDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string; expenseId: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;
  const expenseId = Array.isArray(params.expenseId)
    ? params.expenseId[0]
    : params.expenseId;

  const user = useAuthStore((s) => s.user);
  const trip = useTripStore((s) => s.trips.find((x) => x.id === tripId));
  const expense = useExpenseStore((s) =>
    s.expenses.find((e) => e.id === expenseId),
  ) as ExpenseWithPhotos | undefined;
  const allSplits = useExpenseStore((s) => s.splits);
  const splits = useMemo(
    () =>
      allSplits.filter(
        (x) => x.expenseId === expenseId && x.deletedAt === null,
      ),
    [allSplits, expenseId],
  );
  const deleteExpense = useExpenseStore((s) => s.deleteExpense);
  const deletePhoto = useExpenseStore((s) => s.deletePhoto);
  const allCategories = useCategoryStore((s) => s.categories);

  const tripCategories = useMemo(
    () => selectCategoriesForTrip(allCategories, tripId ?? null),
    [allCategories, tripId],
  );
  const category: Category | null = useMemo(() => {
    if (!expense) return null;
    return tripCategories.find((c) => c.id === expense.categoryId) ?? null;
  }, [tripCategories, expense]);

  const [loggerName, setLoggerName] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [splitMemberNames, setSplitMemberNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (splits.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        splits.map(
          async (s) => [s.userId, (await getProfileName(s.userId)) ?? ''] as const,
        ),
      );
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const [uid, name] of entries) map[uid] = name;
      setSplitMemberNames(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [splits]);

  const sortedSplits = useMemo<ExpenseSplit[]>(() => {
    return [...splits].sort((a, b) => {
      if (a.isPayer !== b.isPayer) return a.isPayer ? -1 : 1;
      return b.amount - a.amount;
    });
  }, [splits]);

  const userSplit = useMemo(
    () => splits.find((s) => s.userId === user?.id) ?? null,
    [splits, user?.id],
  );

  const memberCount = trip?.stats.memberCount ?? 1;
  const isShared = memberCount > 1;
  const canMutate = expense ? expense.userId === user?.id : false;

  useEffect(() => {
    if (!expense) return;
    let cancelled = false;
    if (expense.userId === user?.id) {
      setLoggerName(t('expenseDetail.you'));
      return;
    }
    (async () => {
      const name = await getProfileName(expense.userId);
      if (!cancelled) setLoggerName(name);
    })();
    return () => {
      cancelled = true;
    };
  }, [expense, user?.id, t]);

  const handleEdit = useCallback(() => {
    if (!tripId || !expenseId) return;
    router.push(href(`/add-expense?tripId=${tripId}&expenseId=${expenseId}`));
  }, [router, tripId, expenseId]);

  const handleShare = useCallback(async () => {
    if (!expense || !trip) return;
    await shareExpense({
      expense,
      categoryName: category ? getCategoryDisplayName(category, t) : null,
      categoryEmoji: category?.emoji ?? null,
      homeCurrency: trip.homeCurrency,
    });
  }, [expense, trip, category, t]);

  const handleDeletePhoto = useCallback(
    async (photo: ExpensePhoto) => {
      try {
        await deletePhoto(photo);
        // If that was the last photo on the expense, drop the modal — there's
        // nothing left to scroll to.
        if (expense && expense.photos.length <= 1) {
          setGalleryOpen(false);
        }
      } catch (error) {
        console.warn('Failed to delete photo:', error);
        Alert.alert(t('expenseDetail.photoDeleteFailed'));
      }
    },
    [deletePhoto, expense, t],
  );

  const handleDelete = useCallback(() => {
    if (!expense) return;
    showConfirmDialog({
      title: t('expenseDetail.deleteConfirmTitle'),
      body: t('expenseDetail.deleteConfirmBody'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteExpense(expense.id);
          router.back();
        } catch (error) {
          if (error instanceof SettlementAttributedError) {
            Alert.alert(t('balances.editBlockedTitle'), t('balances.editBlockedBody'));
            return;
          }
          console.warn('Failed to delete expense:', error);
          Alert.alert(t('expenseDetail.deleteFailedTitle'));
        }
      },
    });
  }, [expense, deleteExpense, router, t]);

  if (!expense || !trip) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={[
              styles.headerButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Icon name="chevron-left" size={18} color={theme.text} stroke={2} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {t('expenseDetail.title')}
          </Text>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.missing}>
          <Text style={{ color: theme.textSecondary }}>
            {t('expenseDetail.notFound')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const showConverted = expense.currency !== trip.homeCurrency;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={[
            styles.headerButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Icon name="chevron-left" size={18} color={theme.text} stroke={2} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {t('expenseDetail.title')}
        </Text>
        {canMutate ? (
          <Pressable
            onPress={handleEdit}
            hitSlop={8}
            style={({ pressed }) => [
              styles.headerButton,
              {
                backgroundColor: theme.accentSoft,
                borderColor: theme.accent,
                transform: [{ scale: pressed ? 0.94 : 1 }],
              },
            ]}
          >
            <Icon name="edit" size={15} color={theme.accent} stroke={1.8} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ExpenseHero
          expense={expense}
          trip={trip}
          category={category}
          userSplit={userSplit}
        />

        <FieldCard title={t('expenseDetail.noteLabel')}>
          <Text
            style={[
              styles.fieldValue,
              { color: expense.note?.trim() ? theme.text : theme.textMuted },
            ]}
          >
            {expense.note?.trim() || t('expenseDetail.noteEmpty')}
          </Text>
        </FieldCard>

        {expense.paymentMethod ? (
          <FieldCard title={t('expenseDetail.paymentLabel')}>
            <Text style={[styles.fieldValue, { color: theme.text }]}>
              {paymentLabel(expense.paymentMethod, t)}
            </Text>
          </FieldCard>
        ) : null}

        <FieldCard title={t('expenseDetail.dateTimeLabel')}>
          <Text style={[styles.fieldValue, { color: theme.text }]}>
            {formatDayWithYear(expense.expenseDate)} · {expense.expenseTime.slice(0, 5)}
          </Text>
          {expense.spreadStartDate && expense.spreadEndDate ? (
            <Text style={[styles.fieldSub, { color: theme.textSecondary }]}>
              {t('expenseDetail.spreadRange', {
                start: formatDayWithYear(expense.spreadStartDate),
                end: formatDayWithYear(expense.spreadEndDate),
              })}
            </Text>
          ) : null}
        </FieldCard>

        <FieldCard title={t('expenseDetail.locationLabel')}>
          {expense.latitude != null && expense.longitude != null ? (
            <Pressable
              onPress={() =>
                router.push(href(`/trip/${tripId}/map?focusExpenseId=${expense.id}`))
              }
              accessibilityRole="button"
              accessibilityLabel={t('expenseDetail.viewOnMapHint')}
            >
              {({ pressed }) => (
                <View style={{ opacity: pressed ? 0.6 : 1 }}>
                  <View style={styles.locationRow}>
                    <Icon name="map-pin" size={14} color={theme.textSecondary} stroke={1.8} />
                    <Text style={[styles.fieldValue, { color: theme.text, flex: 1 }]} numberOfLines={2}>
                      {expense.placeName ??
                        `${expense.latitude!.toFixed(4)}, ${expense.longitude!.toFixed(4)}`}
                    </Text>
                  </View>
                  <Text style={[styles.fieldSub, { color: theme.accent }]}>
                    {t('expenseDetail.viewOnMapHint')}
                  </Text>
                </View>
              )}
            </Pressable>
          ) : (
            <Text style={[styles.fieldValue, { color: theme.textMuted }]}>
              {t('expenseDetail.locationMissing')}
            </Text>
          )}
        </FieldCard>

        <FieldCard title={t('expenseDetail.exchangeLabel')}>
          {showConverted ? (
            <>
              <Text style={[styles.fieldValue, { color: theme.text }]}>
                {t('expenseDetail.exchangeRate', {
                  from: expense.currency,
                  rate: expense.exchangeRate.toFixed(4),
                  to: trip.homeCurrency,
                })}
              </Text>
              <Text style={[styles.fieldSub, { color: theme.textSecondary }]}>
                {formatAmount(Math.abs(expense.amount), expense.currency)}
                {'  →  '}
                {formatAmount(Math.abs(expense.convertedAmount), trip.homeCurrency)}
              </Text>
            </>
          ) : (
            <Text style={[styles.fieldValue, { color: theme.textMuted }]}>
              {t('expenseDetail.sameCurrencyExchange')}
            </Text>
          )}
        </FieldCard>

        <ExpensePhotosSection
          photos={expense.photos}
          onTap={(index) => {
            setGalleryIndex(index);
            setGalleryOpen(true);
          }}
        />

        <ExpenseSplitBreakdown
          expense={expense}
          splits={sortedSplits}
          userSplit={userSplit}
          splitMemberNames={splitMemberNames}
          currentUserId={user?.id ?? null}
        />

        {isShared ? (
          <Text style={[styles.loggedBy, { color: theme.textMuted }]}>
            {t('expenseDetail.loggedBy', { name: loggerName ?? '—' })}
          </Text>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { backgroundColor: theme.bg, borderTopColor: theme.border },
        ]}
      >
        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <View style={styles.buttonRow}>
            <Icon name="share" size={15} color={theme.text} stroke={1.8} />
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
              {t('expenseDetail.shareButton')}
            </Text>
          </View>
        </Pressable>
        {canMutate ? (
          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [
              styles.deleteButton,
              {
                backgroundColor: theme.redSoft,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <Text style={[styles.deleteButtonText, { color: theme.red }]}>
              {t('expenseDetail.deleteButton')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <PhotoGalleryModal
        visible={galleryOpen}
        photos={expense.photos}
        initialIndex={galleryIndex}
        onClose={() => setGalleryOpen(false)}
        onDelete={canMutate ? handleDeletePhoto : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerButton: {
    width: sizing.headerButton,
    height: sizing.headerButton,
    borderRadius: sizing.headerButtonRadius,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // (formerly headerButtonText — replaced by SVG icons.)
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { ...typography.itemTitle, flex: 1, textAlign: 'center' },
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
    gap: spacing.base,
  },
  fieldValue: { ...typography.body, fontSize: 15 },
  fieldSub: { ...typography.secondary, marginTop: 2 },
  loggedBy: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.base,
    borderTopWidth: borderWidth.hairline,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14, // button tall geometry
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  deleteButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: sizing.radiusButton,
    alignItems: 'center',
  },
  deleteButtonText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
