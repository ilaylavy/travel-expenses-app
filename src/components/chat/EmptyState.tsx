import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { TripWithStats } from '@/types/trip';

interface EmptyStateProps {
  trip: TripWithStats;
  onPick: (question: string) => void;
}

export function EmptyState({ trip, onPick }: EmptyStateProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const starterKeys: string[] = ['ask.starterFood', 'ask.starterExpensive', 'ask.starterPayment'];
  if (trip.stats.memberCount >= 2) starterKeys.push('ask.starterWho');
  if (trip.budget != null) starterKeys.push('ask.starterBudget');
  starterKeys.push('ask.starterWhere');

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={theme.gradient3}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroEmoji}>🧠</Text>
      </LinearGradient>
      <Text style={[styles.title, { color: theme.text }]}>{t('ask.title')}</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        {t('ask.subtitle')}
      </Text>

      <View style={styles.cards}>
        {starterKeys.map((key) => {
          const text = t(key);
          return (
            <Pressable
              key={key}
              onPress={() => onPick(text)}
              style={({ pressed }) => [
                styles.cardPressable,
                { transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
            >
              <LinearGradient
                colors={theme.cardGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.card, { borderColor: theme.border }]}
              >
                <Text style={[styles.cardText, { color: theme.text }]}>{text}</Text>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl + 2, // 24 — extra breathing room
    alignItems: 'center',
    gap: spacing.md - 2, // 8
  },
  hero: {
    width: 56,
    height: 56,
    borderRadius: sizing.radiusCardInner,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md - 2, // 8
  },
  heroEmoji: { fontSize: 28 },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 13, fontWeight: '500', marginBottom: spacing.md + 2 }, // 12
  cards: { width: '100%', gap: spacing.md - 2 },
  cardPressable: { width: '100%' },
  card: {
    borderRadius: sizing.radiusIcon, // 12
    borderWidth: borderWidth.hairline,
    padding: spacing.lg,
  },
  cardText: { fontSize: 13, fontWeight: '500' },
});
