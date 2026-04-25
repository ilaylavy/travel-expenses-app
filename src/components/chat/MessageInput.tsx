import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
        style={[styles.sendWrap, { opacity: canSend ? 1 : 0.4 }]}
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
    gap: 8,
    paddingTop: 8,
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  sendWrap: { width: 40, height: 40 },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { fontSize: 18 },
});
