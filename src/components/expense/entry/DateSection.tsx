import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
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
    <View style={[styles.dateCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {isSpread ? (
        <View style={{ gap: spacing.xs }}>
          <View style={styles.dateRow}>
            <Pressable onPress={onOpenSpreadPicker} hitSlop={6} style={styles.dateLeft}>
              <View style={styles.dateInline}>
                <Icon name="calendar" size={14} color={theme.textSecondary} stroke={1.8} />
                <Text style={[styles.dateText, { color: theme.text }]} numberOfLines={1}>
                  {spreadStart && spreadEnd
                    ? formatReadableDateRange(spreadStart, spreadEnd)
                    : t('calendar.selectRange')}
                </Text>
              </View>
            </Pressable>
            <Pressable onPress={onExitSpread} hitSlop={8} style={styles.spreadClose}>
              <Icon name="x" size={14} color={theme.textMuted} stroke={2.2} />
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
            <View style={styles.dateInline}>
              <Icon name="calendar" size={14} color={theme.textSecondary} stroke={1.8} />
              <Text style={[styles.dateText, { color: theme.text }]} numberOfLines={1}>
                {formatReadableDate(date)}
              </Text>
            </View>
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
                backgroundColor: theme.bgSoft,
                borderColor: theme.border,
              },
            ]}
          />
          <Pressable onPress={onEnterSpread} hitSlop={6} style={styles.spreadButton}>
            <View style={styles.dateInline}>
              <Icon name="calendar" size={11} color={theme.textMuted} stroke={1.8} />
              <Text style={[styles.spreadButtonText, { color: theme.textMuted }]}>
                {t('datePicker.spread')}
              </Text>
            </View>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dateCard: {
    borderRadius: sizing.radiusInput,
    borderWidth: 1,
    padding: spacing.md,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dateLeft: { flex: 1 },
  dateInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  spreadHint: { fontSize: 12, fontWeight: '500' },
});
