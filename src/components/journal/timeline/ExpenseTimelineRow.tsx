// Timeline row for one expense. Places SpineNode beside the unchanged
// ExpenseCard — the card is the only row shape that keeps its outer
// surface, by design (expense rows are a different visual register and the
// card contrast is useful in the spine layout).
//
// Lesson #9: keep using ExpenseCard so the existing MULTI-DAY spread badge
// keeps rendering.

import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { ExpenseCard } from '@/components/expense/card/ExpenseCard';
import { SpineNode } from '@/components/journal/SpineNode';
import type { Category } from '@/types/category';
import type { ExpenseWithPhotos } from '@/types/expense';
import { countDaysInRange } from '@/utils/date';
import { href } from '@/utils/nav';

interface Props {
  expense: ExpenseWithPhotos;
  category: Category | null;
  homeCurrency: string;
  loggedByName?: string | null;
  isSelfLogged?: boolean;
  userShareAmount?: number;
  userShareConverted?: number;
  onLongPress: () => void;
  onDragStart?: () => void;
  isMember?: boolean;
  spineThickness?: 'thin' | 'thick';
  spineCapTop?: boolean;
  spineCapBottom?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelectToggle?: () => void;
  animateIn?: boolean;
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
  isMember,
  spineThickness,
  spineCapTop,
  spineCapBottom,
  selectable,
  selected,
  onSelectToggle,
  animateIn,
}: Props) {
  const router = useRouter();
  const opacity = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(animateIn ? -8 : 0)).current;
  useEffect(() => {
    if (!animateIn) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start();
  }, [animateIn, opacity, translateY]);
  // expense_date is YYYY-MM-DD, expense_time is HH:MM(:SS). Concatenating
  // without "Z" keeps the time interpreted as local wall-clock (which the
  // SpineNode's formatTime expects for expenses).
  const occurredAt = `${expense.expenseDate}T${expense.expenseTime}`;

  // Spread expense: show the per-day fraction as the primary card amount,
  // since this card is rendered once per day inside the journal timeline.
  // A €400 / 4-day hotel reads €100 on each day; the MULTI-DAY badge
  // still tells the user it's a multi-day expense, and the detail screen
  // shows the full total.
  const isSpread = !!(expense.spreadStartDate && expense.spreadEndDate);
  const spreadDays = isSpread
    ? countDaysInRange(expense.spreadStartDate!, expense.spreadEndDate!)
    : 1;
  const perDayAmount = isSpread && spreadDays > 1
    ? expense.amount / spreadDays
    : undefined;
  const perDayConverted = isSpread && spreadDays > 1
    ? expense.convertedAmount / spreadDays
    : undefined;

  return (
    <Animated.View
      style={[styles.row, { opacity, transform: [{ translateY }] }]}
    >
      <SpineNode
        occurredAt={occurredAt}
        loggedByName={!isSelfLogged && loggedByName ? loggedByName : undefined}
        variant={isMember ? 'member' : 'solo'}
        onDragStart={onDragStart}
        selectable={selectable}
        selected={selected}
        spineThickness={spineThickness}
        spineCapTop={spineCapTop}
        spineCapBottom={spineCapBottom}
      />
      <View style={styles.body}>
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={420}
          style={styles.bodyInner}
        >
          <ExpenseCard
            expense={expense}
            category={category}
            homeCurrency={homeCurrency}
            loggedByName={loggedByName}
            isSelfLogged={isSelfLogged}
            userShareAmount={userShareAmount}
            userShareConverted={userShareConverted}
            perDayAmount={perDayAmount}
            perDayConverted={perDayConverted}
            onPress={() =>
              router.push(href(`/trip/${expense.tripId}/expense/${expense.id}`))
            }
          />
        </Pressable>
        {selectable && onSelectToggle ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onSelectToggle}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 18,
  },
  body: {
    flex: 1,
    paddingTop: 2,
    position: 'relative',
  },
  bodyInner: {},
});
