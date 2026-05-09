import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

import { CURRENCIES, currencyForCountryCode } from '@/constants/currencies';
import {
  categoryUsageForTrip,
  getRecentNotes,
  lastUsedPaymentMethodForTrip,
  type RecentNoteSuggestion,
} from '@/db/queries/expenseAnalytics';
import { getExpense } from '@/db/queries/expenses';
import {
  getSplitsForExpense,
  type CreateSplitInput,
} from '@/db/queries/expenseSplits';
import { getProfileName } from '@/db/queries/profiles';
import { getTrip, listTripMembers } from '@/db/queries/trips';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { useTranslation } from '@/hooks/useTranslation';
import { captureCurrentLocation } from '@/services/locationService';
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
import { getCategoryDisplayName } from '@/utils/category';
import { roundAmount } from '@/utils/currency';
import { isValidIsoDate, todayIsoDate } from '@/utils/date';
import { shareExpense } from '@/utils/share';

export type SplitMode = 'equal' | 'custom';
export type LocationStatus = 'idle' | 'capturing' | 'captured' | 'none';
export type ActiveInput = 'numpad' | 'text' | null;

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['credit', 'cash', 'debit'];

export interface PersistedPhoto {
  id: string;
  localUri: string;
}

export interface SaveOptions {
  thenShare?: boolean;
  persistedPhotos?: PersistedPhoto[];
}

export interface UseExpenseEntryFormOptions {
  tripId: string | undefined;
  expenseId: string | undefined;
  onComplete: () => void;
}

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

