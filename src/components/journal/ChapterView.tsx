// All-days (chapter) view stub. Replaced in Phase 3 with the day-card list.

import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export function ChapterView(_: {
  tripId: string;
  onPickDay: (dayDate: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={theme.accent} />
    </View>
  );
}
