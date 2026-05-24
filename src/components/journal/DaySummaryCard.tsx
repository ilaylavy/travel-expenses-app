// Hero card crowning the journal Today view. Cover photo (or a gradient
// placeholder when there are no photos yet), the day index + date, the
// day's converted spend total, three count chips (photos / voice /
// expenses) and an inline location editor. Card outline is built on a
// theme.cardGradient so the surface gets subtle depth in both modes.

import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useSignedJournalPhotoUrl } from '@/hooks/useSignedJournalPhotoUrl';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { formatAmount } from '@/utils/currency';

import { LocationEditor } from './LocationEditor';

interface Props {
  tripId: string;
  dayDate: string;
  dayIndex: number;
  dayTotal: number | null;
  isToday: boolean;
  totalConvertedAmount: number;
  homeCurrency: string;
  photoCount: number;
  voiceCount: number;
  expenseCount: number;
  coverStoragePath: string | null;
  effectiveLocation: string | null;
  onLocationChange: (next: string | null) => void;
}

export function DaySummaryCard(props: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const coverUrl = useSignedJournalPhotoUrl(props.coverStoragePath);

  const dayHeader = t('journal.dayOfTotal', {
    n: props.dayIndex,
    total: props.dayTotal ?? '–',
  });

  return (
    <LinearGradient
      colors={theme.cardGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { borderColor: theme.border }]}
    >
      <View style={styles.heroWrap}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.hero} />
        ) : (
          <LinearGradient
            colors={theme.gradient1}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          />
        )}
      </View>
      <View style={styles.row1}>
        <View style={styles.flex1}>
          <Text style={[styles.dayNum, { color: theme.text }]} numberOfLines={1}>
            {dayHeader}
          </Text>
          <Text style={[styles.date, { color: theme.textMuted }]} numberOfLines={1}>
            {props.isToday ? `${t('journal.today')} · ${props.dayDate}` : props.dayDate}
          </Text>
        </View>
        <View style={styles.amountCol}>
          <Text style={[styles.amount, { color: theme.text }]} numberOfLines={1}>
            {formatAmount(props.totalConvertedAmount, props.homeCurrency)}
          </Text>
          <Text style={[styles.amountLabel, { color: theme.textMuted }]} numberOfLines={1}>
            {t('journal.totalToday')}
          </Text>
        </View>
      </View>
      <View style={styles.stats}>
        <Text style={[styles.stat, { color: theme.text }]}>
          📸 <Text style={styles.statNum}>{props.photoCount}</Text>
        </Text>
        <Text style={[styles.stat, { color: theme.text }]}>
          🎤 <Text style={styles.statNum}>{props.voiceCount}</Text>
        </Text>
        <Text style={[styles.stat, { color: theme.text }]}>
          📋 <Text style={styles.statNum}>{props.expenseCount}</Text>
        </Text>
      </View>
      <LocationEditor
        value={props.effectiveLocation}
        isAuto={props.effectiveLocation != null}
        onChange={props.onLocationChange}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroWrap: { borderRadius: 18, overflow: 'hidden', marginBottom: 12 },
  hero: { width: '100%', height: 120 },
  row1: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 },
  flex1: { flex: 1, minWidth: 0 },
  amountCol: { alignItems: 'flex-end' },
  dayNum: { fontSize: 18, fontWeight: '800' },
  date: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  amount: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  amountLabel: { fontSize: 10, fontWeight: '500', marginTop: 2 },
  stats: { flexDirection: 'row', gap: 16, marginTop: 12 },
  stat: { fontSize: 13 },
  statNum: { fontWeight: '800' },
});
