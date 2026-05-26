import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { DraftPhoto } from '@/hooks/usePhotoCapture';
import { showConfirmDialog } from '@/utils/confirmDialog';

import { Section } from './Section';

export function PhotoSection({
  photos,
  onCamera,
  onGallery,
  onRemove,
}: {
  photos: DraftPhoto[];
  onCamera: () => void;
  onGallery: () => void;
  onRemove: (uri: string) => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Section title={t('expense.photosSection')}>
      <View style={styles.photoButtonRow}>
        <Pressable
          onPress={onCamera}
          accessibilityRole="button"
          accessibilityLabel={t('expense.photosCamera')}
          style={({ pressed }) => [
            styles.photoButton,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Icon name="camera" size={15} color={theme.text} stroke={1.8} />
          <Text style={{ color: theme.text, fontWeight: '600' }}>
            {t('expense.photosCamera')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onGallery}
          accessibilityRole="button"
          accessibilityLabel={t('expense.photosGallery')}
          style={({ pressed }) => [
            styles.photoButton,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Icon name="photo" size={15} color={theme.text} stroke={1.8} />
          <Text style={{ color: theme.text, fontWeight: '600' }}>
            {t('expense.photosGallery')}
          </Text>
        </Pressable>
      </View>
      {photos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoRow}
        >
          {photos.map((p) => (
            <Pressable
              key={p.uri}
              onLongPress={() => {
                showConfirmDialog({
                  title: t('expense.photosRemoveConfirm'),
                  body: '',
                  confirmLabel: t('common.delete'),
                  cancelLabel: t('common.cancel'),
                  destructive: true,
                  onConfirm: () => onRemove(p.uri),
                });
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Image source={{ uri: p.uri }} style={styles.photoThumb} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  photoButtonRow: { flexDirection: 'row', gap: spacing.sm },
  photoButton: {
    flex: 1,
    paddingVertical: spacing.md + 2, // 14 — button tall geometry
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
  },
  photoRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  photoThumb: { width: 72, height: 72, borderRadius: sizing.radiusSmall },
});
