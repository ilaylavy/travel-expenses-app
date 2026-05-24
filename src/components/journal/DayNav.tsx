// Day-navigation header for the journal Today view. Three columns: prev
// chevron, centered label (date + "Day X of Y" or "Today"), next chevron.
// `flexDirection: row` auto-mirrors in RTL so the chevrons swap visual
// sides without us hardcoding left/right.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatReadableDate } from '@/utils/date';

interface DayNavProps {
  dayDate: string;          // YYYY-MM-DD
  dayIndex: number | null;  // 1-based or null if outside trip
  dayTotal: number | null;  // total days in trip or null if ongoing
  isToday: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export function DayNav(props: DayNavProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const labelMain = props.isToday ? t('journal.today') : formatReadableDate(props.dayDate);
  const labelSub =
    props.dayIndex && props.dayTotal
      ? t('journal.dayOfTotal', { n: props.dayIndex, total: props.dayTotal })
      : '';

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Pressable
        accessibilityLabel={t('journal.previousDay')}
        onPress={props.onPrev}
        hitSlop={8}
        style={({ pressed }) => [styles.chev, pressed && { opacity: 0.6 }]}
      >
        <Text style={[styles.chevText, { color: theme.text }]}>‹</Text>
      </Pressable>
      <View style={styles.centerCol}>
        <Text style={[styles.main, { color: theme.text }]}>{labelMain}</Text>
        {labelSub ? (
          <Text style={[styles.sub, { color: theme.textMuted }]}>{labelSub}</Text>
        ) : null}
      </View>
      <Pressable
        accessibilityLabel={t('journal.nextDay')}
        onPress={props.onNext}
        hitSlop={8}
        style={({ pressed }) => [styles.chev, pressed && { opacity: 0.6 }]}
      >
        <Text style={[styles.chevText, { color: theme.text }]}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  centerCol: { alignItems: 'center' },
  chev: { paddingHorizontal: 6, paddingVertical: 2 },
  chevText: { fontSize: 22, fontWeight: '700', lineHeight: 24 },
  main: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 10, fontWeight: '500', marginTop: 2 },
});
