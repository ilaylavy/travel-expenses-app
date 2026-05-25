// Edge-to-edge cinematic cover hero for a single day. Renders the day's
// cover photo (resolved via useSignedJournalPhotoUrl) under a dramatic
// 3-stop bottom-anchored gradient that keeps the overlay text legible
// regardless of the image. When no cover is set, falls back to a soft
// gradient placeholder with a single emoji glyph + a "Tap to set a cover
// photo" prompt — long-press on either state opens the same picker.
//
// Visual contract: HERO_HEIGHT-tall block flush to the screen edges (no
// horizontal padding, no outer corners). The overlay text is anchored to
// the bottom-start corner with display-scale weight, layered over the
// gradient. The optional "DAY N · WEEKDAY" eyebrow ribbon adds a
// passport-stamp feel above the date line.

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSignedJournalPhotoUrl } from '@/hooks/useSignedJournalPhotoUrl';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatReadableDate } from '@/utils/date';

interface Props {
  dayDate: string;
  isToday: boolean;
  dayIndex: number | null;
  dayTotal: number | null;
  effectiveLocation: string | null;
  coverStoragePath: string | null;
  onPlaceholderPress: () => void;
  onCoverLongPress: () => void;
}

const HERO_HEIGHT = 300;

export function DayCoverHero({
  dayDate,
  isToday,
  dayIndex,
  dayTotal,
  effectiveLocation,
  coverStoragePath,
  onPlaceholderPress,
  onCoverLongPress,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const coverUrl = useSignedJournalPhotoUrl(coverStoragePath);

  // Gentle fade-in once the signed URL resolves — prevents a hard pop.
  const fade = useRef(new Animated.Value(coverUrl ? 1 : 0)).current;
  useEffect(() => {
    if (!coverUrl) return;
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [coverUrl, fade]);

  const weekday = new Date(`${dayDate}T00:00:00Z`)
    .toLocaleDateString(undefined, { weekday: 'long' });
  const dayLabel = isToday ? t('journal.today') : formatReadableDate(dayDate);

  // Eyebrow: "DAY 3 OF 7 · THURSDAY" or "DAY 3 · THURSDAY"
  const eyebrowParts: string[] = [];
  if (dayIndex != null) {
    if (dayTotal != null) {
      eyebrowParts.push(t('journal.dayOfTotal', { n: dayIndex, total: dayTotal }));
    } else {
      eyebrowParts.push(`Day ${dayIndex}`);
    }
  }
  eyebrowParts.push(weekday);
  const eyebrow = eyebrowParts.join(' · ').toUpperCase();

  const subLine = effectiveLocation ?? '';

  if (!coverUrl) {
    // Placeholder state: soft gradient field, glyph, prompt. Long-press
    // and tap both reach the same picker (Lesson #12), so we use a single
    // Pressable that calls onPlaceholderPress on tap.
    return (
      <Pressable
        onPress={onPlaceholderPress}
        onLongPress={onPlaceholderPress}
        style={[styles.root, { height: HERO_HEIGHT }]}
      >
        <LinearGradient
          colors={theme.gradient1}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Subtle noise via overlapping low-alpha gradient adds film texture without an asset. */}
        <LinearGradient
          colors={['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.12)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.placeholderCenter}>
          <View style={styles.placeholderGlyphRing}>
            <Text style={styles.placeholderGlyph}>📷</Text>
          </View>
          <Text style={styles.placeholderPrompt} numberOfLines={2}>
            {t('journal.coverPlaceholder')}
          </Text>
        </View>
        <OverlayText eyebrow={eyebrow} dayLabel={dayLabel} subLine={subLine} />
      </Pressable>
    );
  }

  return (
    <Pressable
      onLongPress={onCoverLongPress}
      delayLongPress={350}
      style={[styles.root, { height: HERO_HEIGHT }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      </Animated.View>
      {/* Three-stop dark gradient — bottom-anchored, deepens overlay legibility */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.32)', 'rgba(0,0,0,0.72)']}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Subtle top vignette so the date strip above doesn't fight a too-bright sky. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.32)', 'rgba(0,0,0,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.4 }}
        style={[StyleSheet.absoluteFill, { height: HERO_HEIGHT * 0.4 }]}
      />
      <OverlayText eyebrow={eyebrow} dayLabel={dayLabel} subLine={subLine} />
    </Pressable>
  );
}

function OverlayText({
  eyebrow,
  dayLabel,
  subLine,
}: {
  eyebrow: string;
  dayLabel: string;
  subLine: string;
}) {
  return (
    <View style={styles.overlay} pointerEvents="none">
      {eyebrow.length > 0 ? (
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowDot} />
          <Text style={styles.eyebrow} numberOfLines={1}>
            {eyebrow}
          </Text>
        </View>
      ) : null}
      <Text style={styles.dayLabel} numberOfLines={1}>
        {dayLabel}
      </Text>
      {subLine.length > 0 ? (
        <Text style={styles.subLine} numberOfLines={1}>
          📍 {subLine}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
  },
  placeholderCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 64, // leave room for the overlay text at the bottom
  },
  placeholderGlyphRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  placeholderGlyph: { fontSize: 34 },
  placeholderPrompt: {
    marginTop: 14,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    bottom: 20,
    left: 18,
    right: 18,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    opacity: 0.85,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  dayLabel: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  subLine: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: 0.1,
  },
});
