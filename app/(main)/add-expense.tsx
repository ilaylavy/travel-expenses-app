import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryGrid } from '@/components/expense/CategoryGrid';
import { NumPad, appendNumPadKey, type NumPadKey } from '@/components/expense/NumPad';
import { CurrencyPickerModal } from '@/components/currency/CurrencyPickerModal';
import { RateOverrideChip } from '@/components/currency/RateOverrideChip';
import { CURRENCIES, POPULAR_CURRENCIES } from '@/constants/currencies';
import { sizing, spacing, typography } from '@/constants/theme';
import {
  categoryUsageForTrip,
  getExpense,
  lastUsedPaymentMethodForTrip,
  listRecentNotesForTrip,
} from '@/db/queries/expenses';
import { getTrip } from '@/db/queries/trips';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { captureCurrentLocation } from '@/services/locationService';
import { capturePhoto, pickPhotosFromLibrary } from '@/services/photoService';
import { useAuthStore } from '@/stores/authStore';
import {
  selectCategoriesForTrip,
  useCategoryStore,
} from '@/stores/categoryStore';
import { useExpenseStore } from '@/stores/expenseStore';
import type { Category } from '@/types/category';
import type { PaymentMethod } from '@/types/expense';
import type { Trip } from '@/types/trip';
import { formatAmount, getCurrencySymbol } from '@/utils/currency';
import { isValidIsoDate, todayIsoDate } from '@/utils/date';
import { shareExpense } from '@/utils/sharing';

const PAYMENT_METHODS: PaymentMethod[] = ['credit', 'cash', 'debit'];

function currentTime(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}

function normalizeTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

function orderCategoriesByUsage(
  categories: Category[],
  usage: Map<string, { count: number; lastUsed: string }>,
): Category[] {
  return [...categories].sort((a, b) => {
    const ua = usage.get(a.id);
    const ub = usage.get(b.id);
    // Used categories come first, ordered by most recent use.
    if (ua && ub) {
      return ua.lastUsed < ub.lastUsed ? 1 : -1;
    }
    if (ua && !ub) return -1;
    if (!ua && ub) return 1;
    return a.sortOrder - b.sortOrder;
  });
}

