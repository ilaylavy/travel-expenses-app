import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
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
      <View style={[styles.hero, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
        <Icon name="sparkles" size={28} color={theme.accent} stroke={2} />
      </View>
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
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.cardPressable,
                { transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
            >
              <View
                style={[
                  styles.card,
                  { borderColor: theme.border, backgroundColor: theme.surface },
                ]}
              >
                <Text style={[styles.cardText, { color: theme.text }]}>{text}</Text>
              </View>
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
    paddingVertical: spacing.xxl + 2, // 30 — extra breathing room
    alignItems: 'center',
    gap: spacing.sm,
  },
  hero: {
    width: 56,
    height: 56,
    borderRadius: sizing.radiusCardInner,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.hairline,
    marginBottom: spacing.sm,
  },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 13, fontWeight: '500', marginBottom: spacing.md + 2 }, // 14
  cards: { width: '100%', gap: spacing.sm + 2 },
  cardPressable: { width: '100%' },
  card: {
    borderRadius: sizing.radiusCardInner,
    borderWidth: borderWidth.hairline,
    padding: spacing.lg,
  },
  cardText: { fontSize: 13, fontWeight: '500' },
});
