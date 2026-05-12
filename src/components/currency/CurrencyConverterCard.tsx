import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useNumericPadModal } from '@/components/expense/numpad/NumericPadField';
import { DEFAULT_CURRENCY } from '@/constants/currencies';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/stores/settingsStore';
import { getCurrencySymbol, roundAmount } from '@/utils/currency';

import { CurrencyPickerModal } from './CurrencyPickerModal';

type ActiveField = 'from' | 'to';

export function CurrencyConverterCard() {
  const theme = useTheme();
  const { t } = useTranslation();
  const defaultCurrency = useSettingsStore((s) => s.defaultCurrency);
  const favoriteCurrencies = useSettingsStore((s) => s.favoriteCurrencies);
  const toggleFavoriteCurrency = useSettingsStore((s) => s.toggleFavoriteCurrency);
  const favoriteCodesSet = useMemo(() => new Set(favoriteCurrencies), [favoriteCurrencies]);

  const [fromCurrency, setFromCurrency] = useState<string>(defaultCurrency || DEFAULT_CURRENCY);
  const [toCurrency, setToCurrency] = useState<string>(
    defaultCurrency && defaultCurrency !== 'EUR' ? 'EUR' : 'USD',
  );
  const [amount, setAmount] = useState<string>('1');
  const [activeField, setActiveField] = useState<ActiveField>('from');
  const [pickerOpen, setPickerOpen] = useState<ActiveField | null>(null);

  const { rate, status } = useExchangeRate(
    activeField === 'from' ? fromCurrency : toCurrency,
    activeField === 'from' ? toCurrency : fromCurrency,
  );

  const parsedInput = useMemo(() => {
    const n = Number(amount.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }, [amount]);

  const convertedDisplay = useMemo(() => {
    if (rate == null) return '';
    return String(roundAmount(parsedInput * rate));
  }, [parsedInput, rate]);

  const fromValue = activeField === 'from' ? amount : convertedDisplay;
  const toValue = activeField === 'to' ? amount : convertedDisplay;

  // Rate shown in the footer is always from→to regardless of which field is active.
  const { rate: displayRate, status: displayStatus } = useExchangeRate(
    fromCurrency,
    toCurrency,
  );

  const handleSwap = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
    // Keep the active field's value — flip what it represents.
    setActiveField(activeField === 'from' ? 'to' : 'from');
  };

  useEffect(() => {
    // Reset to 'from' being active when both currencies change to keep input predictable.
    setActiveField('from');
  }, [fromCurrency, toCurrency]);

  return (
    <>
      <LinearGradient
        colors={theme.cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: theme.border }]}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: theme.text }]}>
            {t('currency.converter.title')}
          </Text>
        </View>

        <View style={styles.fieldsWrap}>
          <ConverterField
            label={t('currency.converter.from')}
            currency={fromCurrency}
            value={fromValue}
            active={activeField === 'from'}
            onFocusField={() => setActiveField('from')}
            onChangeValue={(v) => {
              setActiveField('from');
              setAmount(v);
            }}
            onPickCurrency={() => setPickerOpen('from')}
          />

          <Pressable
            onPress={handleSwap}
            style={({ pressed }) => [
              styles.swapButton,
              {
                backgroundColor: theme.accentSoft,
                borderColor: theme.accent,
                transform: [{ scale: pressed ? 0.94 : 1 }],
              },
            ]}
          >
            <Text style={[styles.swapText, { color: theme.accent }]}>⇅</Text>
          </Pressable>

          <ConverterField
            label={t('currency.converter.to')}
            currency={toCurrency}
            value={toValue}
            active={activeField === 'to'}
            onFocusField={() => setActiveField('to')}
            onChangeValue={(v) => {
              setActiveField('to');
              setAmount(v);
            }}
            onPickCurrency={() => setPickerOpen('to')}
          />
        </View>

        <View style={styles.footerRow}>
          <Text style={[styles.rateLabel, { color: theme.textSecondary }]}>
            {displayRate != null
              ? t('currency.converter.rateLabel', {
                  base: fromCurrency,
                  target: toCurrency,
                  rate: displayRate.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                  }),
                })
              : t('currency.converter.rateUnavailable')}
          </Text>
          {displayStatus === 'stale' ? (
            <Text style={[styles.staleTag, { color: theme.orange }]}>
              {t('currency.converter.stale')}
            </Text>
          ) : null}
        </View>
      </LinearGradient>

      <CurrencyPickerModal
        visible={pickerOpen !== null}
        selectedCode={pickerOpen === 'from' ? fromCurrency : toCurrency}
        onSelect={(code) => {
          if (pickerOpen === 'from') setFromCurrency(code);
          else if (pickerOpen === 'to') setToCurrency(code);
        }}
        onClose={() => setPickerOpen(null)}
        favoriteCodes={favoriteCodesSet}
        onToggleFavorite={toggleFavoriteCurrency}
        homeCurrency={defaultCurrency}
      />
    </>
  );

  // Loading/error visual states for the converter rely on status === 'ready'
  // implicitly; we keep the UX forgiving — if rate is null the "to" field
  // just shows empty and the rate footer shows the unavailable message.
  void status;
}

