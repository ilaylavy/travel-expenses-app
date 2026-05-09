import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
        <LinearGradient
          colors={theme.gradient1}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.bubble, { [trailingFlat]: 4 }]}
        >
          <Text style={[styles.text, { color: '#FFFFFF' }]}>{content}</Text>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={[styles.row, styles.rowAi]}>
      <LinearGradient
        colors={theme.cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.bubble,
          { borderColor: theme.border, borderWidth: 1, [leadingFlat]: 4 },
        ]}
      >
        <Text style={[styles.text, { color: theme.text }]}>{content}</Text>
        {onTryAgain ? (
          <Pressable onPress={onTryAgain} hitSlop={6} style={styles.tryAgainWrap}>
            <Text style={[styles.tryAgain, { color: theme.accent }]}>
              {t('ask.tryAgain')}
            </Text>
          </Pressable>
        ) : null}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', marginVertical: 4 },
  rowUser: { alignItems: 'flex-end' },
  rowAi: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '85%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  text: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  tryAgainWrap: { marginTop: 6 },
  tryAgain: {
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
