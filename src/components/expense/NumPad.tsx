import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export type NumPadKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '.'
  | 'backspace';

interface NumPadProps {
  onKeyPress: (key: NumPadKey) => void;
  onLongBackspace?: () => void;
  disabled?: boolean;
}

const KEYS: NumPadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'backspace'],
];

function NumPadInner({ onKeyPress, onLongBackspace, disabled }: NumPadProps) {
  const theme = useTheme();

  const handlePress = useCallback(
    (key: NumPadKey) => {
      if (disabled) return;
      onKeyPress(key);
    },
    [disabled, onKeyPress],
  );

  return (
    <View style={styles.pad}>
      {KEYS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((key) => (
            <Key
              key={key}
              value={key}
              onPress={handlePress}
              onLongPress={key === 'backspace' ? onLongBackspace : undefined}
              textColor={theme.text}
              bgColor={theme.surface}
              borderColor={theme.border}
              accentColor={theme.accent}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

interface KeyProps {
  value: NumPadKey;
  onPress: (key: NumPadKey) => void;
  onLongPress?: () => void;
  textColor: string;
  bgColor: string;
  borderColor: string;
  accentColor: string;
}

// Individual key is memoized so pressing one doesn't re-render the rest.
const Key = memo(function Key({
  value,
  onPress,
  onLongPress,
  textColor,
  bgColor,
  borderColor,
  accentColor,
}: KeyProps) {
  const handlePress = useCallback(() => onPress(value), [onPress, value]);
  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      android_disableSound={false}
      hitSlop={4}
      style={({ pressed }) => [
        styles.key,
        {
          backgroundColor: bgColor,
          borderColor: pressed ? accentColor : borderColor,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={[styles.keyText, { color: value === 'backspace' ? accentColor : textColor }]}>
        {value === 'backspace' ? '⌫' : value}
      </Text>
    </Pressable>
  );
});

export const NumPad = memo(NumPadInner);

export function appendNumPadKey(current: string, key: NumPadKey): string {
  if (key === 'backspace') {
    return current.slice(0, -1);
  }
  if (key === '.') {
    if (current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }
  if (current === '0') return key;
  // cap fractional digits at 2
  if (current.includes('.')) {
    const [, fraction] = current.split('.');
    if (fraction.length >= 2) return current;
  }
  return `${current}${key}`;
}

const styles = StyleSheet.create({
  pad: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  key: {
    flex: 1,
    minHeight: 56,
    borderRadius: sizing.radiusButton,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { ...typography.numpad, fontSize: 24, lineHeight: 28 },
});
