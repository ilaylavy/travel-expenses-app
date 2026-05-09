import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatAmount } from '@/utils/currency';
import {
  countDaysInRange,
  formatReadableDate,
  formatReadableDateRange,
} from '@/utils/date';

export function DateSection({
  date,
  time,
  isSpread,
  spreadStart,
  spreadEnd,
  amountValue,
  currency,
  onOpenDatePicker,
  onOpenSpreadPicker,
  onTimeChange,
  onTimeFocus,
  onEnterSpread,
  onExitSpread,
}: {
  date: string;
  time: string;
  isSpread: boolean;
  spreadStart: string;
  spreadEnd: string;
  amountValue: number;
  currency: string;
  onOpenDatePicker: () => void;
  onOpenSpreadPicker: () => void;
  onTimeChange: (v: string) => void;
  onTimeFocus: () => void;
  onEnterSpread: () => void;
  onExitSpread: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  const spreadDays =
    isSpread && spreadStart && spreadEnd
      ? countDaysInRange(spreadStart, spreadEnd)
      : 1;
  // "Nights" = days - 1, with a min of 1 for single-day spreads. Matches the
  // hotel-booking semantics (3 nights for Mar 15→18 check-in/out).
  const nights = Math.max(1, spreadDays - 1);
  const perDay = amountValue > 0 && spreadDays > 0 ? amountValue / spreadDays : 0;

  return (
    <LinearGradient
      colors={theme.cardGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.dateCard, { borderColor: theme.border }]}
    >
      {isSpread ? (
        <View style={{ gap: spacing.xs }}>
          <View style={styles.dateRow}>
            <Pressable onPress={onOpenSpreadPicker} hitSlop={6} style={styles.dateLeft}>
              <Text style={[styles.dateText, { color: theme.text }]} numberOfLines={1}>
                📅{' '}
                {spreadStart && spreadEnd
                  ? formatReadableDateRange(spreadStart, spreadEnd)
                  : t('calendar.selectRange')}
              </Text>
            </Pressable>
            <Pressable onPress={onExitSpread} hitSlop={8} style={styles.spreadClose}>
              <Text style={[styles.spreadCloseText, { color: theme.textMuted }]}>✕</Text>
            </Pressable>
          </View>
          <Text style={[styles.spreadHint, { color: theme.textMuted }]}>
            {amountValue > 0 && currency
              ? t('datePicker.spreadPerDay', {
                  days: nights,
                  amount: formatAmount(perDay, currency),
                })
              : t('datePicker.spreadNights', { days: nights })}
          </Text>
        </View>
      ) : (
        <View style={styles.dateRow}>
          <Pressable onPress={onOpenDatePicker} hitSlop={6} style={styles.dateLeft}>
            <Text style={[styles.dateText, { color: theme.text }]} numberOfLines={1}>
              📅 {formatReadableDate(date)}
            </Text>
          </Pressable>
          <TextInput
            value={time.slice(0, 5)}
            onChangeText={onTimeChange}
            onFocus={onTimeFocus}
            placeholder="HH:MM"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            keyboardType="numeric"
            maxLength={5}
            style={[
              styles.timeField,
              {
                color: theme.text,
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          />
          <Pressable onPress={onEnterSpread} hitSlop={6} style={styles.spreadButton}>
            <Text style={[styles.spreadButtonText, { color: theme.textMuted }]}>
              ⟷ {t('datePicker.spread')}
            </Text>
          </Pressable>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  dateCard: {
    borderRadius: sizing.radiusInput,
    borderWidth: 1.5,
    padding: spacing.md,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dateLeft: { flex: 1 },
  dateText: { fontSize: 14, fontWeight: '600' },
  timeField: {
    width: 64,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: sizing.radiusInput,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  spreadButton: { paddingHorizontal: 4, paddingVertical: 4 },
  spreadButtonText: { fontSize: 12, fontWeight: '600' },
  spreadClose: { paddingHorizontal: 4 },
  spreadCloseText: { fontSize: 14, fontWeight: '600' },
  spreadHint: { fontSize: 12, fontWeight: '500' },
});
