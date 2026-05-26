import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface MessageInputProps {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  disabled: boolean;
}

export function MessageInput({ value, onChange, onSend, disabled }: MessageInputProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const canSend = !disabled && value.trim().length > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t('ask.placeholder')}
        placeholderTextColor={theme.textMuted}
        editable={!disabled}
        returnKeyType="send"
        onSubmitEditing={() => {
          if (canSend) onSend();
        }}
        style={[
          styles.input,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
      />
      <Pressable
        onPress={onSend}
        disabled={!canSend}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={t('ask.placeholder')}
        style={({ pressed }) => [
          styles.sendButton,
          {
            backgroundColor: theme.accent,
            opacity: canSend ? 1 : 0.4,
            transform: [{ scale: pressed && canSend ? 0.94 : 1 }],
          },
        ]}
      >
        <Icon name="arrow-up" size={18} color="#FFFFFF" stroke={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8, // tighter inline gap
    paddingTop: spacing.md - 2, // 8
    paddingHorizontal: spacing.xl,
    paddingBottom: 20, // keyboard clearance buffer
  },
  input: {
    flex: 1,
    borderWidth: borderWidth.hairline,
    borderRadius: sizing.radiusPill,
    paddingVertical: spacing.md - 1,
    paddingHorizontal: spacing.lg,
    fontSize: 14,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: sizing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
