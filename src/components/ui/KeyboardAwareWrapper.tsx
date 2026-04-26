import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';

import { sizing } from '@/constants/theme';

interface Props {
  children: ReactNode;
  /**
   * Set when the screen lives inside a bottom tab navigator. The wrapper
   * compensates for the tab bar so the keyboard doesn't double-pad.
   */
  hasBottomTab?: boolean;
  /**
   * Set when the screen has its own fixed bottom bar (chat input, numpad).
   * Currently informational; the bar handles its own padding.
   */
  hasFixedBottom?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * Escape hatch for fine-tuning the vertical offset on a per-screen basis
   * if the defaults don't fit.
   */
  keyboardVerticalOffset?: number;
}

export function KeyboardAwareWrapper({
  children,
  hasBottomTab,
  hasFixedBottom: _hasFixedBottom,
  style,
  keyboardVerticalOffset,
}: Props) {
  const offset =
    keyboardVerticalOffset ??
    (Platform.OS === 'ios' && hasBottomTab ? sizing.navHeight : 0);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={offset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
