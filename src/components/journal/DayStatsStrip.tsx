// Sparse stats strip below the cover hero. Money total sits left in
// display-scale weight; three count chips sit right (📸 / 🎤 / 💳) separated
// by tiny accent dots. Below: the inline LocationEditor + a thin accent
// hairline divider that doubles as the visual transition into the timeline.
//
// Money tap: opens a per-category breakdown sheet (wired in Phase 11).
// Chip tap: scrolls the timeline to the first entry of that kind (wired in
// Phase 5 via onChipPress).

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LocationEditor } from './LocationEditor';
import { useTheme } from '@/hooks/useTheme';
import { formatAmount } from '@/utils/currency';

type ChipKind = 'photo' | 'voice' | 'expense';

interface Props {
  totalConvertedAmount: number;
  homeCurrency: string;
  photoCount: number;
  voiceCount: number;
  expenseCount: number;
  effectiveLocation: string | null;
  isAutoLocation: boolean;
  onTotalPress: () => void;
  onChipPress: (kind: ChipKind) => void;
  onLocationChange: (next: string | null) => void;
}

export function DayStatsStrip({
  totalConvertedAmount,
  homeCurrency,
  photoCount,
  voiceCount,
  expenseCount,
  effectiveLocation,
  isAutoLocation,
  onTotalPress,
  onChipPress,
  onLocationChange,
}: Props) {
  const theme = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.row}>
        <Pressable
          onPress={onTotalPress}
          hitSlop={8}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.totalLabel, { color: theme.textMuted }]}>
            SPENT
          </Text>
          <Text style={[styles.total, { color: theme.text }]} numberOfLines={1}>
            {formatAmount(totalConvertedAmount, homeCurrency)}
          </Text>
        </Pressable>
        <View style={styles.chips}>
          <Chip
            emoji="📸"
            count={photoCount}
            tone="accent"
            onPress={() => onChipPress('photo')}
          />
          <Sep />
          <Chip
            emoji="🎤"
            count={voiceCount}
            tone="pink"
            onPress={() => onChipPress('voice')}
          />
          <Sep />
          <Chip
            emoji="💳"
            count={expenseCount}
            tone="green"
            onPress={() => onChipPress('expense')}
          />
        </View>
      </View>
      <View style={styles.locationRow}>
        <LocationEditor
          value={effectiveLocation}
          isAuto={isAutoLocation}
          onChange={onLocationChange}
        />
      </View>
      <View
        style={[styles.divider, { backgroundColor: theme.accent, opacity: 0.22 }]}
      />
    </View>
  );
}

function Sep() {
  const theme = useTheme();
  return (
    <View style={[styles.sepDot, { backgroundColor: theme.textMuted }]} />
  );
}

function Chip({
  emoji,
  count,
  tone,
  onPress,
}: {
  emoji: string;
  count: number;
  tone: 'accent' | 'pink' | 'green';
  onPress: () => void;
}) {
  const theme = useTheme();
  const colorMap = {
    accent: { fg: theme.accent, bg: theme.accentSoft },
    pink: { fg: theme.pink, bg: theme.pinkSoft },
    green: { fg: theme.green, bg: theme.greenSoft },
  } as const;
  const colors = colorMap[tone];
  const dim = count === 0;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      disabled={dim}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: dim ? 'transparent' : colors.bg,
          borderColor: dim ? theme.border : colors.bg,
        },
        pressed && { opacity: 0.7 },
        dim && { opacity: 0.55 },
      ]}
    >
      <Text style={styles.chipEmoji}>{emoji}</Text>
      <Text
        style={[
          styles.chipCount,
          { color: dim ? theme.textMuted : colors.fg },
        ]}
      >
        {count}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  totalLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  total: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.7,
    lineHeight: 30,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipEmoji: { fontSize: 12 },
  chipCount: { fontSize: 12, fontWeight: '800', letterSpacing: -0.2 },
  sepDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.4,
  },
  locationRow: {
    marginTop: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 14,
  },
});
