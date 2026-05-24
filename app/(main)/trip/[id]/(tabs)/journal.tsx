// /journal tab. Hosts the day timeline (Today view) and the chapter (All-days)
// view, switched by a top toggle. Both child views own their own data fetching.

import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChapterView } from '@/components/journal/ChapterView';
import { TodayView } from '@/components/journal/TodayView';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

type Mode = 'today' | 'allDays';

export default function JournalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = id ?? '';
  const theme = useTheme();
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('today');

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
        <TodayView tripId={tripId} />
      ) : (
        <ChapterView tripId={tripId} onPickDay={() => setMode('today')} />
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
