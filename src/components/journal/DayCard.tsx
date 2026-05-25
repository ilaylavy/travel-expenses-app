// Day card for the All Days list. Cover thumbnail on the inline-start, info
// stack on the inline-end:
//   • Day N · weekday, date    (the row eyebrow)
//   • Location · total spent
//   • 📸 N · 🎤 N · 💳 N        (three counts — all three per Lesson #10)
//   • ✦ moment chips           (rendered when Moments exist for this day)
// Tapping the card pushes the Day screen for that date.

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
  const isEmpty =
    summary.photoCount + summary.voiceCount + summary.expenseCount === 0;

  const eyebrow = t('journal.dayOfTotal', {
    n: summary.dayIndex,
    total: dayTotal ?? '–',
  });
  const weekday = new Date(`${summary.dayDate}T00:00:00Z`).toLocaleDateString(
    undefined,
    { weekday: 'short' },
  );
  const titleLine = `${weekday}, ${formatReadableDate(summary.dayDate)}`;
  const metaLine = summary.effectiveLocation
    ? `${summary.effectiveLocation} · ${formatAmount(summary.totalConvertedAmount, homeCurrency)}`
    : formatAmount(summary.totalConvertedAmount, homeCurrency);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
        pressed && { transform: [{ scale: 0.985 }], opacity: 0.92 },
        isEmpty && { opacity: 0.7 },
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
        {/* Day-number ribbon overlaid on the cover — passport-stamp feel. */}
        <View style={[styles.dayBadge, { backgroundColor: theme.accent }]}>
          <Text style={styles.dayBadgeNum}>{summary.dayIndex}</Text>
        </View>
      </View>
      <View style={styles.info}>
        <Text style={[styles.eyebrow, { color: theme.accent }]} numberOfLines={1}>
          {eyebrow.toUpperCase()}
        </Text>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {titleLine}
        </Text>
        <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>
          {metaLine}
        </Text>
        {isEmpty ? (
          <Text style={[styles.empty, { color: theme.textMuted }]}>
            {t('journal.emptyDay')}
          </Text>
        ) : (
          <View style={styles.chips}>
            <Chip emoji="📸" count={summary.photoCount} />
            <Sep />
            <Chip emoji="🎤" count={summary.voiceCount} />
            <Sep />
            <Chip emoji="💳" count={summary.expenseCount} />
          </View>
        )}
        {summary.momentTitles.length > 0 ? (
          <View style={styles.momentChips}>
            {summary.momentTitles.map((title, i) => (
              <View
                key={`${title}-${i}`}
                style={[
                  styles.momentChip,
                  {
                    backgroundColor: theme.accentSoft,
                    borderColor: theme.accent,
                  },
                ]}
              >
                <Text
                  style={[styles.momentChipTxt, { color: theme.accent }]}
                  numberOfLines={1}
                >
                  ✦ {title}
                </Text>
              </View>
            ))}
            {summary.momentCount > summary.momentTitles.length ? (
              <View
                style={[
                  styles.momentChip,
                  {
                    backgroundColor: theme.bgSoft,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text style={[styles.momentChipTxt, { color: theme.textMuted }]}>
                  +{summary.momentCount - summary.momentTitles.length}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function Chip({ emoji, count }: { emoji: string; count: number }) {
  const theme = useTheme();
  return (
    <Text style={[styles.chipText, { color: theme.text }]}>
      {emoji} {count}
    </Text>
  );
}

function Sep() {
  const theme = useTheme();
  return <Text style={[styles.chipSep, { color: theme.textMuted }]}>·</Text>;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 14,
    padding: 12,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    alignItems: 'center',
  },
  heroWrap: {
    width: 88,
    height: 88,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  hero: { width: '100%', height: '100%' },
  dayBadge: {
    position: 'absolute',
    top: 6,
    insetInlineStart: 6,
    minWidth: 22,
    paddingHorizontal: 6,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeNum: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.1,
    fontVariant: ['tabular-nums'],
  },
  info: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  meta: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  empty: {
    fontSize: 11,
    fontWeight: '500',
    fontStyle: 'italic',
    marginTop: 8,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  chipText: { fontSize: 11, fontWeight: '700' },
  chipSep: { fontSize: 11, opacity: 0.5 },
  momentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  momentChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 140,
  },
  momentChipTxt: { fontSize: 10, fontWeight: '700' },
});
