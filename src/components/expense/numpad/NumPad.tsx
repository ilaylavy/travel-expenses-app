import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LTRView } from '@/components/ui/LTRView';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

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
  onDone: () => void;
  disabled?: boolean;
}

// null = invisible spacer cell (column 3, row 4 — the slot to the right of "0").
const NUMBER_ROWS: (NumPadKey | null)[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', null],
];

function NumPadInner({ onKeyPress, onLongBackspace, onDone, disabled }: NumPadProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const handlePress = useCallback(
    (key: NumPadKey) => {
      if (disabled) return;
      onKeyPress(key);
    },
    [disabled, onKeyPress],
  );

  const handleDone = useCallback(() => {
    if (disabled) return;
    onDone();
  }, [disabled, onDone]);

  return (
    <LTRView style={styles.pad}>
      <View style={styles.numbersCol}>
        {NUMBER_ROWS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((key, colIndex) =>
              key === null ? (
                <View key={`spacer-${rowIndex}-${colIndex}`} style={styles.spacer} />
              ) : (
                <NumberKey
                  key={key}
                  value={key}
                  onPress={handlePress}
                  textColor={theme.text}
                  borderColor={theme.border}
                  accentColor={theme.accent}
                  gradient={theme.cardGradient}
                />
              ),
            )}
          </View>
        ))}
      </View>
      <View style={styles.rightCol}>
        <BackspaceKey
          onPress={handlePress}
          onLongPress={onLongBackspace}
          textColor={theme.accent}
          bgColor={theme.surface}
          borderColor={theme.border}
        />
        <Pressable
          onPress={handleDone}
          android_disableSound={false}
          style={({ pressed }) => [
            styles.doneKey,
            {
              backgroundColor: theme.accentSoft,
              borderColor: theme.accent,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
          ]}
        >
          <Text style={[styles.doneText, { color: theme.accent }]}>
            {t('expense.numpadDone')}
          </Text>
        </Pressable>
      </View>
    </LTRView>
  );
}

interface NumberKeyProps {
  value: NumPadKey;
  onPress: (key: NumPadKey) => void;
  textColor: string;
  borderColor: string;
  accentColor: string;
  gradient: readonly [string, string];
}

const NumberKey = memo(function NumberKey({
  value,
  onPress,
  textColor,
  borderColor,
  accentColor,
  gradient,
}: NumberKeyProps) {
  const handlePress = useCallback(() => onPress(value), [onPress, value]);
  return (
    <Pressable
      onPress={handlePress}
      android_disableSound={false}
      hitSlop={4}
      style={({ pressed }) => [
        styles.key,
        {
          borderColor: pressed ? accentColor : borderColor,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.keyGradient}
      >
        <Text style={[styles.keyText, { color: textColor }]}>{value}</Text>
      </LinearGradient>
    </Pressable>
  );
});

interface BackspaceKeyProps {
  onPress: (key: NumPadKey) => void;
  onLongPress?: () => void;
  textColor: string;
  bgColor: string;
  borderColor: string;
}

const BackspaceKey = memo(function BackspaceKey({
  onPress,
  onLongPress,
  textColor,
  bgColor,
  borderColor,
}: BackspaceKeyProps) {
  const handlePress = useCallback(() => onPress('backspace'), [onPress]);
  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      android_disableSound={false}
      hitSlop={4}
      style={({ pressed }) => [
        styles.backspaceKey,
        {
          backgroundColor: bgColor,
          borderColor: pressed ? textColor : borderColor,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={[styles.backspaceText, { color: textColor }]}>⌫</Text>
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

const KEY_HEIGHT = 50;

const styles = StyleSheet.create({
  pad: { flexDirection: 'row', gap: spacing.sm },
  numbersCol: { flex: 3, gap: spacing.sm },
  rightCol: { flex: 1, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  spacer: { flex: 1, minHeight: KEY_HEIGHT },
  key: {
    flex: 1,
    minHeight: KEY_HEIGHT,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    overflow: 'hidden',
  },
  keyGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: sizing.radiusButton,
  },
  keyText: { ...typography.numpad, lineHeight: 26 }, // line-height tuning for vertical centering
  backspaceKey: {
    minHeight: KEY_HEIGHT,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backspaceText: { fontSize: 20, fontWeight: '600', lineHeight: 24 },
  doneKey: {
    flex: 1,
    minHeight: KEY_HEIGHT,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});
