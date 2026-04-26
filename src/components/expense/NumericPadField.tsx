import { ReactNode, useCallback, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

import { NumPad, appendNumPadKey, type NumPadKey } from './NumPad';

interface UseNumericPadModalOptions {
  value: string;
  onChange: (next: string) => void;
  onClose?: () => void;
}

interface UseNumericPadModalResult {
  /** True while the NumPad sheet is open. */
  open: boolean;
  /** Open the NumPad sheet (also dismisses the system keyboard). */
  openPad: () => void;
  /** Dismiss the sheet. */
  closePad: () => void;
  /** The modal node — render this once in your component tree. */
  padNode: ReactNode;
}

/**
 * Hook for wiring a custom-styled display to the app NumPad. Use this when
 * NumericPadField's default field chrome doesn't fit (e.g. inside another
 * card with its own borders). Render `padNode` somewhere in your JSX, and
 * call `openPad()` from your custom Pressable's onPress.
 */
export function useNumericPadModal({
  value,
  onChange,
  onClose,
}: UseNumericPadModalOptions): UseNumericPadModalResult {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const openPad = useCallback(() => {
    Keyboard.dismiss();
    setOpen(true);
  }, []);

  const closePad = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  const handleKey = useCallback(
    (key: NumPadKey) => {
      onChange(appendNumPadKey(value, key));
    },
    [onChange, value],
  );

  const handleLongBackspace = useCallback(() => {
    onChange('');
  }, [onChange]);

  const padNode = (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={closePad}
    >
      <Pressable style={styles.backdrop} onPress={closePad}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.padBar,
            {
              backgroundColor: theme.bg,
              borderTopColor: theme.border,
              paddingBottom: Math.max(insets.bottom, spacing.base),
            },
          ]}
        >
          <NumPad
            onKeyPress={handleKey}
            onLongBackspace={handleLongBackspace}
            onDone={closePad}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );

  return { open, openPad, closePad, padNode };
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Visual prefix shown in front of the value (e.g. a currency symbol). */
  prefix?: string;
  /** Shown when value is empty. */
  placeholder?: string;
  /** Optional small label rendered above the value (e.g. "BUDGET"). */
  label?: string;
  /** Override the field display style. */
  style?: StyleProp<ViewStyle>;
  /** Disabled if true; tapping does nothing. */
  disabled?: boolean;
  /** Called when the user taps "Done" or dismisses the pad. */
  onClose?: () => void;
}

/**
 * Numeric input that uses the app's custom NumPad instead of the system
 * keyboard. Tap the field → a NumPad slides up from the bottom; tap Done
 * (or outside) to dismiss. Suitable for screens where a single primary
 * numeric value is being entered.
 *
 * For inline mini-inputs (per-row split shares, etc.), prefer the system
 * decimal-pad — multiple NumPad targets in one screen would conflict.
 */
export function NumericPadField({
  value,
  onChange,
  prefix,
  placeholder = '0',
  label,
  style,
  disabled,
  onClose,
}: Props) {
  const theme = useTheme();
  const { open, openPad, padNode } = useNumericPadModal({
    value,
    onChange,
    onClose,
  });

  const handleOpen = useCallback(() => {
    if (disabled) return;
    openPad();
  }, [disabled, openPad]);

  const showValue = value !== '' ? value : placeholder;

  return (
    <>
      <Pressable
        onPress={handleOpen}
        disabled={disabled}
        style={[
          styles.field,
          {
            backgroundColor: theme.surface,
            borderColor: open ? theme.accent : theme.border,
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
      >
        {label ? (
          <Text style={[styles.label, { color: theme.textMuted }]}>
            {label.toUpperCase()}
          </Text>
        ) : null}
        <View style={styles.valueRow}>
          {prefix ? (
            <Text style={[styles.prefix, { color: theme.textSecondary }]}>
              {prefix}
            </Text>
          ) : null}
          <Text
            style={[
              styles.value,
              {
                color: value !== '' ? theme.text : theme.textMuted,
              },
            ]}
            numberOfLines={1}
          >
            {showValue}
          </Text>
        </View>
      </Pressable>
      {padNode}
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    borderRadius: sizing.radiusInput,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
  label: { ...typography.micro, marginBottom: 2 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  prefix: { fontSize: 14, fontWeight: '600' },
  value: { fontSize: 17, fontWeight: '600', flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  padBar: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
});
