import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Trip, TripWithStats } from '@/types/trip';
import { formatAmount } from '@/utils/currency';
import { countDaysInRange, formatDateRange, todayIsoDate } from '@/utils/date';
import { initials } from '@/utils/initials';
import { getTripTint } from '@/utils/tripTint';

interface TripCardProps {
  trip: TripWithStats;
  onPress: () => void;
  onEdit?: () => void;
}

type TripPhase = 'upcoming' | 'ongoing' | 'past';
type StatusInfo = { label: string; phase: TripPhase };

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function getStatus(trip: Trip, t: Translate): StatusInfo {
  const today = todayIsoDate();
  if (trip.startDate > today) {
    const daysUntil = countDaysInRange(today, trip.startDate) - 1;
    if (daysUntil === 1) {
      return { label: t('trips.statusStartsTomorrow'), phase: 'upcoming' };
    }
    return {
      label: t('trips.statusStartsInDays', { count: daysUntil }),
      phase: 'upcoming',
    };
  }
  if (trip.endDate && trip.endDate < today) {
    const total = countDaysInRange(trip.startDate, trip.endDate);
    return { label: t('trips.statusWrappedDays', { count: total }), phase: 'past' };
  }
  const dayN = countDaysInRange(trip.startDate, today);
  if (trip.endDate) {
    const total = countDaysInRange(trip.startDate, trip.endDate);
    return {
      label: t('trips.statusDayOfTotal', { day: dayN, total }),
      phase: 'ongoing',
    };
  }
  return { label: t('trips.statusDay', { day: dayN }), phase: 'ongoing' };
}

export function TripCard({ trip, onPress, onEdit }: TripCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { stats } = trip;
  const hasBudget =
    trip.budget != null && trip.budget > 0 && stats.budgetHome != null && stats.budgetHome > 0;
  const pct = hasBudget ? Math.min(1, stats.totalSpent / (stats.budgetHome ?? 1)) : 0;
  const isShared = stats.memberCount > 1;
  const status = getStatus(trip, t);

  // Budget bar uses an indigo monochrome gradient under 90% and switches
  // to the red fill once over budget — that's the one approved
  // budget-warning gradient surface in the design system.
  const barGradient = pct > 0.9 ? null : theme.fabGradient;

  const statusBg =
    status.phase === 'ongoing'
      ? theme.tealSoft
      : status.phase === 'upcoming'
        ? theme.accentSoft
        : theme.bgSoft;
  const statusFg =
    status.phase === 'ongoing'
      ? theme.teal
      : status.phase === 'upcoming'
        ? theme.accentLight
        : theme.textMuted;

  const isOngoing = status.phase === 'ongoing';
  const tint = getTripTint(trip.id, theme);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.wrapper, { transform: [{ scale: pressed ? 0.99 : 1 }] }]}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: isOngoing ? theme.accent : theme.border,
            borderWidth: borderWidth.hairline,
            shadowColor: isOngoing ? theme.accent : 'transparent',
            shadowOpacity: isOngoing ? 0.18 : 0,
            shadowRadius: isOngoing ? 16 : 0,
            elevation: isOngoing ? 4 : 0,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Avatar
            label={initials(trip.name)}
            tint={tint}
            size={sizing.categoryIconLarge}
            radius={sizing.radiusCardInner}
            accessibilityLabel={trip.name}
          />
          <View style={styles.headerText}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {trip.name}
            </Text>
            <Text style={[styles.dates, { color: theme.textSecondary }]} numberOfLines={1}>
              {formatDateRange(trip.startDate, trip.endDate, t('common.ongoing'))}
            </Text>
          </View>
          <View style={styles.pills}>
            <View style={[styles.pill, { backgroundColor: statusBg }]}>
              <Text style={[styles.pillText, { color: statusFg }]} numberOfLines={1}>
                {status.label}
              </Text>
            </View>
            {isShared && (
              <View style={[styles.pill, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.pillText, { color: theme.accentLight }]}>
                  {t('trips.memberCount', { count: stats.memberCount })}
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
            <View style={styles.amountLine}>
              <Text style={[styles.amount, { color: theme.text }]}>
                {formatAmount(stats.totalSpent, trip.homeCurrency)}
              </Text>
              <Text style={[styles.amountCurrency, { color: theme.textMuted }]}>
                {trip.homeCurrency}
              </Text>
            </View>
          </View>
          {onEdit && (
            <Pressable
              onPress={onEdit}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('tripSettings.title')}
              style={({ pressed }) => [
                styles.editButton,
                {
                  backgroundColor: 'transparent',
                  borderColor: theme.border,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                },
              ]}
            >
              <Icon name="edit" size={15} color={theme.textSecondary} stroke={1.8} />
            </Pressable>
          )}
        </View>

        {hasBudget && (
          <View style={styles.budgetBlock}>
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
                    {
                      width: `${Math.round(Math.min(pct, 1) * 100)}%`,
                      backgroundColor: theme.red,
                    },
                  ]}
                />
              )}
            </View>
            <View style={styles.budgetMeta}>
              <Text style={[styles.budgetLabel, { color: theme.textMuted }]}>
                {t('trips.budget')}
              </Text>
              <Text style={[styles.budgetValue, { color: theme.textSecondary }]}>
                {formatAmount(stats.totalSpent, trip.homeCurrency)} /{' '}
                {formatAmount(stats.budgetHome ?? 0, trip.homeCurrency)}
              </Text>
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  card: {
    borderRadius: sizing.radiusCard,
    padding: spacing.xl,
    shadowOffset: { width: 0, height: 6 },
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  headerText: { flex: 1 },
  name: { ...typography.itemTitle, marginBottom: 2 }, // optical
  dates: typography.secondary,
  pills: { gap: spacing.xs, alignItems: 'flex-end' },
  pill: {
    borderRadius: sizing.radiusPill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3, // compact chip geometry
  },
  pillText: { ...typography.micro, textTransform: 'uppercase' },
  amountRow: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  amountCol: { flex: 1 },
  amountLabel: { ...typography.micro, textTransform: 'uppercase', marginBottom: spacing.xs },
  amountLine: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  amount: typography.amountMedium,
  amountCurrency: { ...typography.caption, fontWeight: '700' },
  editButton: {
    width: sizing.headerButton,
    height: sizing.headerButton,
    borderRadius: sizing.headerButtonRadius,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetBlock: { marginTop: spacing.lg, gap: spacing.sm },
  track: { height: 6, borderRadius: sizing.radiusPill, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: sizing.radiusPill },
  budgetMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetLabel: typography.micro,
  budgetValue: typography.caption,
});