interface FieldProps {
  label: string;
  currency: string;
  value: string;
  active: boolean;
  onFocusField: () => void;
  onChangeValue: (v: string) => void;
  onPickCurrency: () => void;
}

function ConverterField({
  label,
  currency,
  value,
  active,
  onFocusField,
  onChangeValue,
  onPickCurrency,
}: FieldProps) {
  const theme = useTheme();
  const { openPad, padNode } = useNumericPadModal({
    value,
    onChange: onChangeValue,
  });
  const handleOpenPad = () => {
    onFocusField();
    openPad();
  };
  return (
    <View
      style={[
        styles.field,
        {
          backgroundColor: theme.surface,
          borderColor: active ? theme.accent : theme.border,
        },
      ]}
    >
      <View style={styles.fieldInner}>
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
        <View style={styles.fieldRow}>
          <Pressable
            onPress={onPickCurrency}
            style={[
              styles.currencyButton,
              { backgroundColor: theme.accentSoft, borderColor: theme.accent },
            ]}
          >
            <Text style={[styles.currencyButtonSymbol, { color: theme.accent }]}>
              {getCurrencySymbol(currency)}
            </Text>
            <Text style={[styles.currencyButtonCode, { color: theme.accent }]}>
              {currency}
            </Text>
          </Pressable>
          <Pressable onPress={handleOpenPad} style={styles.amountPressable}>
            <Text
              style={[
                styles.input,
                { color: value !== '' ? theme.text : theme.textMuted },
              ]}
              numberOfLines={1}
            >
              {value !== '' ? value : '0'}
            </Text>
          </Pressable>
        </View>
      </View>
      {padNode}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: sizing.radiusCard,
    borderWidth: borderWidth.hairline,
    padding: spacing.xl,
    marginBottom: spacing.base,
    gap: spacing.lg,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: typography.sectionTitle,
  fieldsWrap: { gap: spacing.sm },
  field: {
    borderWidth: borderWidth.hairline,
    borderRadius: sizing.radiusCardInner,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  fieldInner: { gap: spacing.xs },
  fieldLabel: { ...typography.micro, textTransform: 'uppercase' },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  currencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: sizing.radiusChip,
    borderWidth: borderWidth.hairline,
  },
  currencyButtonSymbol: { ...typography.sectionTitle },
  currencyButtonCode: { ...typography.sectionTitle },
  amountPressable: { flex: 1, justifyContent: 'center' },
  input: {
    ...typography.amountMedium,
    textAlign: 'right',
  },
  swapButton: {
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: sizing.radiusPill,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapText: { fontSize: 20, fontWeight: '700' },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rateLabel: { ...typography.secondary, flex: 1 },
  staleTag: { ...typography.caption, fontWeight: '700' },
});
