// /journal tab. Hosts the day timeline (Today view) and the chapter (All-days)
// view, switched by a top toggle. The dayDate cursor lives here so picking a
// card in the chapter view can deep-link into Today view for that date.

import { useGlobalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChapterView } from '@/components/journal/ChapterView';
import { TodayView } from '@/components/journal/TodayView';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { todayIsoDate } from '@/utils/date';

type Mode = 'today' | 'allDays';

export default function JournalScreen() {
  // useGlobalSearchParams returns parent dynamic segments — the [id] in
  // /trip/[id]/(tabs)/journal lives on the parent route, not the journal
  // segment, so useLocalSearchParams would return {}. Other tabs in this
  // group use the same hook.
  const params = useGlobalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  const theme = useTheme();
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('today');
  // Day cursor lives at the screen level so the chapter view can hand a
  // dayDate back when the user picks a card. TodayView re-clamps to the
  // trip window when needed via its own controlled-prop bridge.
  const [dayDate, setDayDate] = useState<string>(() => todayIsoDate());

  const handlePickDay = useCallback((picked: string): void => {
    setDayDate(picked);
    setMode('today');
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={[styles.toggle, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ToggleButton
          label={t('journal.toggleToday')}
          active={mode === 'today'}
          onPress={() => setMode('today')}
        />
        <ToggleButton
          label={t('journal.toggleAllDays')}
          active={mode === 'allDays'}
          onPress={() => setMode('allDays')}
        />
      </View>
      {mode === 'today' ? (
        <TodayView
          tripId={tripId}
          dayDateOverride={dayDate}
          onDayDateChange={setDayDate}
        />
      ) : (
        <ChapterView tripId={tripId} onPickDay={handlePickDay} />
      )}
    </View>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.toggleBtn,
        active && { backgroundColor: theme.accentSoft },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text
        style={[
          styles.toggleLabel,
          { color: active ? theme.accent : theme.textMuted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 12, paddingTop: 12 },
  toggle: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 11,
    alignItems: 'center',
  },
  toggleLabel: { fontSize: 12, fontWeight: '700' },
});
