import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface SettledEmptyCardProps {
  // Number of shared expenses across the trip — used in the body copy
  // ("Across N shared expenses, everything balances out").
  sharedExpenseCount: number;
}

// The "you're all even" empty state. Shown when neither side of the
// outstanding summary has any rows. Green-soft surface so it reads as
// success, not absence.
export function SettledEmptyCard({ sharedExpenseCount }: SettledEmptyCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.greenSoft, borderColor: theme.green },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: 'rgba(52, 194, 139, 0.18)' }]}>
        <Icon name="check" size={26} color={theme.green} stroke={2.4} />
      </View>
      <Text style={[styles.title, { color: theme.text }]}>
        {t('balances.settledEmptyTitle')}
      </Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        {t('balances.settledEmptyBody', { count: sharedExpenseCount })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg + 4,
    borderRadius: sizing.radiusCardInner - 2,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs + 2,
  },
  title: { ...typography.itemTitle, fontSize: 15 },
  body: {
    ...typography.secondary,
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 17,
  },
});
