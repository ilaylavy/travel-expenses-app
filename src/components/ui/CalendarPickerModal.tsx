import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import type { MarkedDates } from 'react-native-calendars/src/types';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { countDaysInRange, formatReadableDateRange } from '@/utils/dates';

type CalendarRangeValue = { start: string | null; end: string | null };

interface CalendarPickerModalProps {
  visible: boolean;
  onClose: () => void;
  mode: 'single' | 'range';
  value?: string | null;
  rangeValue?: CalendarRangeValue;
  onChange?: (date: string) => void;
  onRangeChange?: (start: string, end: string) => void;
  minDate?: string;
  maxDate?: string;
  markedDates?: MarkedDates;
  title?: string;
}

export function CalendarPickerModal({
  visible,
  onClose,
  mode,
  value,
  rangeValue,
  onChange,
  onRangeChange,
  minDate,
  maxDate,
  markedDates,
  title,
}: CalendarPickerModalProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const [pendingStart, setPendingStart] = useState<string | null>(rangeValue?.start ?? null);
  const [pendingEnd, setPendingEnd] = useState<string | null>(rangeValue?.end ?? null);

  // Reset range state every time the modal becomes visible so we always start
  // from the caller-provided value rather than stale picks from a prior open.
  useEffect(() => {
    if (visible && mode === 'range') {
      setPendingStart(rangeValue?.start ?? null);
      setPendingEnd(rangeValue?.end ?? null);
    }
  }, [visible, mode, rangeValue?.start, rangeValue?.end]);

  const calendarTheme = useMemo(
    () => ({
      backgroundColor: theme.surface,
      calendarBackground: theme.surface,
      textSectionTitleColor: theme.textSecondary,
      selectedDayBackgroundColor: theme.accent,
      selectedDayTextColor: '#FFFFFF',
      todayTextColor: theme.accent,
      dayTextColor: theme.text,
      textDisabledColor: theme.textMuted,
      dotColor: theme.accent,
      selectedDotColor: '#FFFFFF',
      arrowColor: theme.accent,
      monthTextColor: theme.text,
      textMonthFontWeight: '700' as const,
      textMonthFontSize: 16,
      textDayFontWeight: '500' as const,
      textDayHeaderFontWeight: '600' as const,
      textDayHeaderFontSize: 12,
    }),
    [theme],
  );

  const computedMarked = useMemo<MarkedDates>(() => {
    if (mode === 'single') {
      const base: MarkedDates = { ...(markedDates ?? {}) };
      if (value) {
        base[value] = {
          ...(base[value] ?? {}),
          selected: true,
          selectedColor: theme.accent,
        };
      }
      return base;
    }
    // range mode
    const base: MarkedDates = { ...(markedDates ?? {}) };
    if (pendingStart && !pendingEnd) {
      base[pendingStart] = {
        startingDay: true,
        endingDay: true,
        color: theme.accent,
        textColor: '#FFFFFF',
      };
    } else if (pendingStart && pendingEnd) {
      const start = new Date(`${pendingStart}T00:00:00Z`);
      const end = new Date(`${pendingEnd}T00:00:00Z`);
      const cursor = new Date(start);
      while (cursor.getTime() <= end.getTime()) {
        const iso = cursor.toISOString().slice(0, 10);
        const isStart = iso === pendingStart;
        const isEnd = iso === pendingEnd;
        base[iso] = {
          startingDay: isStart,
          endingDay: isEnd,
          color: isStart || isEnd ? theme.accent : theme.accentSoft,
          textColor: isStart || isEnd ? '#FFFFFF' : theme.text,
        };
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    return base;
  }, [mode, value, pendingStart, pendingEnd, markedDates, theme]);

  const handleDayPress = (day: { dateString: string }) => {
    if (mode === 'single') {
      onChange?.(day.dateString);
      onClose();
      return;
    }
    // range mode
    const picked = day.dateString;
    if (!pendingStart || pendingEnd) {
      // No start yet, OR a complete range exists — start fresh.
      setPendingStart(picked);
      setPendingEnd(null);
      return;
    }
    if (picked < pendingStart) {
      // Tap before the existing start resets to a new start.
      setPendingStart(picked);
      setPendingEnd(null);
      return;
    }
    setPendingEnd(picked);
  };

  const headerTitle = title ?? (mode === 'single' ? t('calendar.selectDate') : t('calendar.selectRange'));
  const doneEnabled = mode === 'range' && Boolean(pendingStart && pendingEnd);

  const handleDone = () => {
    if (mode === 'range' && pendingStart && pendingEnd) {
      onRangeChange?.(pendingStart, pendingEnd);
      onClose();
    }
  };

  const handleClear = () => {
    setPendingStart(null);
    setPendingEnd(null);
  };

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
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>{headerTitle}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
              <Text style={[styles.closeText, { color: theme.textMuted }]}>✕</Text>
            </Pressable>
          </View>

          <Calendar
            theme={calendarTheme}
            markingType={mode === 'range' ? 'period' : 'dot'}
            markedDates={computedMarked}
            minDate={minDate}
            maxDate={maxDate}
            current={value ?? pendingStart ?? undefined}
            onDayPress={handleDayPress}
            enableSwipeMonths
          />

          {mode === 'range' ? (
            <View style={styles.footer}>
              <Text style={[styles.summary, { color: theme.textSecondary }]} numberOfLines={1}>
                {pendingStart && pendingEnd
                  ? `${formatReadableDateRange(pendingStart, pendingEnd)} · ${countDaysInRange(pendingStart, pendingEnd)} ${t('calendar.days')}`
                  : pendingStart
                    ? pendingStart
                    : t('calendar.selectRange')}
              </Text>
              <View style={styles.footerButtons}>
                <Pressable onPress={handleClear} hitSlop={8} style={styles.clearButton}>
                  <Text style={[styles.clearText, { color: theme.textSecondary }]}>
                    {t('calendar.clear')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleDone}
                  disabled={!doneEnabled}
                  style={[
                    styles.doneButton,
                    {
                      backgroundColor: doneEnabled ? theme.accent : theme.border,
                      opacity: doneEnabled ? 1 : 0.6,
                    },
                  ]}
                >
                  <Text style={styles.doneText}>{t('calendar.done')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  sheet: {
    borderTopLeftRadius: sizing.radiusCard,
    borderTopRightRadius: sizing.radiusCard,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 16, fontWeight: '700' },
  closeButton: { padding: 4 },
  closeText: { fontSize: 18, fontWeight: '600' },
  footer: {
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  summary: { ...typography.body },
  footerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  clearButton: { paddingVertical: 10, paddingHorizontal: spacing.md },
  clearText: { fontSize: 14, fontWeight: '600' },
  doneButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: sizing.radiusButton,
    alignItems: 'center',
  },
  doneText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
