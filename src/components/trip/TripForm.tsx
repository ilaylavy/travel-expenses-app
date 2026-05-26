import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { NumericPadField } from '@/components/expense/numpad/NumericPadField';
import { Avatar } from '@/components/ui/Avatar';
import { CalendarPickerModal } from '@/components/ui/CalendarPickerModal';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { countDaysInRange, formatReadableDate, isValidIsoDate, todayIsoDate } from '@/utils/date';
import { formatAmount, getCurrencySymbol } from '@/utils/currency';
import { initials } from '@/utils/initials';
import { getTripTint } from '@/utils/tripTint';

// emoji column is still stored on the trip row for backwards compatibility,
// but the form no longer lets the user pick one — trip identity is now a
// monogram in a deterministic tint (utils/tripTint). We keep ✈️ as the
// stored default so any code that still reads `trip.emoji` keeps working.
const DEFAULT_EMOJI = '✈️';

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
  // Optional seed used to color the monogram preview. When editing,
  // callers pass `trip.id` so the preview matches the tint rendered
  // elsewhere; for new trips it falls back to the typed name (so the
  // preview gives the user immediate visual feedback as they type).
  monogramSeed?: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoFromOffset(base: string, dayOffset: number): string {
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + dayOffset * MS_PER_DAY);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// "This weekend" → next Friday + Sunday (3-day weekend). If today is
// Fri/Sat/Sun, use the current weekend.
function thisWeekendRange(today: string): { start: string; end: string } {
  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  // Friday is 5. If today >= Fri or Sun (=0), start on the most recent Friday.
  let startOffset: number;
  if (dow === 5 || dow === 6) startOffset = dow === 5 ? 0 : -1;
  else if (dow === 0) startOffset = -2;
  else startOffset = 5 - dow;
  return {
    start: isoFromOffset(today, startOffset),
    end: isoFromOffset(today, startOffset + 2),
  };
}

