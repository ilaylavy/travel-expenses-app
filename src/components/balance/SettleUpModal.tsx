// SettleUpModal — record a debt-settlement payment between two trip members.
//
// Entry: opened by tapping "Settle up" on a pair card in the Balances screen.
// Payer/receiver are locked at entry time; the suggested amount is the
// current net pair debt in home currency, converted to the chosen settlement
// currency. exchange_rate is locked when the user submits — same rate-lock
// pattern as expenses.

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarPickerModal } from '@/components/ui/CalendarPickerModal';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { fetchRate } from '@/services/exchangeRates';
import { useSettlementStore } from '@/stores/settlementStore';
import {
  formatAmount,
  roundAmount,
  roundRate,
  todayDateString,
} from '@/utils/currency';
import { formatReadableDate } from '@/utils/date';

type CurrencyChoice = 'trip' | 'home';

interface SettleUpModalProps {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  // Trip's local currency (baseCurrency) and the user-facing reporting
  // currency (homeCurrency). If they match, the toggle is hidden.
  tripCurrency: string;
  homeCurrency: string;
  // The current net pair debt in home currency, OR for per-expense settle,
  // the share's home-currency value. Prefill source for the amount input.
  // 0 means no outstanding debt (ad-hoc payment).
  suggestedHomeAmount: number;
  // When set, this settlement attributes to a specific expense_splits row.
  // The amount input is rendered read-only (currency toggle still works);
  // submit writes the FK so balance.ts removes that split from gross debt
  // rather than netting via inverse-debt.
  lockedExpenseSplitId?: string;
}

