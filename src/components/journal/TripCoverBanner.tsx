// Hero banner at the top of All Days. Edge-to-edge cover + a dark bottom
// gradient + overlay copy: trip name (display weight), date range, and a
// "{N} days · {total} · {photos} photos" stats line. Long-press opens the
// trip-cover picker so the user can change the cover.

import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSignedJournalPhotoUrl } from '@/hooks/useSignedJournalPhotoUrl';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatAmount } from '@/utils/currency';
import { formatReadableDate } from '@/utils/date';

interface Props {
  tripName: string;
  startDate: string;
  endDate: string | null;
  dayCount: number;
  totalSpent: number;
  photoCount: number;
  homeCurrency: string;
  coverStoragePath: string | null;
  onChangeCover: () => void;
}

const HEIGHT = 210;

export function TripCoverBanner({
  tripName,
  startDate,
  endDate,
  dayCount,
  totalSpent,
  photoCount,
  homeCurrency,
  coverStoragePath,
  onChangeCover,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const url = useSignedJournalPhotoUrl(coverStoragePath);

  const range = endDate
    ? `${formatReadableDate(startDate)} – ${formatReadableDate(endDate)}`
    : `${formatReadableDate(startDate)} – ${t('common.ongoing')}`;

  return (
    <Pressable
      onLongPress={onChangeCover}
      delayLongPress={350}
      style={[styles.root, { height: HEIGHT }]}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={theme.gradient1}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {/* Three-stop bottom gradient — matches DayCoverHero so the two heros
          feel like part of the same visual system. */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.74)']}
        locations={[0, 0.52, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowDot} />
          <Text style={styles.eyebrow}>JOURNAL</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {tripName}
        </Text>
        <Text style={styles.range} numberOfLines={1}>
          {range}
        </Text>
        <Text style={styles.stats} numberOfLines={1}>
          {t('journal.tripSubtitle', {
            days: dayCount,
            spent: formatAmount(totalSpent, homeCurrency),
            photos: photoCount,
          })}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
  },
  overlay: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    right: 18,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    opacity: 0.85,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  range: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  stats: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: 0.2,
  },
});
