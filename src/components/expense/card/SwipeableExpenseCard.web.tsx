// Web build of SwipeableExpenseCard. Swiping a card doesn't translate to
// mouse + keyboard, so on web the same card gets a small ⋮ overlay button
// that pops a window.confirm. Native keeps the gesture-based flow.
//
// Why all the event-blocking. ExpenseCard wraps everything in a
// react-native Pressable. On web that's a <div> with pointerdown/pointerup
// listeners — NOT a click listener — and Pressable fires onPress on the
// pointerup that follows a pointerdown without movement. So even if our
// button stops the click event, Pressable has already registered the press
// from the pointerdown and triggered navigation. We have to block all
// three (pointerdown, pointerup, click) and ideally at the capture phase
// so they never reach the wrapper.
import { StyleSheet, View } from 'react-native';

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

  const swallow = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    swallow(e);
    const ok = window.confirm(
      `${confirmTitle}\n\n${confirmBody}\n\n— ${confirmLabel}`,
    );
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
        <button
          type="button"
          // Block pointerdown/pointerup at capture so they never reach
          // ExpenseCard's wrapping Pressable. Click is the actual handler.
          onPointerDownCapture={swallow}
          onPointerUpCapture={swallow}
          onMouseDown={swallow}
          onMouseUp={swallow}
          onClick={handleClick}
          aria-label={confirmLabel}
          style={{
            position: 'absolute',
            top: spacing.sm,
            insetInlineEnd: spacing.sm,
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 1,
            borderStyle: 'solid',
            backgroundColor: theme.surface,
            borderColor: theme.border,
            color: theme.text,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1,
            opacity: 1,
            zIndex: 10,
            // Belt-and-suspenders: tell the browser this element handles
            // its own touch behavior so the parent doesn't get a chance
            // to interpret the touch as a press on the card.
            touchAction: 'manipulation',
            userSelect: 'none',
          }}
        >
          ⋮
        </button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
});
