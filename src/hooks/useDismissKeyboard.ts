import { useCallback } from 'react';
import { Keyboard } from 'react-native';

/**
 * Returns a stable callback that dismisses the keyboard.
 *
 * Pair with these props on any ScrollView/FlatList/SectionList that sits
 * near a TextInput so dragging dismisses the keyboard and tapping a row
 * works on the first tap (instead of the first tap dismissing and the
 * second selecting):
 *
 *   keyboardDismissMode="on-drag"
 *   keyboardShouldPersistTaps="handled"
 */
export function useDismissKeyboard(): () => void {
  return useCallback(() => Keyboard.dismiss(), []);
}
