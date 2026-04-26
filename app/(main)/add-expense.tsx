import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  I18nManager,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryGrid } from '@/components/expense/CategoryGrid';
import { NumPad, appendNumPadKey, type NumPadKey } from '@/components/expense/NumPad';
import { CurrencyPickerModal } from '@/components/currency/CurrencyPickerModal';
import { RateOverrideChip } from '@/components/currency/RateOverrideChip';
import { KeyboardAwareWrapper } from '@/components/ui/KeyboardAwareWrapper';
import { CURRENCIES, currencyForCountryCode } from '@/constants/currencies';
import { sizing, spacing, typography } from '@/constants/theme';
import {
  categoryUsageForTrip,
  getExpense,
  getRecentNotes,
  lastUsedPaymentMethodForTrip,
  type RecentNoteSuggestion,
} from '@/db/queries/expenses';
import {
  getSplitsForExpense,
  type CreateSplitInput,
} from '@/db/queries/expenseSplits';
import { getProfileName } from '@/db/queries/profiles';
import { getTrip, listTripMembers } from '@/db/queries/trips';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { captureCurrentLocation } from '@/services/locationService';
import {
  capturePhoto,
  pickPhotosFromLibrary,
  processAndPersistPhoto,
} from '@/services/photoService';
import { useAuthStore } from '@/stores/authStore';
import {
  selectCategoriesForTrip,
  useCategoryStore,
} from '@/stores/categoryStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Category } from '@/types/category';
import type { PaymentMethod } from '@/types/expense';
import type { Trip, TripMember } from '@/types/trip';
import { formatAmount, getCurrencySymbol, roundAmount } from '@/utils/currency';
import { isValidIsoDate, todayIsoDate } from '@/utils/date';
import { newId } from '@/utils/id';
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
  const favoriteCurrencies = useSettingsStore((s) => s.favoriteCurrencies);
  const toggleFavoriteCurrency = useSettingsStore((s) => s.toggleFavoriteCurrency);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [isSharedTrip, setIsSharedTrip] = useState(false);
  const [tripMembers, setTripMembers] = useState<TripMember[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
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
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSpread, setIsSpread] = useState(false);
  const [spreadStart, setSpreadStart] = useState('');
  const [spreadEnd, setSpreadEnd] = useState('');
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [splitParticipants, setSplitParticipants] = useState<Set<string>>(new Set());
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Array<{ uri: string }>>([]);
  const [recentNotes, setRecentNotes] = useState<RecentNoteSuggestion[]>([]);
  const [categoryUsage, setCategoryUsage] =
    useState<Map<string, { count: number; lastUsed: string }>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Which "input" owns the bottom of the screen. The custom numpad and the
  // system keyboard must be mutually exclusive — when a TextInput gains
  // focus we hide the numpad, and tapping the amount hero dismisses the
  // system keyboard. Default to numpad because the amount is the typical
  // first interaction.
  const [activeInput, setActiveInput] = useState<'numpad' | 'text' | null>(
    'numpad',
  );
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();
  // Only relevant in edit mode: preserve the exchange rate the expense was
  // originally booked at. PRD.md — historical values must not drift with
  // live rates.
  const [lockedExchangeRate, setLockedExchangeRate] = useState<number | null>(
    null,
  );
  const [manualRate, setManualRate] = useState<number | null>(null);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  // True once the user has actively picked a currency (chip or picker).
  // Stops the async location-derived auto-pick from clobbering their choice
  // if reverse-geocoding finishes after they already tapped something.
  const userPickedCurrencyRef = useRef(false);

  // Load trip + recent-note / payment / usage data up front.
  useEffect(() => {
    if (!tripId) return;
    if (!user?.id) return;
    let cancelled = false;
    const userId = user.id;
    (async () => {
      try {
        const [loadedTrip, notes, lastPayment, usage, members] = await Promise.all([
          getTrip(tripId),
          getRecentNotes(tripId, userId),
          lastUsedPaymentMethodForTrip(tripId),
          categoryUsageForTrip(tripId),
          listTripMembers(tripId),
        ]);
        if (cancelled) return;
        if (loadedTrip) {
          setTrip(loadedTrip);
          // Initial fallback while waiting for location to resolve. The
          // location-capture effect below will overwrite this with the
          // location-derived currency unless the user picks one first.
          if (!isEditing && !userPickedCurrencyRef.current) {
            setCurrency((prev) => prev || loadedTrip.homeCurrency);
          }
        }
        setRecentNotes(notes);
        if (!isEditing && lastPayment) setPaymentMethod(lastPayment);
        setCategoryUsage(usage);
        const joined = members.filter((m) => m.joinedAt !== null);
        setTripMembers(joined);
        setIsSharedTrip(joined.length > 1);
        // Resolve names for the split UI / who-paid label.
        const nameEntries = await Promise.all(
          joined.map(async (m) => [m.userId, (await getProfileName(m.userId)) ?? ''] as const),
        );
        if (cancelled) return;
        const namesMap: Record<string, string> = {};
        for (const [uid, name] of nameEntries) namesMap[uid] = name;
        setMemberNames(namesMap);
      } catch (e) {
        console.warn('Failed to load add-expense context:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, isEditing, user?.id]);

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
      setIsExcluded(existing.isExcludedFromDailyMetrics);
      setIsPrivate(existing.isPrivate);
      if (existing.spreadStartDate && existing.spreadEndDate) {
        setIsSpread(true);
        setSpreadStart(existing.spreadStartDate);
        setSpreadEnd(existing.spreadEndDate);
      }
      setLockedExchangeRate(existing.exchangeRate);

      if (existing.isSplit) {
        const splits = await getSplitsForExpense(existing.id);
        if (cancelled) return;
        if (splits.length > 0) {
          setSplitEnabled(true);
          const participants = new Set<string>(splits.map((s) => s.userId));
          setSplitParticipants(participants);
          // Detect equal vs custom: equal if every share is within 1 cent of total/N.
          const total = Math.abs(existing.amount);
          const equalShare = total / splits.length;
          const isEqual = splits.every(
            (s) => Math.abs(s.amount - equalShare) < 0.02,
          );
          setSplitMode(isEqual ? 'equal' : 'custom');
          const amounts: Record<string, string> = {};
          for (const s of splits) {
            amounts[s.userId] = s.amount.toFixed(2);
          }
          setCustomAmounts(amounts);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  // Auto-capture GPS once on mount. Non-blocking — user can proceed without it.
  // Skipped in edit mode so we don't overwrite the original pin.
  // When location resolves, derive a currency from the country code and
  // adopt it, unless the user has already picked one manually.
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
        const derived = currencyForCountryCode(loc.countryCode);
        if (derived && !userPickedCurrencyRef.current) {
          setCurrency(derived);
          setManualRate(null);
        }
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

  // Strip = the user's favorites in their saved order, plus the current
  // selection if it's not already favorited (so a location-derived or
  // edit-mode currency stays visible/highlighted).
  const stripCurrencies = useMemo(() => {
    const seen = new Set<string>();
    const codes: string[] = [];
    for (const code of favoriteCurrencies) {
      if (!seen.has(code)) {
        seen.add(code);
        codes.push(code);
      }
    }
    if (currency && !seen.has(currency)) {
      seen.add(currency);
      codes.push(currency);
    }
    return codes
      .map((code) => CURRENCIES.find((c) => c.code === code))
      .filter((c): c is (typeof CURRENCIES)[number] => Boolean(c));
  }, [favoriteCurrencies, currency]);

  const favoriteCodesSet = useMemo(
    () => new Set(favoriteCurrencies),
    [favoriteCurrencies],
  );

  // Live-filtered suggestions: when empty, show most recent; while typing,
  // narrow by case-insensitive substring. Capped at 10.
  const filteredNotes = useMemo<RecentNoteSuggestion[]>(() => {
    const q = note.trim().toLowerCase();
    if (!q) return recentNotes.slice(0, 10);
    return recentNotes
      .filter((s) => s.note.toLowerCase().includes(q))
      .slice(0, 10);
  }, [note, recentNotes]);

  // Tapping a suggestion fills the note and pre-selects the category from
  // its most recent use. The user can still tap the grid to override.
  const handlePickRecentNote = useCallback((s: RecentNoteSuggestion) => {
    setNote(s.note);
    setCategoryId(s.categoryId);
  }, []);

  const handleKey = useCallback((key: NumPadKey) => {
    setAmountText((current) => appendNumPadKey(current, key));
  }, []);

  const handleAmountPress = useCallback(() => {
    Keyboard.dismiss();
    setActiveInput('numpad');
  }, []);

  const handleTextFocus = useCallback(() => {
    setActiveInput('text');
  }, []);

  const handleNumpadDone = useCallback(() => {
    setActiveInput(null);
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

  // Track keyboard height so the floating Save FAB can sit just above it
  // when a TextInput is focused. The KeyboardAvoidingView handles content,
  // but the absolutely-positioned FAB needs its own offset.
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Auto-disable the split toggle whenever an exclusive flag turns on.
  useEffect(() => {
    if ((isRefund || isPrivate) && splitEnabled) {
      setSplitEnabled(false);
      setSplitParticipants(new Set());
      setCustomAmounts({});
      setSplitMode('equal');
    }
  }, [isRefund, isPrivate, splitEnabled]);

  // Default participants to "everyone" the first time the split toggle goes on.
  useEffect(() => {
    if (!splitEnabled) return;
    if (splitParticipants.size === 0 && tripMembers.length > 0) {
      setSplitParticipants(new Set(tripMembers.map((m) => m.userId)));
    }
  }, [splitEnabled, splitParticipants.size, tripMembers]);

  // Equal-mode shares with rounding remainder absorbed by the payer.
  const equalShares = useMemo<Record<string, number>>(() => {
    if (!splitEnabled || splitMode !== 'equal') return {};
    const ids = Array.from(splitParticipants);
    if (ids.length === 0 || amountValue <= 0) return {};
    const total = amountValue;
    const per = Math.floor((total / ids.length) * 100) / 100;
    const result: Record<string, number> = {};
    for (const id of ids) result[id] = per;
    const distributed = roundAmount(per * ids.length);
    const remainder = roundAmount(total - distributed);
    if (Math.abs(remainder) > 0 && user) {
      const payerId = user.id;
      if (result[payerId] !== undefined) {
        result[payerId] = roundAmount(result[payerId] + remainder);
      } else {
        // Edge case: payer somehow isn't a participant — give it to first one.
        result[ids[0]] = roundAmount(result[ids[0]] + remainder);
      }
    }
    return result;
  }, [splitEnabled, splitMode, splitParticipants, amountValue, user]);

  // Sum of parsed custom inputs.
  const customAssigned = useMemo(() => {
    if (!splitEnabled || splitMode !== 'custom') return 0;
    let sum = 0;
    for (const member of tripMembers) {
      const raw = customAmounts[member.userId] ?? '';
      const n = Number(raw);
      if (Number.isFinite(n)) sum += n;
    }
    return roundAmount(sum);
  }, [splitEnabled, splitMode, tripMembers, customAmounts]);

  const customMatchesTotal =
    splitMode === 'custom' && Math.abs(customAssigned - amountValue) < 0.01;

  const handleSplitRest = useCallback(() => {
    if (!splitEnabled || splitMode !== 'custom') return;
    const total = amountValue;
    if (total <= 0) return;
    const remainder = roundAmount(total - customAssigned);
    if (remainder <= 0) return;
    const zeroIds = tripMembers
      .map((m) => m.userId)
      .filter((id) => {
        const raw = customAmounts[id] ?? '';
        const n = Number(raw);
        return !Number.isFinite(n) || n === 0;
      });
    if (zeroIds.length === 0) return;
    const per = Math.floor((remainder / zeroIds.length) * 100) / 100;
    const next: Record<string, string> = { ...customAmounts };
    let distributed = 0;
    for (const id of zeroIds) {
      next[id] = per.toFixed(2);
      distributed = roundAmount(distributed + per);
    }
    const leftover = roundAmount(remainder - distributed);
    if (Math.abs(leftover) > 0) {
      const last = zeroIds[zeroIds.length - 1];
      next[last] = roundAmount(per + leftover).toFixed(2);
    }
    setCustomAmounts(next);
  }, [splitEnabled, splitMode, amountValue, customAssigned, tripMembers, customAmounts]);

  const buildSplitsForSave = useCallback((): CreateSplitInput[] | null => {
    if (!splitEnabled || !user) return null;
    if (splitMode === 'equal') {
      const ids = Array.from(splitParticipants);
      if (ids.length < 2) return null;
      return ids.map((userId) => ({
        userId,
        amount: equalShares[userId] ?? 0,
        isPayer: userId === user.id,
      }));
    }
    // custom mode: save every listed member with their assigned amount.
    // Zero is a valid share ("this person owes nothing") — including the row
    // is what tells partner devices "you're a participant whose share is 0",
    // versus a missing row which means "you're not part of this split".
    return tripMembers.map((m) => {
      const raw = customAmounts[m.userId] ?? '';
      const n = Number(raw);
      const amount = Number.isFinite(n) ? roundAmount(n) : 0;
      return { userId: m.userId, amount, isPayer: m.userId === user.id };
    });
  }, [splitEnabled, splitMode, splitParticipants, equalShares, customAmounts, tripMembers, user]);

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
    if (splitEnabled) {
      if (splitMode === 'equal') {
        if (splitParticipants.size < 2) return t('split.minMembers');
      } else if (!customMatchesTotal) {
        return t('split.amountMismatch');
      }
    }
    return null;
  }, [
    amountText,
    amountValue,
    categoryId,
    expenseDate,
    expenseTime,
    isSpread,
    spreadEnd,
    spreadStart,
    splitEnabled,
    splitMode,
    splitParticipants.size,
    customMatchesTotal,
    t,
  ]);

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

        const splitsForSave = buildSplitsForSave();

        if (isEditing && expenseId) {
          await updateExpenseInStore(
            {
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
              isExcludedFromDailyMetrics: isExcluded,
              isPrivate,
              isSplit: splitEnabled && splitsForSave !== null,
              spreadStartDate: isSpread ? spreadStart : null,
              spreadEndDate: isSpread ? spreadEnd : null,
            },
            splitEnabled ? splitsForSave : null,
          );
        } else {
          // Resize, recompress, and copy each picked photo into the document
          // directory before persisting. Picker URIs live in the OS temp
          // cache and can be evicted; the durable copy is what we sync.
          const persistedPhotos = await Promise.all(
            photos.map(async (p) => {
              const photoId = newId();
              const localUri = await processAndPersistPhoto(p.uri, photoId);
              return { id: photoId, localUri };
            }),
          );
          const created = await createExpense(
            {
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
              isExcludedFromDailyMetrics: isExcluded,
              isPrivate,
              isSplit: splitEnabled && splitsForSave !== null,
              spreadStartDate: isSpread ? spreadStart : null,
              spreadEndDate: isSpread ? spreadEnd : null,
              photos: persistedPhotos,
            },
            splitEnabled ? splitsForSave : null,
          );

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
      buildSplitsForSave,
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
      isPrivate,
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
      splitEnabled,
      spreadEnd,
      spreadStart,
      t,
      trip,
      tripId,
      user,
      validate,
    ],
  );

  const formIsValid = amountValue > 0 && categoryId !== null;

  // Floating Save FAB rides above whatever is at the bottom: numpad bar,
  // system keyboard, or just the safe-area edge.
  const fabBottomOffset = useMemo(() => {
    if (activeInput === 'numpad') {
      // Numpad bar height: 4 rows * 50 key + 3 gaps * 6 + paddings.
      return NUMPAD_BAR_HEIGHT + spacing.lg;
    }
    if (activeInput === 'text' && keyboardHeight > 0) {
      return keyboardHeight + spacing.lg;
    }
    return Math.max(insets.bottom, spacing.md) + spacing.lg;
  }, [activeInput, keyboardHeight, insets.bottom]);

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
        <View style={styles.headerButton} />
      </View>

      <KeyboardAwareWrapper hasFixedBottom>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Amount hero — pressing it brings up the numpad and dismisses
            the system keyboard, so the two are never visible together. */}
        <Pressable onPress={handleAmountPress} style={styles.amountHero}>
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
        </Pressable>

        {/* Currency strip */}
        <Section title={t('expense.currencySection')} theme={theme}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {stripCurrencies.map((c) => {
              const active = c.code === currency;
              return (
                <Pressable
                  key={c.code}
                  onPress={() => {
                    userPickedCurrencyRef.current = true;
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
            userPickedCurrencyRef.current = true;
            setCurrency(code);
            setManualRate(null);
            setLockedExchangeRate(null);
          }}
          onClose={() => setCurrencyPickerOpen(false)}
          favoriteCodes={favoriteCodesSet}
          onToggleFavorite={toggleFavoriteCurrency}
          homeCurrency={trip?.homeCurrency ?? ''}
        />

        {/* Note + recent suggestions — placed above category so picking a
            suggestion can auto-select the category visible in the grid below. */}
        <Section title={t('expense.noteSection')} theme={theme}>
          <TextInput
            value={note}
            onChangeText={setNote}
            onFocus={handleTextFocus}
            placeholder={t('expense.notePlaceholder')}
            placeholderTextColor={theme.textMuted}
            style={[
              styles.input,
              { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
            ]}
          />
          {filteredNotes.length > 0 ? (
            <View>
              <Text style={[styles.microLabel, { color: theme.textMuted }]}>
                {t('expense.recentNotes')}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {filteredNotes.map((s) => (
                  <Pressable
                    key={s.note}
                    onPress={() => handlePickRecentNote(s)}
                    style={[
                      styles.noteChip,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                  >
                    <Text style={[styles.noteChipText, { color: theme.textSecondary }]} numberOfLines={1}>
                      {s.categoryEmoji} {s.note}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </Section>

        {/* Category */}
        <Section title={t('expense.categorySection')} theme={theme}>
          <CategoryGrid
            categories={orderedCategories}
            selectedId={categoryId}
            onSelect={setCategoryId}
          />
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
              onFocus={handleTextFocus}
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
              onFocus={handleTextFocus}
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
          {isSharedTrip ? (
            <ToggleRow
              label={t('expense.privateToggle')}
              hint={t('expense.privateHint')}
              value={isPrivate}
              onChange={setIsPrivate}
              theme={theme}
            />
          ) : null}
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
                onFocus={handleTextFocus}
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
                onFocus={handleTextFocus}
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
          {isSharedTrip ? (
            <ToggleRow
              label={t('split.toggle')}
              value={splitEnabled}
              onChange={(v) => {
                setSplitEnabled(v);
                if (!v) {
                  setSplitParticipants(new Set());
                  setCustomAmounts({});
                  setSplitMode('equal');
                }
              }}
              theme={theme}
            />
          ) : null}
        </Section>

        {/* Split section — only when toggle is on */}
        {isSharedTrip && splitEnabled ? (
          <Section title={t('split.toggle')} theme={theme}>
            <View style={styles.paymentRow}>
              {(['equal', 'custom'] as const).map((mode) => {
                const active = splitMode === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => setSplitMode(mode)}
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
                      {t(`split.${mode}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {splitMode === 'equal' ? (
              <View style={{ gap: spacing.xs }}>
                {tripMembers.map((m) => {
                  const checked = splitParticipants.has(m.userId);
                  const isPayer = user?.id === m.userId;
                  const share = checked ? equalShares[m.userId] ?? 0 : 0;
                  return (
                    <Pressable
                      key={m.userId}
                      onPress={() => {
                        setSplitParticipants((prev) => {
                          const next = new Set(prev);
                          if (next.has(m.userId)) next.delete(m.userId);
                          else next.add(m.userId);
                          return next;
                        });
                      }}
                      style={[
                        styles.splitMemberRow,
                        {
                          backgroundColor: theme.surface,
                          borderColor: checked ? theme.accent : theme.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.splitCheckbox,
                          {
                            backgroundColor: checked ? theme.accent : 'transparent',
                            borderColor: checked ? theme.accent : theme.border,
                          },
                        ]}
                      >
                        {checked ? (
                          <Text style={styles.splitCheckmark}>✓</Text>
                        ) : null}
                      </View>
                      <Text
                        style={{ color: theme.text, flex: 1, fontWeight: '600' }}
                        numberOfLines={1}
                      >
                        {memberNames[m.userId] || m.userId.slice(0, 6)}
                      </Text>
                      {isPayer ? (
                        <View
                          style={[
                            styles.splitPaidBadge,
                            { backgroundColor: theme.accentSoft },
                          ]}
                        >
                          <Text
                            style={[styles.splitPaidBadgeText, { color: theme.accent }]}
                          >
                            {t('split.paid')}
                          </Text>
                        </View>
                      ) : null}
                      <Text style={{ color: theme.text, fontWeight: '700' }}>
                        {checked && currency ? formatAmount(share, currency) : '—'}
                      </Text>
                    </Pressable>
                  );
                })}
                {splitParticipants.size < 2 ? (
                  <Text style={[styles.error, { color: theme.red }]}>
                    {t('split.minMembers')}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={{ gap: spacing.xs }}>
                {tripMembers.map((m) => {
                  const isPayer = user?.id === m.userId;
                  const value = customAmounts[m.userId] ?? '';
                  return (
                    <View key={m.userId} style={styles.splitCustomRow}>
                      <Text
                        style={{ color: theme.text, flex: 1, fontWeight: '600' }}
                        numberOfLines={1}
                      >
                        {memberNames[m.userId] || m.userId.slice(0, 6)}
                      </Text>
                      {isPayer ? (
                        <View
                          style={[
                            styles.splitPaidBadge,
                            { backgroundColor: theme.accentSoft },
                          ]}
                        >
                          <Text
                            style={[styles.splitPaidBadgeText, { color: theme.accent }]}
                          >
                            {t('split.paid')}
                          </Text>
                        </View>
                      ) : null}
                      <TextInput
                        value={value}
                        onChangeText={(text) =>
                          setCustomAmounts((prev) => ({ ...prev, [m.userId]: text }))
                        }
                        onFocus={handleTextFocus}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={theme.textMuted}
                        style={[
                          styles.splitCustomInput,
                          {
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                            color: theme.text,
                          },
                        ]}
                      />
                    </View>
                  );
                })}
                <View style={styles.splitSummaryRow}>
                  <Text
                    style={{
                      color: customMatchesTotal ? theme.green : theme.red,
                      fontWeight: '700',
                      flex: 1,
                    }}
                  >
                    {currency
                      ? t('split.assigned', {
                          assigned: formatAmount(customAssigned, currency),
                          total: formatAmount(amountValue, currency),
                        })
                      : ''}
                  </Text>
                  {!customMatchesTotal && currency ? (
                    <Text style={{ color: theme.red }}>
                      {t('split.unassigned', {
                        amount: formatAmount(
                          roundAmount(amountValue - customAssigned),
                          currency,
                        ),
                      })}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={handleSplitRest}
                  disabled={
                    customMatchesTotal ||
                    amountValue <= 0 ||
                    customAssigned >= amountValue
                  }
                  style={[
                    styles.paymentChip,
                    {
                      alignSelf: 'flex-start',
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      opacity:
                        customMatchesTotal ||
                        amountValue <= 0 ||
                        customAssigned >= amountValue
                          ? 0.5
                          : 1,
                    },
                  ]}
                >
                  <Text
                    style={[styles.paymentChipText, { color: theme.accent }]}
                  >
                    {t('split.splitRest')}
                  </Text>
                </Pressable>
              </View>
            )}
          </Section>
        ) : null}

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
                    Alert.alert(t('expense.photosRemoveConfirm'), '', [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('common.delete'),
                        style: 'destructive',
                        onPress: () => removePhoto(p.uri),
                      },
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

      {activeInput === 'numpad' ? (
        <View
          style={[
            styles.numpadBar,
            { backgroundColor: theme.bg, borderTopColor: theme.border },
          ]}
        >
          <NumPad
            onKeyPress={handleKey}
            onLongBackspace={handleLongBackspace}
            onDone={handleNumpadDone}
            disabled={saving}
          />
        </View>
      ) : null}

      <Pressable
        onPress={() => handleSave()}
        disabled={!formIsValid || saving}
        style={[
          styles.fab,
          {
            bottom: fabBottomOffset,
            [I18nManager.isRTL ? 'left' : 'right']: spacing.lg,
            shadowColor: theme.accentGlow,
            opacity: !formIsValid || saving ? 0.5 : 1,
          },
        ]}
        accessibilityLabel={t('expense.save')}
      >
        <LinearGradient
          colors={theme.fabGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <Text style={styles.fabIcon}>{saving ? '…' : '✓'}</Text>
        </LinearGradient>
      </Pressable>
      </KeyboardAwareWrapper>
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

// Approx height of the numpad bar: 4 rows × 50px keys + 3 × spacing.sm gaps
// + numpadBar paddings (top spacing.sm + bottom spacing.base).
const NUMPAD_BAR_HEIGHT = 4 * 50 + 3 * spacing.sm + spacing.sm + spacing.base;

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
  content: {
    padding: spacing.base,
    // Make room for the numpad bar (~260px) plus some breathing space so the
    // last form field isn't hidden when scrolled to the bottom.
    paddingBottom: NUMPAD_BAR_HEIGHT + spacing.xxl,
    gap: spacing.base,
  },
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
  splitMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: sizing.radiusButton,
    borderWidth: 1.5,
  },
  splitCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitCheckmark: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  splitPaidBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: sizing.radiusChip,
  },
  splitPaidBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  splitCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  splitCustomInput: {
    minWidth: 100,
    borderRadius: sizing.radiusInput,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  splitSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
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
  numpadBar: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
  },
  fab: {
    position: 'absolute',
    width: sizing.fabSize,
    height: sizing.fabSize,
    borderRadius: sizing.fabRadius,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 10,
  },
  fabInner: {
    flex: 1,
    borderRadius: sizing.fabRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
});
