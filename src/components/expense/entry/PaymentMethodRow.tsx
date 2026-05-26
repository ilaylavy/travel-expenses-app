import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { PAYMENT_METHODS } from '@/hooks/useExpenseEntryForm';
import type { PaymentMethod } from '@/types/expense';

import { Section } from './Section';

const ICON_FOR: Record<PaymentMethod, IconName> = {
  cash: 'cash',
  credit: 'card',
  debit: 'card',
  other: 'wallet',
};

// Use the stats.* translation keys — they carry plain text (no emoji
// prefix), which the design system requires now that icons are rendered
// separately by the chip.
function labelKey(m: PaymentMethod): string {
  if (m === 'cash') return 'stats.paymentCash';
  if (m === 'credit') return 'stats.paymentCredit';
  if (m === 'debit') return 'stats.paymentDebit';
  return 'stats.paymentOther';
}

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
          const fg = active ? theme.accent : theme.textSecondary;
          return (
            <Pressable
              key={m}
              onPress={() => onChange(active ? null : m)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.paymentChip,
                {
                  backgroundColor: active ? theme.accentSoft : theme.surface,
                  borderColor: active ? theme.accent : theme.border,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              <Icon name={ICON_FOR[m] ?? 'wallet'} size={14} color={fg} stroke={1.8} />
              <Text style={[styles.paymentChipText, { color: fg }]}>
                {t(labelKey(m))}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
  },
  paymentChipText: { fontSize: 13, fontWeight: '700' },
});
