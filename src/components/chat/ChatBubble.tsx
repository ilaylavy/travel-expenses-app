import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useIsRTL } from '@/hooks/useIsRTL';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  onTryAgain?: () => void;
}

export function ChatBubble({ role, content, onTryAgain }: ChatBubbleProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const isUser = role === 'user';
  const isRTL = useIsRTL();

  const trailingFlat = isRTL ? 'borderBottomLeftRadius' : 'borderBottomRightRadius';
  const leadingFlat = isRTL ? 'borderBottomRightRadius' : 'borderBottomLeftRadius';

  if (isUser) {
    return (
      <View style={[styles.row, styles.rowUser]}>
        <View
          style={[
            styles.bubble,
            { backgroundColor: theme.accent, [trailingFlat]: 4 },
          ]}
        >
          <Text style={[styles.text, { color: '#FFFFFF' }]}>{content}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, styles.rowAi]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderWidth: borderWidth.hairline,
            [leadingFlat]: 4,
          },
        ]}
      >
        <Text style={[styles.text, { color: theme.text }]}>{content}</Text>
        {onTryAgain ? (
          <Pressable
            onPress={onTryAgain}
            hitSlop={6}
            accessibilityRole="button"
            style={styles.tryAgainWrap}
          >
            <Text style={[styles.tryAgain, { color: theme.accent }]}>
              {t('ask.tryAgain')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', marginVertical: spacing.xs },
  rowUser: { alignItems: 'flex-end' },
  rowAi: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '85%',
    paddingVertical: spacing.md - 1, // 11
    paddingHorizontal: spacing.base - 1, // 15
    borderRadius: sizing.radiusCardInner, // 18
  },
  text: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  tryAgainWrap: { marginTop: spacing.sm },
  tryAgain: {
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
