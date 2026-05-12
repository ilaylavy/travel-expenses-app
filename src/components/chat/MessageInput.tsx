import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
        style={({ pressed }) => [
          styles.sendWrap,
          {
            opacity: canSend ? 1 : 0.4,
            transform: [{ scale: pressed && canSend ? 0.94 : 1 }],
          },
        ]}
      >
        <LinearGradient
          colors={theme.gradient1}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.sendButton}
        >
          <Text style={styles.sendIcon}>✈️</Text>
        </LinearGradient>
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
    borderRadius: sizing.radiusInput,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: 14,
  },
  sendWrap: { width: 40, height: 40 },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: sizing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { fontSize: 18 },
});
