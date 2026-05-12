import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

// Placeholder that mirrors TripCard's layout (emoji box + name/dates + amount
// + budget bar) while the trips store is hydrating from SQLite. Gentle opacity
// pulse so the user sees forward motion instead of a static block.
export function TripCardSkeleton() {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const blockColor = theme.bgSoft;

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.borderLight,
          opacity: pulse,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.emojiBox, { backgroundColor: blockColor }]} />
        <View style={styles.headerText}>
          <View style={[styles.line, { width: '70%', backgroundColor: blockColor }]} />
          <View
            style={[styles.line, styles.lineSub, { width: '45%', backgroundColor: blockColor }]}
          />
        </View>
      </View>
      <View style={styles.amountRow}>
        <View style={[styles.lineLarge, { width: '50%', backgroundColor: blockColor }]} />
      </View>
      <View style={[styles.bar, { backgroundColor: blockColor }]} />
    </Animated.View>
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
  emojiBox: {
    width: sizing.categoryIconLarge,
    height: sizing.categoryIconLarge,
    borderRadius: sizing.radiusCardInner,
  },
  headerText: { flex: 1, gap: spacing.sm },
  line: { height: 14, borderRadius: sizing.radiusPill },
  lineSub: { height: 11 },
  amountRow: { marginTop: spacing.xs },
  lineLarge: { height: 22, borderRadius: sizing.radiusPill },
  bar: { height: 8, borderRadius: sizing.radiusPill, width: '100%' },
});