export default function AddExpenseScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    tripId?: string | string[];
    expenseId?: string | string[];
  }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const expenseId = Array.isArray(params.expenseId) ? params.expenseId[0] : params.expenseId;
  const isEditing = Boolean(expenseId);

  const user = useAuthStore((s) => s.user);
  const allCategories = useCategoryStore((s) => s.categories);
  const createExpense = useExpenseStore((s) => s.createExpense);
  const updateExpenseInStore = useExpenseStore((s) => s.updateExpense);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [amountText, setAmountText] = useState('');
  const [currency, setCurrency] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [expenseDate, setExpenseDate] = useState(todayIsoDate());
  const [expenseTime, setExpenseTime] = useState(currentTime());
  const [locationStatus, setLocationStatus] =
    useState<'idle' | 'capturing' | 'captured' | 'none'>('idle');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [isRefund, setIsRefund] = useState(false);
  const [isExcluded, setIsExcluded] = useState(false);
  const [isSpread, setIsSpread] = useState(false);
  const [spreadStart, setSpreadStart] = useState('');
  const [spreadEnd, setSpreadEnd] = useState('');
  const [photos, setPhotos] = useState<Array<{ uri: string }>>([]);
  const [recentNotes, setRecentNotes] = useState<string[]>([]);
  const [categoryUsage, setCategoryUsage] =
    useState<Map<string, { count: number; lastUsed: string }>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Only relevant in edit mode: preserve the exchange rate the expense was
  // originally booked at. PRD.md — historical values must not drift with
  // live rates.
  const [lockedExchangeRate, setLockedExchangeRate] = useState<number | null>(
    null,
  );
  const [manualRate, setManualRate] = useState<number | null>(null);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

  // Load trip + recent-note / payment / usage data up front.
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    (async () => {
      try {
        const [loadedTrip, notes, lastPayment, usage] = await Promise.all([
          getTrip(tripId),
          listRecentNotesForTrip(tripId),
          lastUsedPaymentMethodForTrip(tripId),
          categoryUsageForTrip(tripId),
        ]);
        if (cancelled) return;
        if (loadedTrip) {
          setTrip(loadedTrip);
          if (!isEditing) setCurrency(loadedTrip.baseCurrency);
        }
        setRecentNotes(notes);
        if (!isEditing && lastPayment) setPaymentMethod(lastPayment);
        setCategoryUsage(usage);
      } catch (e) {
        console.warn('Failed to load add-expense context:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, isEditing]);

  // Hydrate state from an existing expense when opened in edit mode.
  useEffect(() => {
    if (!expenseId) return;
    let cancelled = false;
    (async () => {
      const existing = await getExpense(expenseId);
      if (cancelled || !existing) return;
      setAmountText(String(Math.abs(existing.amount)));
      setCurrency(existing.currency);
      setCategoryId(existing.categoryId);
      setNote(existing.note ?? '');
      setPaymentMethod(existing.paymentMethod ?? null);
      setExpenseDate(existing.expenseDate);
      setExpenseTime(existing.expenseTime);
      setLatitude(existing.latitude);
      setLongitude(existing.longitude);
      setPlaceName(existing.placeName);
      setLocationStatus(existing.latitude != null ? 'captured' : 'none');
      setIsRefund(existing.isRefund);
      setIsExcluded(existing.isExcludedFromMetrics);
      if (existing.spreadStartDate && existing.spreadEndDate) {
        setIsSpread(true);
        setSpreadStart(existing.spreadStartDate);
        setSpreadEnd(existing.spreadEndDate);
      }
      setLockedExchangeRate(existing.exchangeRate);
    })();
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  // Auto-capture GPS once on mount. Non-blocking — user can proceed without it.
  // Skipped in edit mode so we don't overwrite the original pin.
  useEffect(() => {
    if (isEditing) return;
    let cancelled = false;
    setLocationStatus('capturing');
    (async () => {
      const loc = await captureCurrentLocation();
      if (cancelled) return;
      if (loc) {
        setLatitude(loc.latitude);
        setLongitude(loc.longitude);
        setPlaceName(loc.placeName);
        setLocationStatus('captured');
      } else {
        setLocationStatus('none');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditing]);

  const orderedCategories = useMemo(() => {
    const list = selectCategoriesForTrip(allCategories, tripId ?? null);
    return orderCategoriesByUsage(list, categoryUsage);
  }, [allCategories, tripId, categoryUsage]);

  const selectedCategory = useMemo(
    () => orderedCategories.find((c) => c.id === categoryId) ?? null,
    [orderedCategories, categoryId],
  );

  const amountValue = useMemo(() => {
    if (!amountText) return 0;
    const n = Number(amountText);
    return Number.isFinite(n) ? n : 0;
  }, [amountText]);

  // Fetch the live rate for this currency pair. The hook returns 1 for
  // same-currency pairs and handles offline fallback. In edit mode we keep
  // the rate the expense was originally booked at (lockedExchangeRate), so
  // historical values don't drift.
  const { rate: fetchedRate, status: rateStatus } = useExchangeRate(
    currency || null,
    trip?.homeCurrency || null,
    expenseDate,
  );
  // Priority: manual override > locked (edit mode) > fetched > 1.
  const exchangeRate =
    manualRate ?? lockedExchangeRate ?? fetchedRate ?? 1;
  const convertedAmount = amountValue * exchangeRate;
  const showConvertedPreview = Boolean(
    trip && currency && currency !== trip.homeCurrency,
  );

  const popularCurrencies = useMemo(() => {
    const codes = new Set<string>(POPULAR_CURRENCIES);
    if (trip?.baseCurrency) codes.add(trip.baseCurrency);
    if (trip?.homeCurrency) codes.add(trip.homeCurrency);
    if (currency) codes.add(currency);
    return CURRENCIES.filter((c) => codes.has(c.code));
  }, [trip?.baseCurrency, trip?.homeCurrency, currency]);

  const handleKey = useCallback((key: NumPadKey) => {
    setAmountText((current) => appendNumPadKey(current, key));
  }, []);

  const handleLongBackspace = useCallback(() => {
    setAmountText('');
  }, []);

  const refreshLocation = useCallback(async () => {
    setLocationStatus('capturing');
    const loc = await captureCurrentLocation();
    if (loc) {
      setLatitude(loc.latitude);
      setLongitude(loc.longitude);
      setPlaceName(loc.placeName);
      setLocationStatus('captured');
    } else {
      setLocationStatus('none');
    }
  }, []);

  const removeLocation = useCallback(() => {
    setLatitude(null);
    setLongitude(null);
    setPlaceName(null);
    setLocationStatus('none');
  }, []);

  const handleCamera = useCallback(async () => {
    const photo = await capturePhoto();
    if (photo) setPhotos((prev) => [...prev, photo]);
  }, []);

  const handleGallery = useCallback(async () => {
    const picked = await pickPhotosFromLibrary();
    if (picked.length > 0) setPhotos((prev) => [...prev, ...picked]);
  }, []);

  const removePhoto = useCallback((uri: string) => {
    setPhotos((prev) => prev.filter((p) => p.uri !== uri));
  }, []);

  const validate = useCallback((): string | null => {
    if (!amountText) return t('expense.errors.amountRequired');
    if (amountValue <= 0) return t('expense.errors.amountInvalid');
    if (!categoryId) return t('expense.errors.categoryRequired');
    if (!isValidIsoDate(expenseDate)) return t('expense.errors.dateInvalid');
    if (!isValidTime(expenseTime)) return t('expense.errors.timeInvalid');
    if (isSpread) {
      if (!isValidIsoDate(spreadStart) || !isValidIsoDate(spreadEnd)) {
        return t('expense.errors.dateInvalid');
      }
      if (spreadEnd < spreadStart) return t('expense.errors.spreadRangeInvalid');
    }
    return null;
  }, [amountText, amountValue, categoryId, expenseDate, expenseTime, isSpread, spreadEnd, spreadStart, t]);

  const handleSave = useCallback(
    async (options: { thenShare?: boolean } = {}) => {
      setError(null);
      if (!user) {
        setError(t('expense.errors.notSignedIn'));
        return;
      }
      if (!trip || !tripId) return;
      const validationError = validate();
      if (validationError) {
        setError(validationError);
        return;
      }

      setSaving(true);
      try {
        const signedAmount = isRefund ? -Math.abs(amountValue) : amountValue;
        const signedConverted = isRefund
          ? -Math.abs(convertedAmount)
          : convertedAmount;

        if (isEditing && expenseId) {
          await updateExpenseInStore({
            id: expenseId,
            amount: signedAmount,
            currency,
            convertedAmount: signedConverted,
            exchangeRate,
            categoryId: categoryId as string,
            note: note.trim() || null,
            paymentMethod,
            latitude,
            longitude,
            placeName,
            expenseDate,
            expenseTime: normalizeTime(expenseTime),
            isRefund,
            isExcludedFromMetrics: isExcluded,
            spreadStartDate: isSpread ? spreadStart : null,
            spreadEndDate: isSpread ? spreadEnd : null,
          });
        } else {
          const created = await createExpense({
            tripId,
            userId: user.id,
            amount: signedAmount,
            currency,
            convertedAmount: signedConverted,
            exchangeRate,
            categoryId: categoryId as string,
            note: note.trim() || null,
            paymentMethod,
            latitude,
            longitude,
            placeName,
            expenseDate,
            expenseTime: normalizeTime(expenseTime),
            isRefund,
            isExcludedFromMetrics: isExcluded,
            spreadStartDate: isSpread ? spreadStart : null,
            spreadEndDate: isSpread ? spreadEnd : null,
            photos: photos.map((p) => ({ localUri: p.uri })),
          });

          if (options.thenShare) {
            await shareExpense({
              expense: created,
              categoryName: selectedCategory?.name ?? null,
              categoryEmoji: selectedCategory?.emoji ?? null,
              homeCurrency: trip.homeCurrency,
            });
          }
        }

        router.back();
      } catch (e) {
        console.warn('Failed to save expense:', e);
        setError(e instanceof Error ? e.message : t('expense.errors.saveFailed'));
      } finally {
        setSaving(false);
      }
    },
    [
      amountValue,
      categoryId,
      convertedAmount,
      createExpense,
      updateExpenseInStore,
      currency,
      expenseDate,
      expenseId,
      expenseTime,
      exchangeRate,
      isEditing,
      isExcluded,
      isRefund,
      isSpread,
      latitude,
      longitude,
      note,
      paymentMethod,
      photos,
      placeName,
      router,
      selectedCategory,
      spreadEnd,
      spreadStart,
      t,
      trip,
      tripId,
      user,
      validate,
    ],
  );

  if (!tripId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
        <View style={styles.centered}>
          <Text style={{ color: theme.textSecondary }}>{t('trips.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const symbol = currency ? getCurrencySymbol(currency) : '';
  const showConverted = showConvertedPreview;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={[styles.headerButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Text style={[styles.headerButtonText, { color: theme.text }]}>✕</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>
          {isEditing ? t('expense.editTitle') : t('expense.title')}
        </Text>
        {isEditing ? (
          <View style={styles.headerButton} />
        ) : (
          <Pressable
            onPress={() => handleSave({ thenShare: true })}
            disabled={saving}
            hitSlop={8}
            style={[styles.headerButton, { backgroundColor: theme.surface, borderColor: theme.border, opacity: saving ? 0.5 : 1 }]}
          >
            <Text style={[styles.headerButtonText, { color: theme.text }]}>↗</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Amount hero */}
        <View style={styles.amountHero}>
          <Text style={[styles.amountDisplay, { color: theme.text }]}>
            {symbol}
            {amountText || '0'}
          </Text>
          {showConverted ? (
            <>
              <Text style={[styles.converted, { color: theme.textMuted }]}>
                {t('expense.convertedLabel', {
                  amount: formatAmount(convertedAmount, trip!.homeCurrency),
                  currency: trip!.homeCurrency,
                })}
              </Text>
              <RateOverrideChip
                baseCurrency={currency}
                targetCurrency={trip!.homeCurrency}
                rate={exchangeRate}
                isOverridden={manualRate !== null}
                onOverride={setManualRate}
                onResetToAuto={() => setManualRate(null)}
              />
              {rateStatus === 'stale' ? (
                <Text style={[styles.staleHint, { color: theme.orange }]}>
                  {t('currency.converter.stale')}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>

        {/* Currency strip */}
        <Section title={t('expense.currencySection')} theme={theme}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {popularCurrencies.map((c) => {
              const active = c.code === currency;
              return (
                <Pressable
                  key={c.code}
                  onPress={() => {
                    setCurrency(c.code);
                    setManualRate(null);
                    setLockedExchangeRate(null);
                  }}
                  style={[
                    styles.currencyChip,
                    {
                      backgroundColor: active ? theme.accentSoft : theme.surface,
                      borderColor: active ? theme.accent : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.currencyChipText,
                      { color: active ? theme.accent : theme.textSecondary },
                    ]}
                  >
                    {c.code}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setCurrencyPickerOpen(true)}
              style={[
                styles.currencyChip,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.currencyChipText, { color: theme.textSecondary }]}>
                {t('currency.picker.moreChip')}
              </Text>
            </Pressable>
          </ScrollView>
        </Section>

        <CurrencyPickerModal
          visible={currencyPickerOpen}
          selectedCode={currency || null}
          onSelect={(code) => {
            setCurrency(code);
            setManualRate(null);
            setLockedExchangeRate(null);
          }}
          onClose={() => setCurrencyPickerOpen(false)}
        />

        {/* Category */}
        <Section title={t('expense.categorySection')} theme={theme}>
          <CategoryGrid
            categories={orderedCategories}
            selectedId={categoryId}
            onSelect={setCategoryId}
          />
        </Section>

        {/* Note + recent suggestions */}
        <Section title={t('expense.noteSection')} theme={theme}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('expense.notePlaceholder')}
            placeholderTextColor={theme.textMuted}
            style={[
              styles.input,
              { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
            ]}
          />
          {note.length === 0 && recentNotes.length > 0 ? (
            <View>
              <Text style={[styles.microLabel, { color: theme.textMuted }]}>
                {t('expense.recentNotes')}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {recentNotes.map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setNote(n)}
                    style={[
                      styles.noteChip,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                  >
                    <Text style={[styles.noteChipText, { color: theme.textSecondary }]} numberOfLines={1}>
                      {n}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </Section>

        {/* Payment method */}
        <Section title={t('expense.paymentSection')} theme={theme}>
          <View style={styles.paymentRow}>
            {PAYMENT_METHODS.map((m) => {
              const active = paymentMethod === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setPaymentMethod(active ? null : m)}
                  style={[
                    styles.paymentChip,
                    {
                      backgroundColor: active ? theme.accentSoft : theme.surface,
                      borderColor: active ? theme.accent : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.paymentChipText,
                      { color: active ? theme.accent : theme.textSecondary },
                    ]}
                  >
                    {t(`expense.payment${m[0].toUpperCase()}${m.slice(1)}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* Date + time */}
        <Section title={t('expense.dateTimeSection')} theme={theme}>
          <View style={styles.dateTimeRow}>
            <TextInput
              value={expenseDate}
              onChangeText={setExpenseDate}
              placeholder={t('expense.datePlaceholder')}
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              style={[
                styles.input,
                styles.dateInput,
                { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
              ]}
            />
            <TextInput
              value={expenseTime.slice(0, 5)}
              onChangeText={setExpenseTime}
              placeholder={t('expense.timePlaceholder')}
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              style={[
                styles.input,
                styles.timeInput,
                { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
              ]}
            />
          </View>
        </Section>

        {/* Location */}
        <Section title={t('expense.locationSection')} theme={theme}>
          <View
            style={[
              styles.locationCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={{ color: theme.text, flex: 1 }} numberOfLines={1}>
              {locationStatus === 'capturing'
                ? t('expense.locationCapturing')
                : placeName
                  ? `📍 ${placeName}`
                  : latitude != null
                    ? `📍 ${latitude.toFixed(4)}, ${longitude?.toFixed(4)}`
                    : t('expense.locationMissing')}
            </Text>
            <Pressable onPress={refreshLocation} hitSlop={8}>
              <Text style={{ color: theme.accent, fontWeight: '700' }}>
                {t('expense.locationRefresh')}
              </Text>
            </Pressable>
            {latitude != null ? (
              <Pressable onPress={removeLocation} hitSlop={8}>
                <Text style={{ color: theme.textMuted, fontWeight: '600' }}>
                  {t('expense.locationRemove')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Section>

        {/* Advanced toggles */}
        <Section title={t('expense.advancedSection')} theme={theme}>
          <ToggleRow
            label={t('expense.refundToggle')}
            hint={t('expense.refundHint')}
            value={isRefund}
            onChange={setIsRefund}
            theme={theme}
          />
          <ToggleRow
            label={t('expense.excludeToggle')}
            hint={t('expense.excludeHint')}
            value={isExcluded}
            onChange={setIsExcluded}
            theme={theme}
          />
          <ToggleRow
            label={t('expense.spreadToggle')}
            hint={t('expense.spreadHint')}
            value={isSpread}
            onChange={(v) => {
              setIsSpread(v);
              if (v && !spreadStart) setSpreadStart(expenseDate);
              if (v && !spreadEnd) setSpreadEnd(expenseDate);
            }}
            theme={theme}
          />
          {isSpread ? (
            <View style={styles.dateTimeRow}>
              <TextInput
                value={spreadStart}
                onChangeText={setSpreadStart}
                placeholder={t('expense.datePlaceholder')}
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                style={[
                  styles.input,
                  styles.dateInput,
                  { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
                ]}
              />
              <TextInput
                value={spreadEnd}
                onChangeText={setSpreadEnd}
                placeholder={t('expense.datePlaceholder')}
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                style={[
                  styles.input,
                  styles.dateInput,
                  { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
                ]}
              />
            </View>
          ) : null}
        </Section>

        {/* Photos — not editable in edit mode for now */}
        {!isEditing ? (
        <Section title={t('expense.photosSection')} theme={theme}>
          <View style={styles.photoButtonRow}>
            <Pressable
              onPress={handleCamera}
              style={[
                styles.photoButton,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Text style={{ color: theme.text, fontWeight: '600' }}>
                📷 {t('expense.photosCamera')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleGallery}
              style={[
                styles.photoButton,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Text style={{ color: theme.text, fontWeight: '600' }}>
                🖼️ {t('expense.photosGallery')}
              </Text>
            </Pressable>
          </View>
          {photos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
              {photos.map((p) => (
                <Pressable
                  key={p.uri}
                  onLongPress={() => {
                    Alert.alert('Remove photo?', '', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => removePhoto(p.uri) },
                    ]);
                  }}
                >
                  <Image source={{ uri: p.uri }} style={styles.photoThumb} />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </Section>
        ) : null}

        {error ? (
          <Text style={[styles.error, { color: theme.red }]}>{error}</Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.bg, borderTopColor: theme.border }]}>
        <NumPad onKeyPress={handleKey} onLongBackspace={handleLongBackspace} disabled={saving} />
        <Pressable
          onPress={() => handleSave()}
          disabled={saving}
          style={[styles.saveButton, { backgroundColor: theme.accent, opacity: saving ? 0.7 : 1 }]}
        >
          <Text style={styles.saveButtonText}>
            {saving ? t('expense.saving') : t('expense.save')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Section({
  title,
  theme,
  children,
}: {
  title: string;
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
  theme,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
        {hint ? (
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>{hint}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.accent, false: theme.border }}
        thumbColor={theme.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  headerButtonText: { fontSize: 18, fontWeight: '600' },
  title: { ...typography.screenTitle, flex: 1, textAlign: 'center' },
  content: { padding: spacing.base, paddingBottom: spacing.xxl, gap: spacing.base },
  amountHero: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  amountDisplay: { ...typography.entryAmount },
  converted: { ...typography.subtitle },
  staleHint: { ...typography.caption, marginTop: 4 },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.micro, marginBottom: 2 },
  chipRow: { gap: spacing.sm, paddingVertical: 4 },
  currencyChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: sizing.radiusChip,
    borderWidth: 1.5,
  },
  currencyChipText: { fontSize: 12, fontWeight: '700' },
  input: {
    borderRadius: sizing.radiusInput,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  microLabel: { ...typography.micro, marginTop: spacing.xs, marginBottom: spacing.xs },
  noteChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: sizing.radiusChip,
    borderWidth: 1,
    maxWidth: 220,
  },
  noteChipText: { fontSize: 13, fontWeight: '500' },
  paymentRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  paymentChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: sizing.radiusChip,
    borderWidth: 1.5,
  },
  paymentChipText: { fontSize: 13, fontWeight: '700' },
  dateTimeRow: { flexDirection: 'row', gap: spacing.sm },
  dateInput: { flex: 2 },
  timeInput: { flex: 1 },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: sizing.radiusButton,
    borderWidth: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  photoButtonRow: { flexDirection: 'row', gap: spacing.sm },
  photoButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: sizing.radiusButton,
    borderWidth: 1.5,
  },
  photoRow: { gap: spacing.sm, paddingVertical: 4 },
  photoThumb: { width: 72, height: 72, borderRadius: sizing.radiusSmall },
  error: { ...typography.caption, textAlign: 'center' },
  footer: {
    padding: spacing.base,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
  },
  saveButton: {
    borderRadius: sizing.radiusButton,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
});
