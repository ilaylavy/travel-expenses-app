// Web build of SwipeableExpenseCard. Swiping a card to reveal a delete
// action doesn't translate well to mouse + keyboard, so on web the same
// card gets a small ⋮ overlay button that pops a window.confirm. Same
// outcome (delete on confirm), simpler interaction. Native keeps the
// gesture-based flow.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ExpenseCard } from '@/components/expense/card/ExpenseCard';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { Category } from '@/types/category';
import type { ExpenseWithPhotos } from '@/types/expense';

interface SwipeableExpenseCardProps {
  expense: ExpenseWithPhotos;
  category: Category | null;
  homeCurrency: string;
  onPress: () => void;
  onDelete: () => void;
  confirmTitle: string;
  confirmBody: string;
  confirmLabel: string;
  cancelLabel: string;
  // deleteLabel is in the prop surface for parity with native; the web
  // variant doesn't render the swipe-action label.
  deleteLabel: string;
  loggedByName?: string | null;
  isSelfLogged?: boolean;
  canDelete?: boolean;
  userShareAmount?: number;
  userShareConverted?: number;
}

export function SwipeableExpenseCard({
  expense,
  category,
  homeCurrency,
  onPress,
  onDelete,
  confirmTitle,
  confirmBody,
  confirmLabel,
  loggedByName,
  isSelfLogged,
  canDelete = true,
  userShareAmount,
  userShareConverted,
}: SwipeableExpenseCardProps) {
  const theme = useTheme();

  const handleDeletePress = () => {
    // window.confirm doesn't render a separate confirm/cancel button label,
    // so we fold the action wording into the body. cancelLabel is unused
    // on web; the browser dialog supplies its own Cancel button.
    const ok = typeof window !== 'undefined' && window.confirm
      ? window.confirm(`${confirmTitle}\n\n${confirmBody}\n\n— ${confirmLabel}`)
      : true;
    if (ok) onDelete();
  };

  return (
    <View style={styles.wrap}>
      <ExpenseCard
        expense={expense}
        category={category}
        homeCurrency={homeCurrency}
        onPress={onPress}
        loggedByName={loggedByName}
        isSelfLogged={isSelfLogged}
        userShareAmount={userShareAmount}
        userShareConverted={userShareConverted}
      />
      {canDelete ? (
        <Pressable
          onPress={handleDeletePress}
          accessibilityLabel={confirmLabel}
          hitSlop={8}
          style={({ pressed }) => [
            styles.menuButton,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              opacity: pressed ? 0.6 : 0.9,
            },
          ]}
        >
          <Text style={[styles.menuIcon, { color: theme.textSecondary }]}>⋮</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  menuButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: { fontSize: 18, fontWeight: '700', lineHeight: 20 },
});
