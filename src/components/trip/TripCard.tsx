import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { TripWithStats } from '@/types/trip';
import { formatAmount } from '@/utils/currency';
import { formatDateRange } from '@/utils/date';

interface TripCardProps {
  trip: TripWithStats;
  onPress: () => void;
}

export function TripCard({ trip, onPress }: TripCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { stats } = trip;
  const hasBudget = trip.budget != null && trip.budget > 0;
  const pct = hasBudget ? Math.min(1, stats.totalSpent / (trip.budget ?? 1)) : 0;
  const isOngoing = trip.endDate == null;
  const isShared = stats.memberCount > 1;

  const barGradient =
    pct > 0.9 ? null : pct > 0.7 ? theme.gradient2 : theme.gradient1;
  const overBudgetColor = theme.red;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}>
      <LinearGradient
        colors={theme.cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: theme.border }]}
      >
        <View style={styles.headerRow}>
          <View
            style={[
              styles.emojiBox,
              { backgroundColor: theme.accentSoft, borderColor: theme.borderLight },
            ]}
          >
            <Text style={styles.emoji}>{trip.emoji}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {trip.name}
            </Text>
            <Text style={[styles.dates, { color: theme.textSecondary }]} numberOfLines={1}>
              {formatDateRange(trip.startDate, trip.endDate, t('common.ongoing'))}
            </Text>
          </View>
          <View style={styles.badges}>
            {isOngoing && (
              <View style={[styles.badge, { backgroundColor: theme.tealSoft }]}>
                <Text style={[styles.badgeText, { color: theme.teal }]}>
                  {t('trips.ongoingBadge')}
                </Text>
              </View>
            )}
            {isShared && (
              <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.badgeText, { color: theme.accentLight }]}>
                  {t('trips.sharedBadge')}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.amountRow}>
          <View style={styles.amountCol}>
            <Text style={[styles.amountLabel, { color: theme.textMuted }]}>
              {t('trips.totalSpent')}
            </Text>
            <Text style={[styles.amount, { color: theme.text }]}>
              {formatAmount(stats.totalSpent, trip.homeCurrency)}
            </Text>
          </View>
          <View style={[styles.currencyChip, { backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.currencyChipText, { color: theme.accentLight }]}>
              {trip.baseCurrency}
            </Text>
          </View>
        </View>

        {hasBudget && (
          <View style={styles.budgetBlock}>
            <View style={styles.budgetHeader}>
              <Text style={[styles.budgetLabel, { color: theme.textMuted }]}>
                {t('trips.budget')}
              </Text>
              <Text style={[styles.budgetValue, { color: theme.textSecondary }]}>
                {formatAmount(stats.totalSpent, trip.baseCurrency)} /{' '}
                {formatAmount(trip.budget ?? 0, trip.baseCurrency)}
              </Text>
            </View>
            <View style={[styles.track, { backgroundColor: theme.bgSoft }]}>
              {barGradient ? (
                <LinearGradient
                  colors={barGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.trackFill, { width: `${Math.round(pct * 100)}%` }]}
                />
              ) : (
                <View
                  style={[
                    styles.trackFill,
                    { width: `${Math.round(Math.min(pct, 1) * 100)}%`, backgroundColor: overBudgetColor },
                  ]}
                />
              )}
            </View>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  pressed: { opacity: 0.85 },
  card: {
    borderRadius: sizing.radiusCard,
    borderWidth: 1.5,
    padding: spacing.xl,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  emojiBox: {
    width: sizing.categoryIconLarge,
    height: sizing.categoryIconLarge,
    borderRadius: sizing.radiusCardInner,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 26 },
  headerText: { flex: 1 },
  name: { ...typography.itemTitle, marginBottom: 2 },
  dates: typography.secondary,
  badges: { gap: 4, alignItems: 'flex-end' },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { ...typography.micro },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  amountCol: { flex: 1 },
  amountLabel: { ...typography.micro, marginBottom: 4 },
  amount: typography.amountMedium,
  currencyChip: {
    borderRadius: sizing.radiusSmall,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  currencyChipText: { fontSize: 12, fontWeight: '700' },
  budgetBlock: { marginTop: spacing.lg },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  budgetLabel: typography.micro,
  budgetValue: typography.caption,
  track: {
    height: 6,
    borderRadius: 6,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', borderRadius: 6 },
});