export function SettleUpModal({
  visible,
  onClose,
  tripId,
  fromUserId,
  toUserId,
  fromName,
  toName,
  tripCurrency,
  homeCurrency,
  suggestedHomeAmount,
  lockedExpenseSplitId,
}: SettleUpModalProps) {
  const amountLocked = lockedExpenseSplitId !== undefined;
  const theme = useTheme();
  const { t } = useTranslation();
  const createSettlement = useSettlementStore((s) => s.createSettlement);

  const sameCurrency = tripCurrency === homeCurrency;
  const [currency, setCurrency] = useState<CurrencyChoice>(
    sameCurrency ? 'home' : 'trip',
  );
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(todayDateString());
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Cached rate from tripCurrency → homeCurrency. Fetched once when the
  // modal opens. Used to convert between display currencies and to lock the
  // exchange_rate on the saved settlement row.
  const [rate, setRate] = useState<number | null>(null);

  // Reset state every time the modal becomes visible so a prior session
  // doesn't bleed in.
  useEffect(() => {
    if (!visible) return;
    setCurrency(sameCurrency ? 'home' : 'trip');
    setDate(todayDateString());
    setNote('');
    setError(null);
    setIsSubmitting(false);
    setRate(null);

    if (sameCurrency) {
      // Rate is irrelevant — both currencies are the same. amount input
      // pre-fills with the suggested home-currency amount directly.
      setAmount(suggestedHomeAmount > 0 ? suggestedHomeAmount.toFixed(2) : '');
      setRate(1);
      return;
    }

    // Fetch tripCurrency → homeCurrency. The rate is direction-stable: 1
    // trip = rate home. We use its inverse to convert a home-currency
    // suggested amount into trip-currency.
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchRate(tripCurrency, homeCurrency);
        if (cancelled) return;
        if (!result) {
          setError(t('settleUp.rateUnavailable'));
          return;
        }
        setRate(result.rate);
        // Default: enter in trip currency. Convert suggested home amount
        // into trip currency for the prefill.
        if (suggestedHomeAmount > 0) {
          const tripAmount = roundAmount(suggestedHomeAmount / result.rate);
          setAmount(tripAmount.toFixed(2));
        } else {
          setAmount('');
        }
      } catch (e) {
        if (cancelled) return;
        console.warn('SettleUpModal: rate fetch failed', e);
        setError(t('settleUp.rateUnavailable'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, sameCurrency, tripCurrency, homeCurrency, suggestedHomeAmount, t]);

  // When the user flips the currency toggle, re-derive the input value
  // *from the current input value* using the rate. Preserves whatever the
  // user typed (in their old currency) rather than reverting to the prefill.
  const handleCurrencyToggle = (next: CurrencyChoice): void => {
    if (next === currency) return;
    if (rate === null) {
      setCurrency(next);
      return;
    }
    const parsed = parseFloat(amount.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      // Currently in `currency`, switching to `next`. Convert via the rate.
      // rate is trip→home: 1 trip = rate home.
      const inHome = currency === 'trip' ? parsed * rate : parsed;
      const converted = next === 'trip' ? inHome / rate : inHome;
      setAmount(roundAmount(converted).toFixed(2));
    }
    setCurrency(next);
  };

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    const parsed = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(t('settleUp.amountInvalid'));
      return;
    }
    if (rate === null) {
      setError(t('settleUp.rateUnavailable'));
      return;
    }

    // Resolve the persisted shape:
    //   currency = whichever the user actually paid in
    //   exchange_rate = currency → home (lock at submit time)
    //   converted_amount = amount * exchange_rate
    const settlementCurrency = currency === 'trip' ? tripCurrency : homeCurrency;
    const exchangeRate =
      currency === 'trip' ? roundRate(rate) : 1;
    const convertedAmount =
      currency === 'trip' ? roundAmount(parsed * rate) : roundAmount(parsed);

    setIsSubmitting(true);
    try {
      await createSettlement({
        tripId,
        fromUserId,
        toUserId,
        amount: roundAmount(parsed),
        currency: settlementCurrency,
        exchangeRate,
        convertedAmount,
        settledDate: date,
        note: note.trim() ? note.trim() : null,
        expenseSplitId: lockedExpenseSplitId ?? null,
      });
      setIsSubmitting(false);
      onClose();
    } catch (e) {
      console.warn('SettleUpModal: createSettlement failed', e);
      setIsSubmitting(false);
      setError(
        e instanceof Error ? e.message : t('settleUp.saveFailedFallback'),
      );
    }
  };

  const displayCurrencyCode = currency === 'trip' ? tripCurrency : homeCurrency;
  const formattedSuggested = useMemo(
    () => formatAmount(suggestedHomeAmount, homeCurrency),
    [suggestedHomeAmount, homeCurrency],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <SafeAreaView edges={['bottom']} style={styles.safe}>
          <View style={[styles.sheetWrap, { borderColor: theme.border }]}>
            <LinearGradient
              colors={theme.cardGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sheet}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scroll}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.header}>
                  <Text style={[styles.title, { color: theme.text }]}>
                    {t('settleUp.title')}
                  </Text>
                  <Pressable
                    onPress={onClose}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.closeButton,
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={[styles.closeText, { color: theme.textMuted }]}>✕</Text>
                  </Pressable>
                </View>

                {/* From / To row */}
                <View style={styles.peopleRow}>
                  <View style={styles.personCol}>
                    <Text style={[styles.label, { color: theme.textMuted }]}>
                      {t('settleUp.from')}
                    </Text>
                    <View
                      style={[
                        styles.personPill,
                        { backgroundColor: theme.redSoft, borderColor: theme.red },
                      ]}
                    >
                      <Text style={[styles.personName, { color: theme.red }]} numberOfLines={1}>
                        {fromName}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.arrow, { color: theme.textMuted }]}>→</Text>
                  <View style={styles.personCol}>
                    <Text style={[styles.label, { color: theme.textMuted }]}>
                      {t('settleUp.to')}
                    </Text>
                    <View
                      style={[
                        styles.personPill,
                        { backgroundColor: theme.greenSoft, borderColor: theme.green },
                      ]}
                    >
                      <Text style={[styles.personName, { color: theme.green }]} numberOfLines={1}>
                        {toName}
                      </Text>
                    </View>
                  </View>
                </View>

                {suggestedHomeAmount > 0 ? (
                  <Text style={[styles.hint, { color: theme.textMuted }]}>
                    {t('balance.netSettlement')}: {formattedSuggested}
                  </Text>
                ) : null}

                {/* Amount + currency */}
                <Text style={[styles.label, { color: theme.textMuted }]}>
                  {t('settleUp.amount')}
                </Text>
                <View
                  style={[
                    styles.amountRow,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.currencyPrefix, { color: theme.textSecondary }]}>
                    {displayCurrencyCode}
                  </Text>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="decimal-pad"
                    editable={!amountLocked}
                    style={[
                      styles.amountInput,
                      { color: theme.text, opacity: amountLocked ? 0.7 : 1 },
                    ]}
                  />
                </View>

                {!sameCurrency ? (
                  <View style={styles.currencyToggle}>
                    <Pressable
                      onPress={() => handleCurrencyToggle('trip')}
                      style={({ pressed }) => [
                        styles.toggleButton,
                        {
                          backgroundColor:
                            currency === 'trip' ? theme.accentSoft : theme.surface,
                          borderColor:
                            currency === 'trip' ? theme.accent : theme.border,
                          transform: [{ scale: pressed ? 0.97 : 1 }],
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.toggleText,
                          {
                            color:
                              currency === 'trip' ? theme.accent : theme.textSecondary,
                          },
                        ]}
                      >
                        {t('settleUp.currencyTrip', { code: tripCurrency })}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleCurrencyToggle('home')}
                      style={({ pressed }) => [
                        styles.toggleButton,
                        {
                          backgroundColor:
                            currency === 'home' ? theme.accentSoft : theme.surface,
                          borderColor:
                            currency === 'home' ? theme.accent : theme.border,
                          transform: [{ scale: pressed ? 0.97 : 1 }],
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.toggleText,
                          {
                            color:
                              currency === 'home' ? theme.accent : theme.textSecondary,
                          },
                        ]}
                      >
                        {t('settleUp.currencyHome', { code: homeCurrency })}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {/* Date */}
                <Text style={[styles.label, { color: theme.textMuted }]}>
                  {t('settleUp.date')}
                </Text>
                <Pressable
                  onPress={() => setDatePickerOpen(true)}
                  style={({ pressed }) => [
                    styles.dateRow,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.dateText, { color: theme.text }]}>
                    📅 {formatReadableDate(date)}
                  </Text>
                </Pressable>

                {/* Note */}
                <Text style={[styles.label, { color: theme.textMuted }]}>
                  {t('settleUp.note')} <Text style={{ color: theme.textMuted }}>· {t('common.optional')}</Text>
                </Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder={t('settleUp.notePlaceholder')}
                  placeholderTextColor={theme.textMuted}
                  multiline
                  style={[
                    styles.noteInput,
                    {
                      color: theme.text,
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                />

                {error ? (
                  <Text style={[styles.error, { color: theme.red }]}>{error}</Text>
                ) : null}

                <Pressable
                  onPress={() => {
                    void handleSubmit();
                  }}
                  disabled={isSubmitting || rate === null}
                  style={({ pressed }) => [
                    styles.submitButton,
                    {
                      backgroundColor: theme.accent,
                      opacity: isSubmitting || rate === null ? 0.6 : 1,
                      transform: [
                        {
                          scale:
                            pressed && !isSubmitting && rate !== null ? 0.98 : 1,
                        },
                      ],
                    },
                  ]}
                >
                  <Text style={styles.submitText}>
                    {isSubmitting ? t('settleUp.submitting') : t('settleUp.submit')}
                  </Text>
                </Pressable>
              </ScrollView>
            </LinearGradient>
          </View>
        </SafeAreaView>
      </View>

      <CalendarPickerModal
        visible={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        mode="single"
        value={date}
        onChange={setDate}
        maxDate={todayDateString()}
        title={t('settleUp.date')}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  safe: { backgroundColor: 'transparent' },
  sheetWrap: {
    borderTopLeftRadius: sizing.radiusCard,
    borderTopRightRadius: sizing.radiusCard,
    borderWidth: borderWidth.base,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  sheet: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    maxHeight: 640,
  },
  scroll: { paddingBottom: spacing.md, gap: spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: { ...typography.itemTitle },
  closeButton: { padding: 4 },
  closeText: { fontSize: 18, fontWeight: '600' },
  label: {
    ...typography.micro,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  peopleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  personCol: { flex: 1, gap: 4 },
  arrow: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  personPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: sizing.radiusChip,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
  },
  personName: { fontSize: 14, fontWeight: '700' },
  hint: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: borderWidth.base,
    borderRadius: sizing.radiusInput,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  currencyPrefix: { fontSize: 14, fontWeight: '700' },
  amountInput: {
    flex: 1,
    paddingVertical: 14, // form-field tall geometry
    fontSize: 18,
    fontWeight: '700',
  },
  currencyToggle: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: sizing.radiusChip,
    borderWidth: borderWidth.base,
    alignItems: 'center',
  },
  toggleText: { fontSize: 12, fontWeight: '700' },
  dateRow: {
    borderWidth: borderWidth.base,
    borderRadius: sizing.radiusInput,
    paddingHorizontal: spacing.md,
    paddingVertical: 14, // form-field tall geometry
  },
  dateText: { fontSize: 14, fontWeight: '600' },
  noteInput: {
    minHeight: 64,
    borderWidth: borderWidth.base,
    borderRadius: sizing.radiusInput,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 2, // 12 — note field height
    fontSize: 14,
    fontWeight: '500',
    textAlignVertical: 'top',
  },
  error: { fontSize: 13, fontWeight: '600', marginTop: spacing.xs },
  submitButton: {
    marginTop: spacing.md,
    borderRadius: sizing.radiusButton,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
});
