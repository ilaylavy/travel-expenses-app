import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

// Placeholder that mirrors TripCard's layout (monogram tile + name/dates +
// amount + budget bar) while the trips store is hydrating from SQLite. Uses
// the shared `Skeleton` shimmer primitive — same keyframe across every
// loading surface in the app.
export function TripCardSkeleton() {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.borderLight },
      ]}
    >
      <View style={styles.headerRow}>
        <Skeleton
          width={sizing.categoryIconLarge}
          height={sizing.categoryIconLarge}
          radius={sizing.radiusCardInner}
        />
        <View style={styles.headerText}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="45%" height={11} />
        </View>
      </View>
      <View style={styles.amountRow}>
        <Skeleton width="50%" height={22} />
      </View>
      <Skeleton width="100%" height={8} radius={sizing.radiusPill} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: sizing.radiusCard,
    borderWidth: borderWidth.hairline,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.lg,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  headerText: { flex: 1, gap: spacing.sm },
  amountRow: { marginTop: spacing.xs },
});
