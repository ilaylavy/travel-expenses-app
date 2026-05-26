import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useIsRTL } from '@/hooks/useIsRTL';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface AskAnythingCardProps {
  onPress: () => void;
}

// Trip-dashboard entry point to the AI Ask tab. Mirrors
// design-system/components/ai-card.html — accent-soft surface, 1px accent
// border, 18px radius, with a solid accent tile holding the sparkles icon.
export function AskAnythingCard({ onPress }: AskAnythingCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const isRTL = useIsRTL();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('tripView.askCardTitle')}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.accentSoft,
          borderColor: theme.accent,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <View style={[styles.iconTile, { backgroundColor: theme.accent }]}>
        <Icon name="sparkles" size={20} color="#FFFFFF" stroke={2} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {t('tripView.askCardTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
          {t('tripView.askCardSubtitle')}
        </Text>
      </View>
      <Icon
        name={isRTL ? 'chevron-left' : 'chevron-right'}
        size={18}
        color={theme.accent}
        stroke={2}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
    borderRadius: sizing.radiusCardInner,
    borderWidth: borderWidth.hairline,
    marginBottom: spacing.sm,
  },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: sizing.radiusIcon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '700', lineHeight: 17 },
  subtitle: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
});
