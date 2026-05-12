import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { LocationStatus } from '@/hooks/useExpenseEntryForm';

import { Section } from './Section';

export function LocationSection({
  status,
  latitude,
  longitude,
  placeName,
  onRefresh,
  onRemove,
}: {
  status: LocationStatus;
  latitude: number | null;
  longitude: number | null;
  placeName: string | null;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Section title={t('expense.locationSection')}>
      <View
        style={[
          styles.locationCard,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Text style={{ color: theme.text, flex: 1 }} numberOfLines={1}>
          {status === 'capturing'
            ? t('expense.locationCapturing')
            : placeName
              ? `📍 ${placeName}`
              : latitude != null
                ? `📍 ${latitude.toFixed(4)}, ${longitude?.toFixed(4)}`
                : t('expense.locationMissing')}
        </Text>
        <Pressable
          onPress={onRefresh}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ color: theme.accent, fontWeight: '700' }}>
            {t('expense.locationRefresh')}
          </Text>
        </Pressable>
        {latitude != null ? (
          <Pressable
            onPress={onRemove}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ color: theme.textMuted, fontWeight: '600' }}>
              {t('expense.locationRemove')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
  },
});
