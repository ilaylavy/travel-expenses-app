import { StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useIsRTL } from '@/hooks/useIsRTL';
import { useTheme } from '@/hooks/useTheme';

import { TypingDots } from './TypingDots';

interface TypingBubbleProps {
  // Optional copy beside the dots. The Ask screen rotates through 4
  // "thinking…" variants — pass the current one in.
  label?: string;
}

// Assistant-side chat bubble for the "thinking" state. Shape, padding, and
// notched corner match ChatBubble's AI mode so it sits inline with replies.
export function TypingBubble({ label }: TypingBubbleProps) {
  const theme = useTheme();
  const isRTL = useIsRTL();
  const leadingFlat = isRTL ? 'borderBottomRightRadius' : 'borderBottomLeftRadius';

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            [leadingFlat]: 4,
          },
        ]}
      >
        <TypingDots color={theme.textSecondary} />
        {label ? (
          <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', marginVertical: spacing.xs, alignItems: 'flex-start' },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md - 1,
    paddingHorizontal: spacing.base - 1,
    borderRadius: sizing.radiusCardInner,
    borderWidth: borderWidth.hairline,
  },
  label: { fontSize: 12, fontWeight: '500' },
});
