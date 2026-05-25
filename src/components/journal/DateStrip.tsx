// Sticky horizontal strip of passport-stamp date pills. Each pill shows the
// day-of-month (large) above a 2-letter weekday (small). The active pill is
// filled with accent + a soft accent glow ring; past pills are dimmed.
// Optional inline-start back glyph (when pushed from All Days) and an
// inline-end "All days" icon button for cross-navigation. Auto-scrolls so
// the active pill stays visible as the user pages through days.

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { todayIsoDate } from '@/utils/date';

interface Props {
  tripId: string;
  startDate: string;
  endDate: string | null;
  currentDate: string;
  onPick: (date: string) => void;
  showBackButton: boolean;
}

const PILL_W = 50;
const PILL_GAP = 8;

export function DateStrip({
  tripId,
  startDate,
  endDate,
  currentDate,
  onPick,
  showBackButton,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const viewportRef = useRef<number>(0);

  const days = useMemo(() => expandDays(startDate, endDate), [startDate, endDate]);
  const today = todayIsoDate();

  // Lesson #2: when there's a back button, hide the "All Days" icon — they
  // navigate to the same place and stacking both reads as duplicate chrome.
  const showAllDaysButton = !showBackButton;

  // Center the active pill horizontally inside the viewport as it changes.
  // We don't know the viewport width until first layout, so the math runs
  // any time either changes.
  useEffect(() => {
    const idx = days.findIndex((d) => d === currentDate);
    if (idx < 0 || !scrollRef.current) return;
    const stride = PILL_W + PILL_GAP;
    const pillCenter = idx * stride + PILL_W / 2;
    const viewport = viewportRef.current || 320;
    const x = Math.max(0, pillCenter - viewport / 2);
    scrollRef.current.scrollTo({ x, animated: true });
  }, [currentDate, days.length]);

  const onScrollLayout = (e: LayoutChangeEvent): void => {
    viewportRef.current = e.nativeEvent.layout.width;
  };

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.bg,
          borderBottomColor: theme.borderLight,
        },
      ]}
    >
      {showBackButton ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [
            styles.iconBtn,
            pressed && { opacity: 0.55 },
          ]}
        >
          <Text style={[styles.backGlyph, { color: theme.text }]}>‹</Text>
        </Pressable>
      ) : null}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        onLayout={onScrollLayout}
      >
        {days.map((date, idx) => (
          <DatePill
            key={date}
            date={date}
            active={date === currentDate}
            past={date < today}
            isToday={date === today}
            dayNumber={idx + 1}
            onPress={() => onPick(date)}
          />
        ))}
      </ScrollView>
      {showAllDaysButton ? (
        <Pressable
          onPress={() => router.push(`/trip/${tripId}/(tabs)/journal` as never)}
          hitSlop={10}
          accessibilityLabel={t('journal.allDays')}
          style={({ pressed }) => [
            styles.iconBtn,
            pressed && { opacity: 0.55 },
          ]}
        >
          <View style={[styles.allDaysIcon, { borderColor: theme.text }]}>
            <View style={[styles.allDaysLine, { backgroundColor: theme.text }]} />
            <View style={[styles.allDaysLine, { backgroundColor: theme.text }]} />
            <View style={[styles.allDaysLine, { backgroundColor: theme.text }]} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

function DatePill({
  date,
  active,
  past,
  isToday,
  dayNumber,
  onPress,
}: {
  date: string;
  active: boolean;
  past: boolean;
  isToday: boolean;
  dayNumber: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const parts = date.split('-');
  const dd = parts[2] ?? '';
  const weekday = new Date(`${date}T00:00:00Z`)
    .toLocaleDateString(undefined, { weekday: 'short' })
    .slice(0, 2)
    .toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        active
          ? {
              backgroundColor: theme.accent,
              borderColor: theme.accent,
              shadowColor: theme.accent,
              shadowOpacity: 0.45,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }
          : {
              borderColor: isToday ? theme.accent : theme.border,
              backgroundColor: 'transparent',
              borderWidth: isToday ? 1.5 : 1,
            },
        past && !active && { opacity: 0.55 },
        pressed && !active && { backgroundColor: theme.accentSoft },
      ]}
    >
      {/* Tiny day-number ribbon at the top of the active pill for an "open passport" feel. */}
      {active ? (
        <Text style={styles.pillDayNum}>D{dayNumber}</Text>
      ) : (
        <Text style={[styles.pillDayNum, { color: theme.textMuted, opacity: 0.7 }]}>
          D{dayNumber}
        </Text>
      )}
      <Text
        style={[
          styles.pillDay,
          { color: active ? '#fff' : theme.text },
        ]}
      >
        {dd}
      </Text>
      <Text
        style={[
          styles.pillWeekday,
          { color: active ? 'rgba(255,255,255,0.78)' : theme.textMuted },
        ]}
      >
        {weekday}
      </Text>
    </Pressable>
  );
}

function expandDays(startDate: string, endDate: string | null): string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return [startDate];
  const end = endDate ? new Date(`${endDate}T00:00:00Z`) : start;
  if (Number.isNaN(end.getTime())) return [startDate];
  const out: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { fontSize: 28, fontWeight: '700', lineHeight: 30, marginTop: -2 },
  allDaysIcon: {
    width: 18,
    height: 14,
    justifyContent: 'space-between',
  },
  allDaysLine: {
    height: 2,
    borderRadius: 1,
  },
  strip: { gap: PILL_GAP, paddingHorizontal: 6 },
  pill: {
    width: PILL_W,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillDayNum: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.78)',
    marginBottom: 1,
  },
  pillDay: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 20,
  },
  pillWeekday: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 1,
  },
});
