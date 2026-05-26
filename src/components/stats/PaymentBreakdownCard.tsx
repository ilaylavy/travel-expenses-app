import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { StatsSectionCard } from '@/components/stats/StatsSectionCard';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatAmount } from '@/utils/currency';
import type { PaymentMethodBucket, PaymentTotal } from '@/utils/statsAggregations';

interface Props {
  byPaymentMethod: PaymentTotal[];
  currency: string;
}

function iconFor(method: PaymentMethodBucket): IconName {
  switch (method) {
    case 'cash':
      return 'cash';
    case 'credit':
    case 'debit':
      return 'card';
    default:
      return 'wallet';
  }
}

export function PaymentBreakdownCard({ byPaymentMethod, currency }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (byPaymentMethod.length === 0) return null;

  const labelKey = (m: PaymentMethodBucket): string => {
    switch (m) {
      case 'cash':
        return 'stats.paymentCash';
      case 'credit':
        return 'stats.paymentCredit';
      case 'debit':
        return 'stats.paymentDebit';
      default:
        return 'stats.paymentOther';
    }
  };

  const colorFor = (m: PaymentMethodBucket): string => {
    switch (m) {
      case 'cash':
        return theme.green;
      case 'credit':
        return theme.accent;
      case 'debit':
        return theme.blue;
      default:
        return theme.teal;
    }
  };

  return (
    <StatsSectionCard title={t('stats.paymentMethods')}>
      <View style={[styles.bar, { backgroundColor: theme.bgSoft }]}>
        {byPaymentMethod.map((p) => (
          <View
            key={p.method}
            style={{ flex: Math.abs(p.total), backgroundColor: colorFor(p.method) }}
          />
        ))}
      </View>

      <View style={styles.list}>
        {byPaymentMethod.map((p) => (
          <View key={p.method} style={styles.row}>
            <View style={styles.iconSlot}>
              <Icon name={iconFor(p.method)} size={16} color={colorFor(p.method)} stroke={1.8} />
            </View>
            <Text style={[styles.label, { color: theme.text }]} numberOfLines={1}>
              {t(labelKey(p.method))}
            </Text>
            <Text style={[styles.amount, { color: theme.text }]}>
              {formatAmount(p.total, currency)}
            </Text>
            <Text style={[styles.percent, { color: colorFor(p.method) }]}>
              {Math.round(p.percent)}%
            </Text>
          </View>
        ))}
      </View>
    </StatsSectionCard>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: sizing.radiusPill,
    overflow: 'hidden',
  },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconSlot: { width: 24, alignItems: 'center' },
  label: { ...typography.body, flex: 1 },
  amount: { ...typography.amountSmall },
  percent: { ...typography.micro, minWidth: 42, textAlign: 'right' },
});
