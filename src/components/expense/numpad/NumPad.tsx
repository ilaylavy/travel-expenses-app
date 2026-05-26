import * as Haptics from 'expo-haptics';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { LTRView } from '@/components/ui/LTRView';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

import { appendKey, type NumpadInput, type Op, trailingOperator } from './calculator';

// Re-exported so callers can keep the old import path; the type still
// represents "valid numpad keypresses" — operators are now part of the
// vocabulary (the calculator engine treats them as no-ops in digit-only
// mode anyway).
export type NumPadKey = NumpadInput;

// Re-export the engine's appender so existing call sites keep working.
// New code can import directly from `./calculator` to access the rest of
// the engine (evaluate, tokenize, etc.).
export { appendKey as appendNumPadKey } from './calculator';

interface NumPadProps {
  onKeyPress: (key: NumpadInput) => void;
  onLongBackspace?: () => void;
  // Called when the user taps the Done key. In calculator mode the
  // parent should evaluate the current expression and replace amountText
  // with the result before doing whatever Done usually does.
  onDone: () => void;
  // Called only in calculator mode when the equals key is tapped.
  // Implementations should evaluate the expression and either replace it
  // with the result (collapse), or no-op if unresolvable.
  onEquals?: () => void;
  // Visual state for the calculator's "active operator" highlight — pass
  // `trailingOperator(amountText)` from the parent. Ignored in digits mode.
  activeOperator?: Op | null;
  // Layout mode. 'digits' keeps the original 3-col-numbers + 1-col-actions
  // layout for simple numeric fields (budget input). 'calculator' shows
  // the full 4-col grid with operator keys and a 2-cell action bar.
  mode?: 'digits' | 'calculator';
  disabled?: boolean;
}

const DIGIT_ROWS_BASIC: (NumpadInput | null)[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', null],
];

const CALC_ROWS: { digit: NumpadInput | null; op: Op | null }[][] = [
  [{ digit: '7', op: null }, { digit: '8', op: null }, { digit: '9', op: null }, { digit: null, op: '/' }],
  [{ digit: '4', op: null }, { digit: '5', op: null }, { digit: '6', op: null }, { digit: null, op: '*' }],
  [{ digit: '1', op: null }, { digit: '2', op: null }, { digit: '3', op: null }, { digit: null, op: '-' }],
];

