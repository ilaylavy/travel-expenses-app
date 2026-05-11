import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { Trip, TripWithStats } from '@/types/trip';
import { formatAmount } from '@/utils/currency';
import { countDaysInRange, formatDateRange, todayIsoDate } from '@/utils/date';

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

  const barGradient = pct > 0.9 ? null : pct > 0.7 ? theme.gradient2 : theme.gradient1;

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

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={theme.cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.card,
          {
            borderColor: isOngoing ? theme.accent : theme.border,
            borderWidth: isOngoing ? 1.5 : 1,
            shadowColor: isOngoing ? theme.accent : 'transparent',
            shadowOpacity: isOngoing ? 0.35 : 0,
            shadowRadius: isOngoing ? 20 : 0,
            elevation: isOngoing ? 6 : 2,
          },
        ]}
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
              accessibilityLabel={t('tripSettings.title')}
              style={({ pressed }) => [
                styles.editButton,
                {
                  backgroundColor: theme.accentSoft,
                  borderColor: theme.accent,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.editIcon, { color: theme.accent }]}>✎</Text>
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
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  pressed: { opacity: 0.85 },
  card: {
    borderRadius: sizing.radiusCard,
    padding: spacing.xl,
    shadowOffset: { width: 0, height: 6 },
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
  pills: { gap: 4, alignItems: 'flex-end' },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillText: { ...typography.micro, textTransform: 'uppercase' },
  amountRow: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  amountCol: { flex: 1 },
  amountLabel: { ...typography.micro, textTransform: 'uppercase', marginBottom: 4 },
  amountLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  amount: typography.amountMedium,
  amountCurrency: { ...typography.caption, fontWeight: '700' },
  editButton: {
    width: sizing.headerButton,
    height: sizing.headerButton,
    borderRadius: sizing.headerButtonRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editIcon: { fontSize: 18, fontWeight: '700' },
  budgetBlock: { marginTop: spacing.lg, gap: 6 },
  track: { height: 8, borderRadius: 8, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 8 },
  budgetMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetLabel: typography.micro,
  budgetValue: typography.caption,
});