export function useExpenseEntryForm(opts: UseExpenseEntryFormOptions) {
  const { tripId, expenseId, onComplete } = opts;
  const { t } = useTranslation();
  const isEditing = Boolean(expenseId);

  const user = useAuthStore((s) => s.user);
  const allCategories = useCategoryStore((s) => s.categories);
  const createExpense = useExpenseStore((s) => s.createExpense);
  const updateExpenseInStore = useExpenseStore((s) => s.updateExpense);
  const favoriteCurrencies = useSettingsStore((s) => s.favoriteCurrencies);
  const toggleFavoriteCurrency = useSettingsStore((s) => s.toggleFavoriteCurrency);

  // Trip context
  const [trip, setTrip] = useState<Trip | null>(null);
  const [isSharedTrip, setIsSharedTrip] = useState(false);
  const [tripMembers, setTripMembers] = useState<TripMember[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});

  // Amount + currency
  const [amountText, setAmountText] = useState('');
  const [currency, setCurrency] = useState<string>('');
  const [manualRate, setManualRate] = useState<number | null>(null);
  // Only relevant in edit mode: preserve the exchange rate the expense was
  // originally booked at. PRD.md — historical values must not drift.
  const [lockedExchangeRate, setLockedExchangeRate] = useState<number | null>(null);
  // True once the user has actively picked a currency (chip or picker).
  // Stops the async location-derived auto-pick from clobbering their choice
  // if reverse-geocoding finishes after they already tapped something.
  const userPickedCurrencyRef = useRef(false);

  // Category
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [categoryUsage, setCategoryUsage] =
    useState<Map<string, { count: number; lastUsed: string }>>(new Map());

  // Note + recent suggestions
  const [note, setNote] = useState('');
  const [recentNotes, setRecentNotes] = useState<RecentNoteSuggestion[]>([]);

  // Date / time / spread
  const [expenseDate, setExpenseDate] = useState(todayIsoDate());
  const [expenseTime, setExpenseTime] = useState(currentTime());
  const [isSpread, setIsSpread] = useState(false);
  const [spreadStart, setSpreadStart] = useState('');
  const [spreadEnd, setSpreadEnd] = useState('');

  // Payment / location
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);

  // Toggles
  const [isRefund, setIsRefund] = useState(false);
  const [isExcluded, setIsExcluded] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  // Split
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [splitParticipants, setSplitParticipants] = useState<Set<string>>(new Set());
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});

  // UI/save state
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Which "input" owns the bottom of the screen. The custom numpad and the
  // system keyboard must be mutually exclusive — when a TextInput gains
  // focus we hide the numpad, and tapping the amount hero dismisses the
  // system keyboard. Default to numpad because the amount is the typical
  // first interaction.
  const [activeInput, setActiveInput] = useState<ActiveInput>('numpad');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

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
          // location-capture effect will overwrite this with the
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

  const orderedCategories = useMemo(() => {
    const list = selectCategoriesForTrip(allCategories, tripId ?? null);
    return orderCategoriesByUsage(list, categoryUsage);
  }, [allCategories, tripId, categoryUsage]);

  const selectedCategory = useMemo(
    () => orderedCategories.find((c) => c.id === categoryId) ?? null,
    [orderedCategories, categoryId],
  );

  const visibleCategories = useMemo(
    () => (categoriesExpanded ? orderedCategories : orderedCategories.slice(0, 8)),
    [orderedCategories, categoriesExpanded],
  );
  const hasMoreCategories = orderedCategories.length > 8;

  const amountValue = useMemo(() => {
    if (!amountText) return 0;
    const n = Number(amountText);
    return Number.isFinite(n) ? n : 0;
  }, [amountText]);

  const { rate: fetchedRate, status: rateStatus } = useExchangeRate(
    currency || null,
    trip?.homeCurrency || null,
    expenseDate,
  );
  // Priority: manual override > locked (edit mode) > fetched > 1.
  const exchangeRate = manualRate ?? lockedExchangeRate ?? fetchedRate ?? 1;
  const convertedAmount = amountValue * exchangeRate;
  const showConvertedPreview = Boolean(
    trip && currency && currency !== trip.homeCurrency,
  );

  // Strip = the user's favorites in their saved order, plus the current
  // selection if it's not already favorited.
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
        result[ids[0]] = roundAmount(result[ids[0]] + remainder);
      }
    }
    return result;
  }, [splitEnabled, splitMode, splitParticipants, amountValue, user]);

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

  // Tapping a suggestion fills the note and pre-selects the category from
  // its most recent use.
  const pickRecentNote = useCallback((s: RecentNoteSuggestion) => {
    setNote(s.note);
    setCategoryId(s.categoryId);
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

  const pickCurrency = useCallback((code: string) => {
    userPickedCurrencyRef.current = true;
    setCurrency(code);
    setManualRate(null);
    setLockedExchangeRate(null);
  }, []);

  const enterSpread = useCallback(() => {
    setIsSpread(true);
    setSpreadStart((prev) => prev || expenseDate);
    setSpreadEnd((prev) => prev || expenseDate);
  }, [expenseDate]);

  const exitSpread = useCallback(() => {
    setIsSpread(false);
    setSpreadStart('');
    setSpreadEnd('');
  }, []);

  const handleSpreadRangeChange = useCallback((start: string, end: string) => {
    setSpreadStart(start);
    setSpreadEnd(end);
    // Per spec: expense_date stays in sync with spread_start_date.
    setExpenseDate(start);
  }, []);

  const toggleSplit = useCallback((v: boolean) => {
    setSplitEnabled(v);
    if (!v) {
      setSplitParticipants(new Set());
      setCustomAmounts({});
      setSplitMode('equal');
    }
  }, []);

  const toggleSplitParticipant = useCallback((userId: string) => {
    setSplitParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const setCustomAmount = useCallback((userId: string, value: string) => {
    setCustomAmounts((prev) => ({ ...prev, [userId]: value }));
  }, []);

  const splitRest = useCallback(() => {
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
    // Zero is a valid share — including the row tells partner devices "you're
    // a participant whose share is 0", versus a missing row meaning "you're
    // not part of this split".
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

  const save = useCallback(
    async (options: SaveOptions = {}) => {
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
              photos: options.persistedPhotos ?? [],
            },
            splitEnabled ? splitsForSave : null,
          );

          if (options.thenShare) {
            await shareExpense({
              expense: created,
              categoryName: selectedCategory ? getCategoryDisplayName(selectedCategory, t) : null,
              categoryEmoji: selectedCategory?.emoji ?? null,
              homeCurrency: trip.homeCurrency,
            });
          }
        }

        onComplete();
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
      onComplete,
      paymentMethod,
      placeName,
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

  return {
    // Identity
    isEditing,
    user,

    // Trip context
    trip,
    isSharedTrip,
    tripMembers,
    memberNames,

    // Amount + currency
    amountText,
    setAmountText,
    amountValue,
    currency,
    pickCurrency,
    stripCurrencies,
    favoriteCodesSet,
    toggleFavoriteCurrency,
    manualRate,
    setManualRate,
    exchangeRate,
    rateStatus,
    convertedAmount,
    showConvertedPreview,

    // Category
    categoryId,
    setCategoryId,
    selectedCategory,
    visibleCategories,
    hasMoreCategories,
    categoriesExpanded,
    setCategoriesExpanded,

    // Note
    note,
    setNote,
    filteredNotes,
    pickRecentNote,

    // Date / time / spread
    expenseDate,
    setExpenseDate,
    expenseTime,
    setExpenseTime,
    isSpread,
    spreadStart,
    spreadEnd,
    enterSpread,
    exitSpread,
    handleSpreadRangeChange,

    // Payment
    paymentMethod,
    setPaymentMethod,

    // Location
    locationStatus,
    latitude,
    longitude,
    placeName,
    refreshLocation,
    removeLocation,

    // Toggles
    isRefund,
    setIsRefund,
    isExcluded,
    setIsExcluded,
    isPrivate,
    setIsPrivate,

    // Split
    splitEnabled,
    toggleSplit,
    splitMode,
    setSplitMode,
    splitParticipants,
    toggleSplitParticipant,
    customAmounts,
    setCustomAmount,
    equalShares,
    customAssigned,
    customMatchesTotal,
    splitRest,

    // Active input / numpad
    activeInput,
    setActiveInput,
    keyboardHeight,
    handleAmountPress,
    handleTextFocus,
    handleNumpadDone,

    // Save
    formIsValid,
    error,
    saving,
    save,
  };
}

export type ExpenseEntryForm = ReturnType<typeof useExpenseEntryForm>;
