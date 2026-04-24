import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TripForm, type TripFormValues } from '@/components/trip/TripForm';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { href } from '@/utils/nav';

export default function TripSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;
  const user = useAuthStore((s) => s.user);
  const trip = useTripStore((s) => s.trips.find((t) => t.id === tripId));
  const updateTrip = useTripStore((s) => s.updateTrip);
  const deleteTrip = useTripStore((s) => s.deleteTrip);

  const initial = useMemo<Partial<TripFormValues> | undefined>(
    () =>
      trip
        ? {
            name: trip.name,
            emoji: trip.emoji,
            startDate: trip.startDate,
            endDate: trip.endDate,
            baseCurrency: trip.baseCurrency,
            homeCurrency: trip.homeCurrency,
            budget: trip.budget,
          }
        : undefined,
    [trip],
  );

  if (!trip || !tripId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.missing}>
          <Text style={[styles.missingText, { color: theme.textSecondary }]}>Trip not found.</Text>
          <Pressable
            onPress={() => router.replace(href('/(main)'))}
            style={[styles.linkButton, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.linkButtonText}>Back to trips</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = user?.id === trip.ownerId;

  const handleSubmit = async (values: TripFormValues): Promise<void> => {
    await updateTrip({
      id: trip.id,
      name: values.name,
      emoji: values.emoji,
      startDate: values.startDate,
      endDate: values.endDate,
      baseCurrency: values.baseCurrency,
      homeCurrency: values.homeCurrency,
      budget: values.budget,
    });
    router.back();
  };

  const handleDelete = (): void => {
    Alert.alert(
      'Delete trip?',
      `This will delete "${trip.name}" and all its expenses. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTrip(trip.id);
              router.replace(href('/(main)'));
            } catch (e) {
              Alert.alert('Could not delete trip', e instanceof Error ? e.message : 'Unknown error');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[
            styles.backButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          hitSlop={8}
        >
          <Text style={[styles.backButtonText, { color: theme.text }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Trip Settings</Text>
        <View style={styles.spacer} />
      </View>

      <TripForm
        initial={initial}
        submitLabel="Save Changes"
        submittingLabel="Saving…"
        onSubmit={handleSubmit}
        footer={
          isOwner ? (
            <Pressable
              onPress={handleDelete}
              style={({ pressed }) => [
                styles.deleteButton,
                { backgroundColor: theme.redSoft, borderColor: theme.red, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.deleteText, { color: theme.red }]}>Delete Trip</Text>
            </Pressable>
          ) : null
        }
      />
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
  backButton: {
    width: sizing.headerButton,
    height: sizing.headerButton,
    borderRadius: sizing.headerButtonRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: { fontSize: 24, fontWeight: '600', lineHeight: 24 },
  title: { ...typography.screenTitle, flex: 1 },
  spacer: { width: sizing.headerButton },
  deleteButton: {
    marginTop: spacing.sm,
    borderRadius: sizing.radiusButton,
    borderWidth: 1.5,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteText: { fontSize: 14, fontWeight: '700' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.base },
  missingText: typography.body,
  linkButton: { borderRadius: sizing.radiusButton, paddingHorizontal: spacing.xl, paddingVertical: 12 },
  linkButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
