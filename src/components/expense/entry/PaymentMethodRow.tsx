import { Pressable, StyleSheet, Text, View } from 'react-native';

import { sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { PAYMENT_METHODS } from '@/hooks/useExpenseEntryForm';
import type { PaymentMethod } from '@/types/expense';

import { Section } from './Section';

export function PaymentMethodRow({
  paymentMethod,
  onChange,
}: {
  paymentMethod: PaymentMethod | null;
  onChange: (m: PaymentMethod | null) => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Section title={t('expense.paymentSection')}>
      <View style={styles.paymentRow}>
        {PAYMENT_METHODS.map((m) => {
          const active = paymentMethod === m;
          return (
            <Pressable
              key={m}
              onPress={() => onChange(active ? null : m)}
              style={[
                styles.paymentChip,
                {
                  backgroundColor: active ? theme.accentSoft : theme.surface,
                  borderColor: active ? theme.accent : theme.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.paymentChipText,
                  { color: active ? theme.accent : theme.textSecondary },
                ]}
              >
                {t(`expense.payment${m[0].toUpperCase()}${m.slice(1)}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  paymentRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  paymentChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: sizing.radiusChip,
    borderWidth: 1.5,
  },
  paymentChipText: { fontSize: 13, fontWeight: '700' },
});
