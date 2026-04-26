import { useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { ExpenseCard } from '@/components/expense/ExpenseCard';
import { sizing, spacing, typography } from '@/constants/theme';
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
  cancelLabel,
  deleteLabel,
  loggedByName,
  isSelfLogged,
  canDelete = true,
  userShareAmount,
  userShareConverted,
}: SwipeableExpenseCardProps) {
  const theme = useTheme();
  const ref = useRef<Swipeable>(null);

  const handleDeletePress = () => {
    Alert.alert(confirmTitle, confirmBody, [
      {
        text: cancelLabel,
        style: 'cancel',
        onPress: () => ref.current?.close(),
      },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: () => {
          ref.current?.close();
          onDelete();
        },
      },
    ]);
  };

  const renderRightActions = () => (
    <View style={styles.actionWrap}>
      <Pressable
        onPress={handleDeletePress}
        style={({ pressed }) => [
          styles.action,
          {
            backgroundColor: theme.red,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={styles.actionText}>{deleteLabel}</Text>
      </Pressable>
    </View>
  );

  return (
    <Swipeable
      ref={ref}
      renderRightActions={canDelete ? renderRightActions : undefined}
      overshootRight={false}
      friction={2}
    >
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
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  actionWrap: {
    justifyContent: 'center',
    paddingStart: spacing.sm,
  },
  action: {
    paddingHorizontal: spacing.xl,
    height: '100%',
    borderRadius: sizing.radiusCardInner,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
  actionText: {
    ...typography.subtitle,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
