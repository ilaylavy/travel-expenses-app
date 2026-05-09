import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { DraftPhoto } from '@/hooks/usePhotoCapture';

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
          style={[
            styles.photoButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={{ color: theme.text, fontWeight: '600' }}>
            📷 {t('expense.photosCamera')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onGallery}
          style={[
            styles.photoButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={{ color: theme.text, fontWeight: '600' }}>
            🖼️ {t('expense.photosGallery')}
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
                Alert.alert(t('expense.photosRemoveConfirm'), '', [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: () => onRemove(p.uri),
                  },
                ]);
              }}
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
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: sizing.radiusButton,
    borderWidth: 1.5,
  },
  photoRow: { gap: spacing.sm, paddingVertical: 4 },
  photoThumb: { width: 72, height: 72, borderRadius: sizing.radiusSmall },
});
