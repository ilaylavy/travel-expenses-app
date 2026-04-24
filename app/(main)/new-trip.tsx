import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TripForm, type TripFormValues } from '@/components/trip/TripForm';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTripStore } from '@/stores/tripStore';

export default function NewTripScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const defaultCurrency = useSettingsStore((s) => s.defaultCurrency);
  const createTrip = useTripStore((s) => s.createTrip);

  const handleSubmit = async (values: TripFormValues): Promise<void> => {
    if (!user) throw new Error('You must be signed in to create a trip');
    await createTrip({
      name: values.name,
      emoji: values.emoji,
      startDate: values.startDate,
      endDate: values.endDate,
      baseCurrency: values.baseCurrency,
      homeCurrency: values.homeCurrency,
      budget: values.budget,
      ownerId: user.id,
    });
    router.back();
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
        <Text style={[styles.title, { color: theme.text }]}>New Trip</Text>
        <View style={styles.spacer} />
      </View>

      <TripForm
        submitLabel="Create Trip"
        submittingLabel="Creating…"
        initial={{
          baseCurrency: defaultCurrency,
          homeCurrency: defaultCurrency,
        }}
        onSubmit={handleSubmit}
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
});
