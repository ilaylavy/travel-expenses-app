import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { NumericPadField } from '@/components/expense/numpad/NumericPadField';
import { CalendarPickerModal } from '@/components/ui/CalendarPickerModal';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { getCurrencySymbol } from '@/utils/currency';
import { formatReadableDate, isValidIsoDate, todayIsoDate } from '@/utils/date';

const TRIP_EMOJIS = ['✈️', '🏖️', '🏔️', '🗺️', '🏛️', '🍜', '🌴', '🎒', '🚂', '🏕️', '🌸', '🌃'];

export interface TripFormValues {
  name: string;
  emoji: string;
  startDate: string;
  endDate: string | null;
  baseCurrency: string;
  homeCurrency: string;
  budget: number | null;
}

interface TripFormProps {
  initial?: Partial<TripFormValues>;
  // Currency code displayed in the budget label. The form no longer
  // collects currency from the user — the parent supplies the user's
  // home currency (from settings, or the existing trip when editing) so
  // the budget input can show the right symbol/code without any picker.
  displayCurrency: string;
  submitLabel: string;
  submittingLabel?: string;
  onSubmit: (values: TripFormValues) => Promise<void>;
  footer?: React.ReactNode;
}

export function TripForm({
  initial,
  displayCurrency,
  submitLabel,
  submittingLabel,
  onSubmit,
  footer,
}: TripFormProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? TRIP_EMOJIS[0]);
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayIsoDate());
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [ongoing, setOngoing] = useState(initial?.endDate == null && initial != null ? true : false);
  const [budget, setBudget] = useState(initial?.budget != null ? String(initial.budget) : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  // base_currency / home_currency are still stored on the trip row, but
  // the user no longer picks them. Default both to displayCurrency for
  // new trips; preserve the originals when editing.
  const baseCurrency = initial?.baseCurrency ?? displayCurrency;
  const homeCurrency = initial?.homeCurrency ?? displayCurrency;

  const inputStyle = useMemo(
    () => [styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }],
    [theme],
  );

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    if (!name.trim()) return setError(t('tripForm.errors.nameRequired'));
    if (!isValidIsoDate(startDate)) return setError(t('tripForm.errors.startDateInvalid'));
    if (!ongoing && !isValidIsoDate(endDate)) return setError(t('tripForm.errors.endDateInvalid'));
    const parsedBudget = budget.trim() ? Number(budget) : null;
    if (parsedBudget != null && (!Number.isFinite(parsedBudget) || parsedBudget < 0)) {
      return setError(t('tripForm.errors.budgetInvalid'));
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        emoji,
        startDate,
        endDate: ongoing ? null : endDate,
        baseCurrency,
        homeCurrency,
        budget: parsedBudget,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('tripForm.errors.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <Field label={t('tripForm.emoji')} theme={theme}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiRow}>
          {TRIP_EMOJIS.map((e) => {
            const selected = e === emoji;
            return (
              <Pressable
                key={e}
                onPress={() => setEmoji(e)}
                style={[
                  styles.emojiChip,
                  {
                    backgroundColor: selected ? theme.accentSoft : theme.surface,
                    borderColor: selected ? theme.accent : theme.border,
                  },
                ]}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Field>

      <Field label={t('tripForm.name')} theme={theme}>
        <TextInput
          style={inputStyle}
          value={name}
          onChangeText={setName}
          placeholder={t('tripForm.namePlaceholder')}
          placeholderTextColor={theme.textMuted}
        />
      </Field>

      <Field label={t('tripForm.startDate')} theme={theme}>
        <Pressable
          onPress={() => setStartPickerOpen(true)}
          style={[
            styles.input,
            styles.dateButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.dateButtonText, { color: theme.text }]}>
            {startDate && isValidIsoDate(startDate)
              ? formatReadableDate(startDate)
              : t('calendar.selectDate')}
          </Text>
        </Pressable>
      </Field>

      <View style={styles.ongoingRow}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          {t('tripForm.ongoingToggle')}
        </Text>
        <Switch
          value={ongoing}
          onValueChange={setOngoing}
          trackColor={{ true: theme.accent, false: theme.border }}
          thumbColor={theme.surface}
        />
      </View>

      {!ongoing && (
        <Field label={t('tripForm.endDate')} theme={theme}>
          <Pressable
            onPress={() => setEndPickerOpen(true)}
            style={[
              styles.input,
              styles.dateButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text
              style={[
                styles.dateButtonText,
                { color: endDate && isValidIsoDate(endDate) ? theme.text : theme.textMuted },
              ]}
            >
              {endDate && isValidIsoDate(endDate)
                ? formatReadableDate(endDate)
                : t('calendar.selectDate')}
            </Text>
          </Pressable>
        </Field>
      )}

      <CalendarPickerModal
        visible={startPickerOpen}
        onClose={() => setStartPickerOpen(false)}
        mode="single"
        value={startDate || null}
        onChange={(d) => {
          setStartDate(d);
          // Clear an end date that would now precede start.
          if (endDate && d > endDate) setEndDate('');
        }}
      />
      <CalendarPickerModal
        visible={endPickerOpen}
        onClose={() => setEndPickerOpen(false)}
        mode="single"
        value={endDate || null}
        minDate={startDate || undefined}
        onChange={(d) => setEndDate(d)}
      />

      <Field label={t('tripForm.budget', { currency: displayCurrency })} theme={theme}>
        <NumericPadField
          value={budget}
          onChange={setBudget}
          prefix={getCurrencySymbol(displayCurrency)}
          placeholder={t('tripForm.budgetPlaceholder')}
        />
      </Field>

      {error && <Text style={[styles.error, { color: theme.red }]}>{error}</Text>}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        style={({ pressed }) => [
          styles.submit,
          { backgroundColor: theme.accent, opacity: submitting || pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={styles.submitText}>
          {submitting ? submittingLabel ?? t('common.saving') : submitLabel}
        </Text>
      </Pressable>

      {footer}
    </ScrollView>
  );
}

function Field({
  label,
  theme,
  children,
}: {
  label: string;
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, paddingBottom: spacing.xxl * 2, gap: spacing.base },
  field: { gap: spacing.sm },
  label: { ...typography.subtitle },
  input: {
    borderRadius: sizing.radiusInput,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  dateButton: { justifyContent: 'center' },
  dateButtonText: { fontSize: 15, fontWeight: '500' },
  emojiRow: { gap: spacing.sm, paddingVertical: 4 },
  emojiChip: {
    width: 52,
    height: 52,
    borderRadius: sizing.radiusButton,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 26 },
  ongoingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  error: { ...typography.caption, marginTop: -spacing.xs },
  submit: {
    borderRadius: sizing.radiusButton,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
});
