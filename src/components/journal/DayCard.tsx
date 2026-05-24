// Compact day card for the journal Chapter (All-days) view. Shows a small
// hero thumbnail (cover photo when present, else the gradient fallback used
// by DaySummaryCard for visual consistency), the day index, date + effective
// location, and three chips: photo count, voice count, day total.

import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSignedJournalPhotoUrl } from '@/hooks/useSignedJournalPhotoUrl';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { DaySummary } from '@/types/journal';
import { formatAmount } from '@/utils/currency';
import { formatReadableDate } from '@/utils/date';

interface Props {
  summary: DaySummary;
  homeCurrency: string;
  dayTotal: number | null;
  onPress: () => void;
}

export function DayCard({ summary, homeCurrency, dayTotal, onPress }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const heroUrl = useSignedJournalPhotoUrl(summary.coverStoragePath);

  const title = t('journal.dayOfTotal', {
    n: summary.dayIndex,
    total: dayTotal ?? '–',
  });

  const dateLine = summary.effectiveLocation
    ? `${formatReadableDate(summary.dayDate)} · ${summary.effectiveLocation}`
    : formatReadableDate(summary.dayDate);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && { transform: [{ scale: 0.99 }], opacity: 0.92 },
      ]}
    >
      <View style={styles.heroWrap}>
        {heroUrl ? (
          <Image source={{ uri: heroUrl }} style={styles.hero} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={theme.gradient1}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          />
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>
          {dateLine}
        </Text>
        <View style={styles.chips}>
          <Chip text={`📸 ${summary.photoCount}`} />
          <Chip text={`🎤 ${summary.voiceCount}`} />
          <Chip text={formatAmount(summary.totalConvertedAmount, homeCurrency)} />
        </View>
      </View>
    </Pressable>
  );
}

function Chip({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: theme.accentSoft }]}>
      <Text style={[styles.chipText, { color: theme.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    alignItems: 'center',
  },
  heroWrap: {
    width: 72,
    height: 72,
    borderRadius: 14,
    overflow: 'hidden',
  },
  hero: { width: '100%', height: '100%' },
  info: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '800' },
  meta: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  chips: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '700' },
});
