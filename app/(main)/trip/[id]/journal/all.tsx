// Pushed All Days screen — opened from the smart-routed Day tab via the
// hamburger button in DateStrip. Renders AllDaysScreen with an overlaid
// back arrow so the user can pop back to wherever they came from.
//
// Why this route exists: `(tabs)/journal.tsx` smart-routes between Day
// (when the trip is active) and All Days (otherwise). When the trip is
// active there's no other way to reach AllDaysScreen — pushing back to
// the journal tab just re-renders DayScreen. This route gives "All Days"
// a real address.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AllDaysScreen } from '@/components/journal/AllDaysScreen';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

export default function PushedAllDaysScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  if (!tripId) return null;

  return (
    <View style={styles.root}>
      <AllDaysScreen tripId={tripId} />
      {/* Absolutely-positioned back button overlay. pointerEvents=box-none
          on the wrapper so taps that miss the chip pass through to the
          AllDaysScreen content beneath. */}
      <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.headerOverlay}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: theme.surface, borderColor: theme.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.backGlyph, { color: theme.text }]}>‹</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
  },
  backBtn: {
    width: 36,
    height: 36,
    marginTop: 8,
    marginInlineStart: 10,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { fontSize: 22, fontWeight: '700', lineHeight: 24, marginTop: -2 },
});
