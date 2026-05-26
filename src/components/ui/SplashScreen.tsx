import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

// In-app splash. Renders while settings + auth are hydrating; the Expo
// static splash hands off to this the moment the JS bundle is ready.
// Wordmark, gradient tile, tagline, and a soft accent pulse beneath.
// NOTE: i18n is not yet initialized when this mounts (initI18n runs as
// part of settings hydrate, which is exactly the state we're rendering
// for). Don't call useTranslation here — the tagline stays in English
// for the few hundred ms before the app is ready.
export function SplashScreen() {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.center}>
        <LinearGradient
          colors={theme.fabGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.tile, { shadowColor: theme.accent }]}
        >
          <Icon name="flight" size={32} color="#FFFFFF" stroke={2} />
        </LinearGradient>
        <Text style={[styles.wordmark, { color: theme.text }]}>
          Travel<Text style={{ color: theme.accent }}>·</Text>Expenses
        </Text>
        <Text style={[styles.tagline, { color: theme.textMuted }]}>
          Spend less. See more.
        </Text>
        <Animated.View
          style={[
            styles.spinnerDot,
            { backgroundColor: theme.accent, opacity: pulse },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', gap: spacing.md },
  tile: {
    width: 64,
    height: 64,
    borderRadius: sizing.radiusCardInner,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.32,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    marginBottom: spacing.sm,
  },
  wordmark: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginTop: -spacing.xs,
  },
  spinnerDot: {
    marginTop: spacing.lg,
    width: 8,
    height: 8,
    borderRadius: sizing.radiusPill,
  },
});
