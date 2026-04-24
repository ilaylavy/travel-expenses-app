import { useGlobalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SyncStatusDot } from '@/components/ui/SyncStatusDot';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useTripStore } from '@/stores/tripStore';
import { syncEngine } from '@/sync/syncEngine';
import { formatAmount } from '@/utils/currency';
import { formatDateRange } from '@/utils/date';
import { href } from '@/utils/nav';

export default function TripDashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useGlobalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;
  const trip = useTripStore((s) => s.trips.find((x) => x.id === tripId));

  if (!trip || !tripId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.missing}>
          <Text style={{ color: theme.textSecondary }}>{t('trips.notFound')}</Text>
          <Pressable
            onPress={() => router.replace(href('/(main)'))}
            style={[styles.linkButton, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.linkButtonText}>{t('trips.backToTrips')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[
            styles.headerButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          hitSlop={8}
        >
          <Text style={[styles.headerButtonText, { color: theme.text }]}>‹</Text>
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerEmoji]}>{trip.emoji}</Text>
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {trip.name}
          </Text>
        </View>
        <Pressable
          onPress={() => { void syncEngine.triggerSync(); }}
          style={[
            styles.headerButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          hitSlop={8}
        >
          <SyncStatusDot />
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={[styles.dates, { color: theme.textSecondary }]}>
          {formatDateRange(trip.startDate, trip.endDate, t('common.ongoing'))}
        </Text>
        <View style={[styles.totalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.totalLabel, { color: theme.textMuted }]}>
            {t('trips.totalSpent')}
          </Text>
          <Text style={[styles.totalAmount, { color: theme.text }]}>
            {formatAmount(trip.stats.totalSpent, trip.homeCurrency)}
          </Text>
        </View>

        <Pressable
          onPress={() => router.push(href(`/add-expense?tripId=${tripId}`))}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={styles.addButtonText}>＋ {t('tripView.addExpense')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerButton: {
    width: sizing.headerButton,
    height: sizing.headerButton,
    borderRadius: sizing.headerButtonRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: { fontSize: 18, fontWeight: '600', lineHeight: 20 },
  headerTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerEmoji: { fontSize: 24 },
  headerTitle: { ...typography.itemTitle, flex: 1 },
  content: { padding: spacing.base, gap: spacing.lg },
  dates: { ...typography.body },
  totalCard: {
    borderRadius: sizing.radiusCard,
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  totalLabel: { ...typography.micro },
  totalAmount: { ...typography.amountLarge },
  addButton: {
    borderRadius: sizing.radiusButton,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.base },
  linkButton: { borderRadius: sizing.radiusButton, paddingHorizontal: spacing.xl, paddingVertical: 12 },
  linkButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