export function TripForm({
  initial,
  displayCurrency,
  submitLabel,
  submittingLabel,
  onSubmit,
  footer,
  monogramSeed,
}: TripFormProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayIsoDate());
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [ongoing, setOngoing] = useState(initial?.endDate == null && initial != null ? true : false);
  const [budget, setBudget] = useState(initial?.budget != null ? String(initial.budget) : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  const baseCurrency = initial?.baseCurrency ?? displayCurrency;
  const homeCurrency = initial?.homeCurrency ?? displayCurrency;
  // Edit-mode trips carry their saved emoji along; new trips get the
  // sentinel default so we never write null to the column.
  const persistedEmoji = initial?.emoji ?? DEFAULT_EMOJI;

  const inputStyle = useMemo(
    () => [styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }],
    [theme],
  );

  // Monogram preview tint — uses the supplied seed (trip.id when editing)
  // so the preview matches what the rest of the app renders. For new
  // trips we fall back to the typed name so the user gets immediate
  // visual feedback as they type.
  const monogramTint = useMemo(() => {
    const seed = monogramSeed ?? name ?? '';
    return getTripTint(seed || 'placeholder', theme);
  }, [monogramSeed, name, theme]);
  const monogramLabel = name.trim() ? initials(name) : '+';

  // Date presets — set both start and end. Don't fire when ongoing is on
  // (no end date to set). Pure UX shortcut; no schema effect.
  const applyPreset = (preset: 'weekend' | '7d' | '2w'): void => {
    const today = todayIsoDate();
    if (preset === 'weekend') {
      const range = thisWeekendRange(today);
      setStartDate(range.start);
      setEndDate(range.end);
    } else if (preset === '7d') {
      setStartDate(today);
      setEndDate(isoFromOffset(today, 6));
    } else {
      setStartDate(today);
      setEndDate(isoFromOffset(today, 13));
    }
    setOngoing(false);
  };

  // Daily budget hint — only shown when we have a budget AND a finite
  // date range. Ongoing trips don't get a daily hint (no denominator).
  const parsedBudget = Number(budget);
  const budgetDailyHint = useMemo(() => {
    if (!Number.isFinite(parsedBudget) || parsedBudget <= 0) return null;
    if (ongoing) return null;
    if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) return null;
    const days = countDaysInRange(startDate, endDate);
    if (days <= 0) return null;
    return {
      amount: formatAmount(parsedBudget / days, displayCurrency),
      days,
    };
  }, [parsedBudget, ongoing, startDate, endDate, displayCurrency]);

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    if (!name.trim()) return setError(t('tripForm.errors.nameRequired'));
    if (!isValidIsoDate(startDate)) return setError(t('tripForm.errors.startDateInvalid'));
    if (!ongoing && !isValidIsoDate(endDate)) return setError(t('tripForm.errors.endDateInvalid'));
    const submittedBudget = budget.trim() ? Number(budget) : null;
    if (submittedBudget != null && (!Number.isFinite(submittedBudget) || submittedBudget < 0)) {
      return setError(t('tripForm.errors.budgetInvalid'));
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        emoji: persistedEmoji,
        startDate,
        endDate: ongoing ? null : endDate,
        baseCurrency,
        homeCurrency,
        budget: submittedBudget,
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
      {/* Monogram preview — replaces the old emoji picker. Tint hashes
          from the trip seed (or name for new trips) so the user sees
          immediate identity feedback. */}
      <View style={styles.monogramBlock}>
        <Avatar
          label={monogramLabel}
          tint={monogramTint}
          size={78}
          radius={22}
          accessibilityLabel={t('tripForm.monogramHint')}
        />
        <Text style={[styles.monogramHint, { color: theme.textMuted }]}>
          {t('tripForm.monogramHint')}
        </Text>
      </View>

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

      {/* Date presets — only useful when a definite end date is in play. */}
      {!ongoing ? (
        <View style={styles.presetRow}>
          {(
            [
              { id: 'weekend' as const, label: t('tripForm.presetWeekend') },
              { id: '7d' as const, label: t('tripForm.preset7d') },
              { id: '2w' as const, label: t('tripForm.preset2w') },
            ]
          ).map((p) => (
            <Pressable
              key={p.id}
              onPress={() => applyPreset(p.id)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.presetChip,
                {
                  backgroundColor: theme.bgSoft,
                  borderColor: theme.border,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              <Text style={[styles.presetText, { color: theme.textSecondary }]}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <CalendarPickerModal
        visible={startPickerOpen}
        onClose={() => setStartPickerOpen(false)}
        mode="single"
        value={startDate || null}
        onChange={(d) => {
          setStartDate(d);
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
        {budgetDailyHint ? (
          <Text style={[styles.budgetHint, { color: theme.textMuted }]}>
            {t('tripForm.budgetDailyHint', {
              amount: budgetDailyHint.amount,
              count: budgetDailyHint.days,
            })}
          </Text>
        ) : null}
      </Field>

      {error && <Text style={[styles.error, { color: theme.red }]}>{error}</Text>}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        style={({ pressed }) => [
          styles.submit,
          {
            backgroundColor: theme.accent,
            opacity: submitting ? 0.7 : 1,
            transform: [{ scale: pressed && !submitting ? 0.98 : 1 }],
          },
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
    borderWidth: borderWidth.hairline,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    fontSize: 15,
    fontWeight: '500',
  },
  dateButton: { justifyContent: 'center' },
  dateButtonText: { fontSize: 15, fontWeight: '500' },
  monogramBlock: {
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  monogramHint: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  ongoingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  presetChip: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 7,
    borderRadius: sizing.radiusPill,
    borderWidth: borderWidth.hairline,
  },
  presetText: { fontSize: 12, fontWeight: '600' },
  budgetHint: {
    fontSize: 11,
    fontWeight: '500',
    paddingHorizontal: spacing.xs + 2,
    fontVariant: ['tabular-nums'],
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
