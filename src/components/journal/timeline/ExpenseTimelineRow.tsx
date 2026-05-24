// Timeline row for one expense. Thin wrapper that places the shared
// TimestampGutter beside the existing ExpenseCard so all three row types
// align on the same vertical edge. The card itself owns all of the
// expense styling, category coloring, badges, and per-user share display
// — we just pipe through what it needs.

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ExpenseCard } from '@/components/expense/card/ExpenseCard';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Category } from '@/types/category';
import type { ExpenseWithPhotos } from '@/types/expense';
import { href } from '@/utils/nav';

import { TimestampGutter } from './TimestampGutter';

interface Props {
  expense: ExpenseWithPhotos;
  category: Category | null;
  homeCurrency: string;
  loggedByName?: string | null;
  isSelfLogged?: boolean;
  userShareAmount?: number;
  userShareConverted?: number;
  onLongPress: () => void;
  // Optional drag handle. When provided, the row renders a ≡ button whose
  // long-press calls onDragStart (typically the `drag` callback from the
  // draggable-flatlist renderItem). Row-body long-press still opens the
  // actions sheet.
  onDragStart?: () => void;
}

export function ExpenseTimelineRow({
  expense,
  category,
  homeCurrency,
  loggedByName,
  isSelfLogged,
  userShareAmount,
  userShareConverted,
  onLongPress,
  onDragStart,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  // The timestamp gutter only renders HH:MM. expense_date is YYYY-MM-DD
  // and expense_time is HH:MM(:SS); a bare local concat is sufficient —
  // appending Z would falsely treat the local time as UTC.
  const occurredAt = `${expense.expenseDate}T${expense.expenseTime}`;
  return (
    <Pressable
      onLongPress={onLongPress}
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <TimestampGutter occurredAt={occurredAt} />
      <View style={styles.body}>
        <ExpenseCard
          expense={expense}
          category={category}
          homeCurrency={homeCurrency}
          loggedByName={loggedByName}
          isSelfLogged={isSelfLogged}
          userShareAmount={userShareAmount}
          userShareConverted={userShareConverted}
          onPress={() => router.push(href(`/trip/${expense.tripId}/expense/${expense.id}`))}
        />
      </View>
      {onDragStart ? (
        <Pressable
          onLongPress={onDragStart}
          delayLongPress={250}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('journal.dragToReorder')}
          style={styles.handle}
        >
          <Text style={[styles.handleGlyph, { color: theme.textMuted }]}>≡</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  body: { flex: 1 },
  handle: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  handleGlyph: {
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '600',
  },
});