function NumPadInner({
  onKeyPress,
  onLongBackspace,
  onDone,
  onEquals,
  activeOperator,
  mode = 'digits',
  disabled,
}: NumPadProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const handlePress = useCallback(
    (key: NumpadInput) => {
      if (disabled) return;
      void Haptics.selectionAsync();
      onKeyPress(key);
    },
    [disabled, onKeyPress],
  );

  const handleDone = useCallback(() => {
    if (disabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDone();
  }, [disabled, onDone]);

  const handleEquals = useCallback(() => {
    if (disabled || !onEquals) return;
    void Haptics.selectionAsync();
    onEquals();
  }, [disabled, onEquals]);

  if (mode === 'calculator') {
    return (
      <LTRView style={styles.calcPad}>
        {CALC_ROWS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.calcRow}>
            {row.map((cell, colIndex) => {
              if (cell.op) {
                return (
                  <OperatorKey
                    key={`${rowIndex}-${colIndex}`}
                    op={cell.op}
                    active={activeOperator === cell.op}
                    onPress={handlePress}
                    theme={theme}
                  />
                );
              }
              if (cell.digit) {
                return (
                  <NumberKey
                    key={cell.digit}
                    value={cell.digit}
                    onPress={handlePress}
                    textColor={theme.text}
                    bgColor={theme.surface}
                    borderColor={theme.border}
                    accentColor={theme.accent}
                  />
                );
              }
              return <View key={`spacer-${rowIndex}-${colIndex}`} style={styles.calcCell} />;
            })}
          </View>
        ))}
        {/* Row 4 — `.`, `0`, backspace, `+` */}
        <View style={styles.calcRow}>
          <NumberKey
            value="."
            onPress={handlePress}
            textColor={theme.text}
            bgColor={theme.surface}
            borderColor={theme.border}
            accentColor={theme.accent}
          />
          <NumberKey
            value="0"
            onPress={handlePress}
            textColor={theme.text}
            bgColor={theme.surface}
            borderColor={theme.border}
            accentColor={theme.accent}
          />
          <BackspaceKey
            onPress={handlePress}
            onLongPress={onLongBackspace}
            glyphColor={theme.textSecondary}
            bgColor={theme.surface}
            borderColor={theme.border}
            accentColor={theme.accent}
          />
          <OperatorKey
            op="+"
            active={activeOperator === '+'}
            onPress={handlePress}
            theme={theme}
          />
        </View>
        {/* Action bar: equals (1fr) + Done (2fr) */}
        <View style={styles.actionBar}>
          <Pressable
            onPress={handleEquals}
            accessibilityRole="button"
            accessibilityLabel={t('expense.numpadEqualsAriaLabel')}
            style={({ pressed }) => [
              styles.equalsKey,
              {
                borderColor: theme.accent,
                backgroundColor: pressed ? theme.accentSoft : 'transparent',
              },
            ]}
          >
            <Text style={[styles.equalsText, { color: theme.accent }]}>=</Text>
          </Pressable>
          <Pressable
            onPress={handleDone}
            accessibilityRole="button"
            accessibilityLabel={t('expense.numpadDone')}
            style={({ pressed }) => [
              styles.doneKey,
              styles.doneKeyCalc,
              {
                backgroundColor: theme.accent,
                transform: [{ scale: pressed ? 0.96 : 1 }],
                opacity: pressed ? 0.92 : 1,
              },
            ]}
          >
            <Icon name="check" size={16} color="#FFFFFF" stroke={2.4} />
            <Text style={[styles.doneText]}>{t('expense.numpadDone')}</Text>
          </Pressable>
        </View>
      </LTRView>
    );
  }

  // ─ digits mode (default) — the legacy layout retained for the budget
  // input and any other simple numeric entry. 3 cols of digits on the
  // left, single trailing col with backspace on top and Done below.
  return (
    <LTRView style={styles.pad}>
      <View style={styles.numbersCol}>
        {DIGIT_ROWS_BASIC.map((row, rowIndex) => (
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
                  bgColor={theme.surface}
                  borderColor={theme.border}
                  accentColor={theme.accent}
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
          glyphColor={theme.textSecondary}
          bgColor={theme.surface}
          borderColor={theme.border}
          accentColor={theme.accent}
        />
        <Pressable
          onPress={handleDone}
          accessibilityRole="button"
          accessibilityLabel={t('expense.numpadDone')}
          style={({ pressed }) => [
            styles.doneKey,
            {
              backgroundColor: theme.accent,
              transform: [{ scale: pressed ? 0.96 : 1 }],
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          <Icon name="check" size={16} color="#FFFFFF" stroke={2.4} />
          <Text style={[styles.doneText]}>{t('expense.numpadDone')}</Text>
        </Pressable>
      </View>
    </LTRView>
  );
}

interface NumberKeyProps {
  value: NumpadInput;
  onPress: (key: NumpadInput) => void;
  textColor: string;
  bgColor: string;
  borderColor: string;
  accentColor: string;
}

const NumberKey = memo(function NumberKey({
  value,
  onPress,
  textColor,
  bgColor,
  borderColor,
  accentColor,
}: NumberKeyProps) {
  const handlePress = useCallback(() => onPress(value), [onPress, value]);
  return (
    <Pressable
      onPress={handlePress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={String(value)}
      style={({ pressed }) => [
        styles.key,
        {
          backgroundColor: bgColor,
          borderColor: pressed ? accentColor : borderColor,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.keyText, { color: textColor }]}>{String(value)}</Text>
    </Pressable>
  );
});

interface OperatorKeyProps {
  op: Op;
  active: boolean;
  onPress: (key: NumpadInput) => void;
  theme: ReturnType<typeof useTheme>;
}

const GLYPH: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const ARIA_KEY: Record<Op, string> = {
  '+': 'expense.numpadOpAddAriaLabel',
  '-': 'expense.numpadOpSubAriaLabel',
  '*': 'expense.numpadOpMulAriaLabel',
  '/': 'expense.numpadOpDivAriaLabel',
};

function OperatorKey({ op, active, onPress, theme }: OperatorKeyProps) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onPress(op), [op, onPress]);
  return (
    <Pressable
      onPress={handlePress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={t(ARIA_KEY[op])}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.key,
        {
          backgroundColor: active ? theme.accentSoft : theme.surface,
          borderColor: active || pressed ? theme.accent : theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.opText, { color: theme.accent }]}>{GLYPH[op]}</Text>
    </Pressable>
  );
}

interface BackspaceKeyProps {
  onPress: (key: NumpadInput) => void;
  onLongPress?: () => void;
  glyphColor: string;
  bgColor: string;
  borderColor: string;
  accentColor: string;
}

const BackspaceKey = memo(function BackspaceKey({
  onPress,
  onLongPress,
  glyphColor,
  bgColor,
  borderColor,
  accentColor,
}: BackspaceKeyProps) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onPress('backspace'), [onPress]);
  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={t('expense.numpadBackspaceAriaLabel')}
      style={({ pressed }) => [
        styles.key,
        {
          backgroundColor: bgColor,
          borderColor: pressed ? accentColor : borderColor,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Icon name="backspace" size={20} color={glyphColor} stroke={1.8} />
    </Pressable>
  );
});

export const NumPad = memo(NumPadInner);

// Total height of the calculator-mode bar (used by add-expense to reserve
// scroll-content space below the form when the numpad bar is mounted).
//   - 4 digit rows × 48px + 3 gaps × 6px
//   - + action bar 48px
//   - + spacing between digit grid and action bar (8px)
const KEY_HEIGHT = 48;
const GRID_GAP = 6;
const ACTION_GAP = 8;
export const CALC_PAD_HEIGHT =
  4 * KEY_HEIGHT + 3 * GRID_GAP + ACTION_GAP + KEY_HEIGHT;
export const DIGITS_PAD_HEIGHT = 4 * KEY_HEIGHT + 3 * GRID_GAP;

const styles = StyleSheet.create({
  // ── digits mode (legacy 3+1 layout) ──
  pad: { flexDirection: 'row', gap: spacing.sm },
  numbersCol: { flex: 3, gap: spacing.sm },
  rightCol: { flex: 1, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  spacer: { flex: 1, minHeight: KEY_HEIGHT },

  // ── calculator mode ──
  calcPad: { gap: GRID_GAP },
  calcRow: { flexDirection: 'row', gap: GRID_GAP },
  calcCell: { flex: 1, minHeight: KEY_HEIGHT },
  actionBar: { flexDirection: 'row', gap: GRID_GAP, marginTop: ACTION_GAP - GRID_GAP },
  equalsKey: {
    flex: 1,
    minHeight: KEY_HEIGHT,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  equalsText: { fontSize: 22, fontWeight: '800' },

  // ── shared key shapes ──
  key: {
    flex: 1,
    minHeight: KEY_HEIGHT,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { ...typography.numpad, lineHeight: 26 },
  opText: { fontSize: 22, fontWeight: '700', lineHeight: 26 },

  doneKey: {
    flex: 1,
    minHeight: KEY_HEIGHT,
    borderRadius: sizing.radiusButton,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
  },
  doneKeyCalc: { flex: 2 },
  doneText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
});
