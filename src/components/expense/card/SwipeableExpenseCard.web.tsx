// Web build of SwipeableExpenseCard. Swiping doesn't translate to mouse +
// keyboard, so on web the card has no delete affordance — deletion happens
// from the expense detail screen instead. Native keeps the gesture flow.
import { ExpenseCard } from '@/components/expense/card/ExpenseCard';
import type { Category } from '@/types/category';
import type { ExpenseWithPhotos } from '@/types/expense';

interface SwipeableExpenseCardProps {
  expense: ExpenseWithPhotos;
  category: Category | null;
  homeCurrency: string;
  onPress: () => void;
  // The remaining props mirror the native variant's surface so call sites
  // don't need to branch. The web build ignores them.
  onDelete: () => void;
  confirmTitle: string;
  confirmBody: string;
  confirmLabel: string;
  cancelLabel: string;
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
  loggedByName,
  isSelfLogged,
  userShareAmount,
  userShareConverted,
}: SwipeableExpenseCardProps) {
  return (
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
  );
}
