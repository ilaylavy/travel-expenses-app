import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
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

  const hasLocation = latitude != null;
  const label =
    status === 'capturing'
      ? t('expense.locationCapturing')
      : placeName
        ? placeName
        : hasLocation
          ? `${latitude.toFixed(4)}, ${longitude?.toFixed(4)}`
          : t('expense.locationMissing');

  return (
    <Section title={t('expense.locationSection')}>
      <View
        style={[
          styles.locationCard,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <Icon
          name="map-pin"
          size={14}
          color={hasLocation ? theme.accent : theme.textMuted}
          stroke={1.8}
        />
        <Text style={{ color: theme.text, flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <Pressable
          onPress={onRefresh}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('expense.locationRefresh')}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ color: theme.accent, fontWeight: '700' }}>
            {t('expense.locationRefresh')}
          </Text>
        </Pressable>
        {hasLocation ? (
          <Pressable
            onPress={onRemove}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('expense.locationRemove')}
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
    gap: spacing.md - 2,
    padding: spacing.md,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
  },
});
