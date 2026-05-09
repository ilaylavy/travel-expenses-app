import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CurrencyPickerModal } from '@/components/currency/CurrencyPickerModal';
import { RateOverrideChip } from '@/components/currency/RateOverrideChip';
import { CURRENCIES } from '@/constants/currencies';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { ExchangeRateStatus } from '@/hooks/useExchangeRate';
import { formatAmount, getCurrencySymbol } from '@/utils/currency';

export function AmountSection({
  amountText,
  currency,
  homeCurrency,
  exchangeRate,
  manualRate,
  rateStatus,
  convertedAmount,
  showConverted,
  stripCurrencies,
  favoriteCodes,
  onPickCurrency,
  onToggleFavorite,
  onAmountPress,
  onSetManualRate,
}: {
  amountText: string;
  currency: string;
  homeCurrency: string | undefined;
  exchangeRate: number;
  manualRate: number | null;
  rateStatus: ExchangeRateStatus;
  convertedAmount: number;
  showConverted: boolean;
  stripCurrencies: readonly (typeof CURRENCIES)[number][];
  favoriteCodes: Set<string>;
  onPickCurrency: (code: string) => void;
  onToggleFavorite: (code: string) => void;
  onAmountPress: () => void;
  onSetManualRate: (rate: number | null) => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);

  const symbol = currency ? getCurrencySymbol(currency) : '';

  return (
    <>
      {/* Amount hero — pressing it brings up the numpad and dismisses
          the system keyboard, so the two are never visible together. */}
      <Pressable onPress={onAmountPress} style={styles.amountHero}>
        <Text style={[styles.amountDisplay, { color: theme.text }]}>
          {symbol}
          {amountText || '0'}
        </Text>
        {showConverted && homeCurrency ? (
          <>
            <Text style={[styles.converted, { color: theme.textMuted }]}>
              {t('expense.convertedLabel', {
                amount: formatAmount(convertedAmount, homeCurrency),
                currency: homeCurrency,
              })}
            </Text>
            <RateOverrideChip
              baseCurrency={currency}
              targetCurrency={homeCurrency}
              rate={exchangeRate}
              isOverridden={manualRate !== null}
              onOverride={onSetManualRate}
              onResetToAuto={() => onSetManualRate(null)}
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
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
          {t('expense.currencySection').toUpperCase()}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {stripCurrencies.map((c) => {
            const active = c.code === currency;
            return (
              <Pressable
                key={c.code}
                onPress={() => onPickCurrency(c.code)}
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
            onPress={() => setPickerOpen(true)}
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
      </View>

      <CurrencyPickerModal
        visible={pickerOpen}
        selectedCode={currency || null}
        onSelect={onPickCurrency}
        onClose={() => setPickerOpen(false)}
        favoriteCodes={favoriteCodes}
        onToggleFavorite={onToggleFavorite}
        homeCurrency={homeCurrency ?? ''}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
});
