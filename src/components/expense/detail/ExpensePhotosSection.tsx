import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { ExpensePhoto } from '@/types/expense';

import { PhotoThumb } from './PhotoThumb';

export function ExpensePhotosSection({
  photos,
  onTap,
}: {
  photos: ExpensePhoto[];
  onTap: (index: number) => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (photos.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
        {t('expenseDetail.photosLabel').toUpperCase()}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {photos.map((photo, index) => (
          <PhotoThumb
            key={photo.id}
            photo={photo}
            borderColor={theme.border}
            onPress={() => onTap(index)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionLabel: { ...typography.micro, paddingHorizontal: spacing.xs },
  row: { gap: spacing.sm, paddingVertical: 4 },
});
