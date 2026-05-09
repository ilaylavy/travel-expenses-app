import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
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
        { backgroundColor: theme.surface, borderColor: theme.borderLight },
      ]}
    >
      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldCard: {
    borderRadius: sizing.radiusCardInner,
    borderWidth: 1,
    padding: spacing.lg,
    gap: 4,
  },
  fieldLabel: { ...typography.micro, marginBottom: 2 },
});
