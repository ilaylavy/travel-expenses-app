import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { getSignedPhotoUrl } from '@/services/photoService';
import type { ExpensePhoto } from '@/types/expense';
import { isWebViewableUri } from '@/utils/photoUri';

interface PhotoGalleryModalProps {
  visible: boolean;
  photos: ExpensePhoto[];
  initialIndex: number;
  onClose: () => void;
}

export function PhotoGalleryModal({
  visible,
  photos,
  initialIndex,
  onClose,
}: PhotoGalleryModalProps) {
  const { width, height } = useWindowDimensions();
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) setCurrentIndex(initialIndex);
  }, [visible, initialIndex]);

  if (photos.length === 0) return null;

  const safeIndex = Math.min(Math.max(currentIndex, 0), photos.length - 1);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.backdrop}>
        <FlatList
          data={photos}
          keyExtractor={(p) => p.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentIndex(idx);
          }}
          renderItem={({ item }) => (
            <GalleryPage photo={item} width={width} height={height} t={t} />
          )}
        />

        <SafeAreaView edges={['top']} style={styles.headerWrap} pointerEvents="box-none">
          <View style={styles.header}>
            <Pressable
              accessibilityLabel={t('expenseDetail.photoCloseLabel')}
              onPress={onClose}
              hitSlop={12}
              style={({ pressed }) => [
                styles.closeButton,
                { transform: [{ scale: pressed ? 0.94 : 1 }] },
              ]}
            >
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
            <Text style={styles.counter}>
              {t('expenseDetail.photoCounter', {
                current: safeIndex + 1,
                total: photos.length,
              })}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

interface GalleryPageProps {
  photo: ExpensePhoto;
  width: number;
  height: number;
  t: (key: string) => string;
}

function GalleryPage({ photo, width, height, t }: GalleryPageProps) {
  // Same render guard as PhotoThumb: only seed from localUri if this
  // platform can actually load it; otherwise fall through to the signed URL.
  const initialUri = isWebViewableUri(photo.localUri) ? photo.localUri : null;
  const [resolvedUri, setResolvedUri] = useState<string | null>(initialUri);
  const [loading, setLoading] = useState(!initialUri && !!photo.storagePath);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isWebViewableUri(photo.localUri)) {
      setResolvedUri(photo.localUri);
      setLoading(false);
      setFailed(false);
      return;
    }
    if (!photo.storagePath) {
      setLoading(false);
      setFailed(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    (async () => {
      const url = await getSignedPhotoUrl(photo.storagePath);
      if (cancelled) return;
      if (!url) {
        setFailed(true);
        setLoading(false);
        return;
      }
      setResolvedUri(url);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [photo.localUri, photo.storagePath]);

  return (
    <View style={[styles.page, { width, height }]}>
      {resolvedUri ? (
        <Image
          source={{ uri: resolvedUri }}
          style={styles.image}
          resizeMode="contain"
        />
      ) : null}
      {loading ? (
        <ActivityIndicator size="large" color="#FFFFFF" style={styles.spinner} />
      ) : null}
      {failed && !loading ? (
        <Text style={styles.errorText}>{t('expenseDetail.photoLoadFailed')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000',
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  spinner: {
    position: 'absolute',
  },
  errorText: {
    position: 'absolute',
    color: '#FFFFFF',
    ...typography.body,
  },
  headerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  closeButton: {
    width: sizing.headerButton,
    height: sizing.headerButton,
    borderRadius: sizing.radiusPill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  counter: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    ...typography.itemTitle,
    marginEnd: 36,
  },
});
