// Web build of the calendar picker. Native uses react-native-calendars
// which doesn't render usefully on web; here we lean on the browser's
// own <input type="date"> picker, which integrates with the OS date UI
// (mobile gets a wheel, desktop gets a popup) and handles locale, Hebrew
// included, for free.
//
// The prop surface matches the native modal so callers don't branch.
// The calendar theme is intentionally ignored — the browser-native
// picker doesn't expose hooks for it.
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { countDaysInRange, formatReadableDateRange } from '@/utils/date';

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
  title,
}: CalendarPickerModalProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const [pendingStart, setPendingStart] = useState<string | null>(rangeValue?.start ?? null);
  const [pendingEnd, setPendingEnd] = useState<string | null>(rangeValue?.end ?? null);

  // Reset range state every time the modal becomes visible — same
  // semantics as the native variant.
  useEffect(() => {
    if (visible && mode === 'range') {
      setPendingStart(rangeValue?.start ?? null);
      setPendingEnd(rangeValue?.end ?? null);
    }
  }, [visible, mode, rangeValue?.start, rangeValue?.end]);

  const headerTitle = title ?? (mode === 'single' ? t('calendar.selectDate') : t('calendar.selectRange'));
  const doneEnabled = mode === 'range' && Boolean(pendingStart && pendingEnd);

  const handleSinglePick = (next: string) => {
    if (!next) return;
    onChange?.(next);
    onClose();
  };

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

  const inputStyle = {
    backgroundColor: theme.bg,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    borderRadius: 14,
    padding: '10px 12px',
    fontSize: 16,
    width: '100%',
  } as const;

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
              <Icon name="x" size={14} color={theme.textMuted} stroke={2.2} />
            </Pressable>
          </View>

          {mode === 'single' ? (
            <View style={styles.fields}>
              <input
                type="date"
                value={value ?? ''}
                min={minDate}
                max={maxDate}
                onChange={(e) => handleSinglePick(e.target.value)}
                style={inputStyle}
              />
            </View>
          ) : (
            <View style={styles.fields}>
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  {t('calendar.from')}
                </Text>
                <input
                  type="date"
                  value={pendingStart ?? ''}
                  min={minDate}
                  max={pendingEnd ?? maxDate}
                  onChange={(e) => setPendingStart(e.target.value || null)}
                  style={inputStyle}
                />
              </View>
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  {t('calendar.to')}
                </Text>
                <input
                  type="date"
                  value={pendingEnd ?? ''}
                  min={pendingStart ?? minDate}
                  max={maxDate}
                  onChange={(e) => setPendingEnd(e.target.value || null)}
                  style={inputStyle}
                />
              </View>
            </View>
          )}

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
  // (formerly closeText — replaced by SVG x icon.)
  fields: { paddingVertical: spacing.md, gap: spacing.sm },
  fieldRow: { gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
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
