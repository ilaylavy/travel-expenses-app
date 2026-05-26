import { ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
}

export function StatsSectionCard({ title, children, style }: Props) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
        style,
      ]}
    >
      {title ? (
        <Text style={[styles.title, { color: theme.textMuted }]}>{title}</Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: sizing.radiusCard,
    borderWidth: borderWidth.hairline,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    ...typography.micro,
    textTransform: 'uppercase',
  },
});
