import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  // Helper text below the field. Becomes error-tinted when `error` is true.
  helper?: string;
  error?: boolean;
  leadingIcon?: IconName;
  // Optional adornment node painted at the trailing edge (eye toggle,
  // unit suffix, etc.). Pass nodes — kept generic to let consumers stack.
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

// Branded text input. Reads via the theme hook — no hardcoded hex.
// Focus state: accent border + 4px soft glow ring (no browser blue).
export function Input({
  label,
  helper,
  error,
  leadingIcon,
  trailing,
  containerStyle,
  inputStyle,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? theme.red : focused ? theme.accent : theme.border;

  return (
    <View style={containerStyle}>
      {label ? <Text style={[styles.label, { color: theme.textMuted }]}>{label.toUpperCase()}</Text> : null}
      <View
        style={[
          styles.shell,
          {
            backgroundColor: theme.surface,
            borderColor,
            borderRadius: sizing.radiusInput,
            // Soft accent glow ring on focus — replicates the CSS
            // `box-shadow: 0 0 0 4px var(--accent-soft)` from the design.
            shadowColor: focused && !error ? theme.accent : undefined,
            shadowOpacity: focused && !error ? 0.2 : 0,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 0 },
          },
        ]}
      >
        {leadingIcon ? (
          <Icon name={leadingIcon} size={16} color={theme.textMuted} stroke={1.8} style={styles.leadIcon} />
        ) : null}
        <TextInput
          {...props}
          placeholderTextColor={theme.textMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              color: theme.text,
              // Pad more on the leading edge when an icon is present so
              // text doesn't collide with it.
              paddingLeft: leadingIcon ? spacing.sm : spacing.lg,
              paddingRight: trailing ? spacing.sm : spacing.lg,
            },
            inputStyle,
          ]}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {helper ? (
        <Text style={[styles.helper, { color: error ? theme.red : theme.textMuted }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.micro,
    marginBottom: spacing.sm,
  },
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: borderWidth.hairline,
    minHeight: 48,
  },
  leadIcon: { marginLeft: spacing.md },
  input: {
    flex: 1,
    ...typography.body,
    paddingVertical: spacing.md,
  },
  trailing: { paddingRight: spacing.md, flexDirection: 'row', alignItems: 'center' },
  helper: { ...typography.caption, marginTop: spacing.xs + 2 },
});
