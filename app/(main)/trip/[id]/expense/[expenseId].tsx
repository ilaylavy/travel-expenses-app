import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { sizing, spacing, typography } from '@/constants/theme';
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
import type { ExpenseWithPhotos } from '@/types/expense';
import { getCategoryColor, getCategorySoftColor } from '@/utils/categoryColor';
import { formatAmount } from '@/utils/currency';
import { formatDayWithYear } from '@/utils/date';
import { href } from '@/utils/nav';
import { shareExpense } from '@/utils/sharing';

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
  const deleteExpense = useExpenseStore((s) => s.deleteExpense);
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
      categoryName: category?.name ?? null,
      categoryEmoji: category?.emoji ?? null,
      homeCurrency: trip.homeCurrency,
    });
  }, [expense, trip, category]);

  const handleDelete = useCallback(() => {
    if (!expense) return;
    Alert.alert(
      t('expenseDetail.deleteConfirmTitle'),
      t('expenseDetail.deleteConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExpense(expense.id);
              router.back();
            } catch (error) {
              console.warn('Failed to delete expense:', error);
              Alert.alert(t('expenseDetail.deleteFailedTitle'));
            }
          },
        },
      ],
    );
  }, [expense, deleteExpense, router, t]);

  if (!expense || !trip) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={[
              styles.headerButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.headerButtonText, { color: theme.text }]}>‹</Text>
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

  const color = category ? getCategoryColor(category.color, theme) : theme.accent;
  const softColor = category
    ? getCategorySoftColor(category.color, theme)
    : theme.accentSoft;

  const showConverted = expense.currency !== trip.homeCurrency;
  const primaryAmount = formatAmount(Math.abs(expense.amount), expense.currency);
  const convertedAmount = formatAmount(
    Math.abs(expense.convertedAmount),
    trip.homeCurrency,
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={[
            styles.headerButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.headerButtonText, { color: theme.text }]}>‹</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {t('expenseDetail.title')}
        </Text>
        {canMutate ? (
          <Pressable
            onPress={handleEdit}
            hitSlop={8}
            style={[
              styles.headerButton,
              {
                backgroundColor: theme.accentSoft,
                borderColor: theme.accent,
              },
            ]}
          >
            <Text style={[styles.headerButtonText, { color: theme.accent }]}>
              ✎
            </Text>
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Amount hero */}
        <View
          style={[
            styles.hero,
            { backgroundColor: theme.surface, borderColor: theme.borderLight },
          ]}
        >
          <View style={[styles.categoryIcon, { backgroundColor: softColor }]}>
            <Text style={styles.categoryEmoji}>{category?.emoji ?? '•'}</Text>
          </View>
          {category ? (
            <Text style={[styles.categoryName, { color }]}>{category.name}</Text>
          ) : null}
          <Text
            style={[
              styles.amount,
              { color: expense.isRefund ? theme.green : theme.text },
            ]}
          >
            {expense.isRefund ? '+' : ''}
            {primaryAmount}
          </Text>
          {showConverted ? (
            <Text style={[styles.amountConverted, { color: theme.textMuted }]}>
              ≈ {convertedAmount}
            </Text>
          ) : null}
          <View style={styles.badgeRow}>
            {expense.isRefund ? (
              <View style={[styles.badge, { backgroundColor: theme.greenSoft }]}>
                <Text style={[styles.badgeText, { color: theme.green }]}>
                  {t('expenseDetail.badgeRefund')}
                </Text>
              </View>
            ) : null}
            {expense.isExcludedFromDailyMetrics ? (
              <View style={[styles.badge, { backgroundColor: theme.bgSoft }]}>
                <Text style={[styles.badgeText, { color: theme.textMuted }]}>
                  {t('expenseDetail.badgeExcluded')}
                </Text>
              </View>
            ) : null}
            {expense.spreadStartDate && expense.spreadEndDate ? (
              <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.badgeText, { color: theme.accent }]}>
                  {t('expenseDetail.badgeMultiDay')}
                </Text>
              </View>
            ) : null}
            {expense.isPrivate ? (
              <View style={[styles.badge, { backgroundColor: theme.bgSoft }]}>
                <Text style={[styles.badgeText, { color: theme.textMuted }]}>
                  🔒 {t('expense.privateBadge')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Note */}
        <FieldCard title={t('expenseDetail.noteLabel')} theme={theme}>
          <Text
            style={[
              styles.fieldValue,
              { color: expense.note?.trim() ? theme.text : theme.textMuted },
            ]}
          >
            {expense.note?.trim() || t('expenseDetail.noteEmpty')}
          </Text>
        </FieldCard>

        {/* Payment */}
        {expense.paymentMethod ? (
          <FieldCard title={t('expenseDetail.paymentLabel')} theme={theme}>
            <Text style={[styles.fieldValue, { color: theme.text }]}>
              {paymentLabel(expense.paymentMethod, t)}
            </Text>
          </FieldCard>
        ) : null}

        {/* Date & time */}
        <FieldCard title={t('expenseDetail.dateTimeLabel')} theme={theme}>
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

        {/* Location */}
        <FieldCard title={t('expenseDetail.locationLabel')} theme={theme}>
          {expense.placeName ? (
            <Text style={[styles.fieldValue, { color: theme.text }]}>
              📍 {expense.placeName}
            </Text>
          ) : expense.latitude != null && expense.longitude != null ? (
            <Text style={[styles.fieldValue, { color: theme.text }]}>
              📍 {expense.latitude.toFixed(4)}, {expense.longitude.toFixed(4)}
            </Text>
          ) : (
            <Text style={[styles.fieldValue, { color: theme.textMuted }]}>
              {t('expenseDetail.locationMissing')}
            </Text>
          )}
        </FieldCard>

        {/* Exchange rate */}
        <FieldCard title={t('expenseDetail.exchangeLabel')} theme={theme}>
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

        {/* Photos */}
        {expense.photos.length > 0 ? (
          <View style={styles.photosSection}>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              {t('expenseDetail.photosLabel').toUpperCase()}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRow}
            >
              {expense.photos.map((photo) => {
                const uri = photo.localUri ?? photo.storagePath;
                if (!uri) return null;
                return (
                  <Image
                    key={photo.id}
                    source={{ uri }}
                    style={[styles.photoThumb, { borderColor: theme.border }]}
                  />
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Logged by (shared trips only) */}
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
          style={[
            styles.secondaryButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
            ↗  {t('expenseDetail.shareButton')}
          </Text>
        </Pressable>
        {canMutate ? (
          <Pressable
            onPress={handleDelete}
            style={[styles.deleteButton, { backgroundColor: theme.redSoft }]}
          >
            <Text style={[styles.deleteButtonText, { color: theme.red }]}>
              {t('expenseDetail.deleteButton')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function FieldCard({
  title,
  theme,
  children,
}: {
  title: string;
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.fieldCard,
        { backgroundColor: theme.surface, borderColor: theme.borderLight },
      ]}
    >
      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: { fontSize: 18, fontWeight: '700' },
  headerTitle: { ...typography.itemTitle, flex: 1, textAlign: 'center' },
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
    gap: spacing.base,
  },
  hero: {
    borderRadius: sizing.radiusCard,
    borderWidth: 1,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryIcon: {
    width: sizing.categoryIconLarge,
    height: sizing.categoryIconLarge,
    borderRadius: sizing.radiusIcon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: { fontSize: 24 },
  categoryName: { ...typography.subtitle, letterSpacing: 0.3 },
  amount: { ...typography.amountLarge, marginTop: spacing.xs },
  amountConverted: { ...typography.subtitle },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: sizing.radiusChip,
  },
  badgeText: { ...typography.micro },
  fieldCard: {
    borderRadius: sizing.radiusCardInner,
    borderWidth: 1,
    padding: spacing.lg,
    gap: 4,
  },
  fieldLabel: { ...typography.micro, marginBottom: 2 },
  fieldValue: { ...typography.body, fontSize: 15 },
  fieldSub: { ...typography.secondary, marginTop: 2 },
  photosSection: { gap: spacing.sm },
  sectionLabel: { ...typography.micro, paddingHorizontal: spacing.xs },
  photoRow: { gap: spacing.sm, paddingVertical: 4 },
  photoThumb: {
    width: 96,
    height: 96,
    borderRadius: sizing.radiusSmall,
    borderWidth: 1,
  },
  loggedBy: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.base,
    borderTopWidth: 1,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: sizing.radiusButton,
    borderWidth: 1.5,
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
