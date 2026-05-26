import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export function FieldCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.fieldCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldCard: {
    borderRadius: sizing.radiusCardInner,
    borderWidth: borderWidth.hairline,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.micro,
    textTransform: 'uppercase',
    marginBottom: 2, // optical
  },
});
