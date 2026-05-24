// All-days (chapter) view. Renders one DayCard per trip date, newest first
// (the query layer already sorts descending). Tapping a card hands the
// dayDate back up to JournalScreen, which switches mode to 'today' and
// seeds TodayView's cursor with that date.

import { FlatList, StyleSheet, Text, View } from 'react-native';

import { useDaySummaries } from '@/hooks/useDaySummaries';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useTripStore } from '@/stores/tripStore';

import { DayCard } from './DayCard';

interface Props {
  tripId: string;
  onPickDay: (dayDate: string) => void;
}

export function ChapterView({ tripId, onPickDay }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const trip = useTripStore((s) => s.trips.find((tr) => tr.id === tripId) ?? null);
  const { summaries, isLoading } = useDaySummaries(tripId);

  if (!trip) return null;

  // The query returns one row per trip date, so summaries.length is the
  // total day count we surface in "Day n of N".
  const dayTotal = summaries.length > 0 ? summaries.length : null;

  return (
    <FlatList
      data={summaries}
      keyExtractor={(s) => s.dayDate}
      renderItem={({ item }) => (
        <DayCard
          summary={item}
          homeCurrency={trip.homeCurrency}
          dayTotal={dayTotal}
          onPress={() => onPickDay(item.dayDate)}
        />
      )}
      ListEmptyComponent={
        isLoading ? null : (
          <View style={[styles.empty, { borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {t('journal.emptyDay')}
            </Text>
          </View>
        )
      }
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 100 },
  empty: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  emptyText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
});
