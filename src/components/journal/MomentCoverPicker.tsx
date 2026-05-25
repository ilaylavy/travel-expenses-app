// Cover picker for a Moment. 2-col grid of the Moment's photo-entry members
// (uses the first photo of each entry as the thumbnail). Tap one → assign
// as cover. A "Clear cover" row at the top removes the cover.

import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSignedJournalPhotoUrl } from '@/hooks/useSignedJournalPhotoUrl';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { JournalPhotoEntryWithPhotos } from '@/types/journal';

interface Props {
  visible: boolean;
  candidates: JournalPhotoEntryWithPhotos[];
  currentCoverEntryId: string | null;
  onDismiss: () => void;
  onPick: (entryId: string | null) => void;
}

export function MomentCoverPicker({
  visible,
  candidates,
  currentCoverEntryId,
  onDismiss,
  onPick,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>
            {t('journal.momentChangeCover').toUpperCase()}
          </Text>
          <Pressable
            onPress={() => onPick(null)}
            style={({ pressed }) => [
              styles.clearRow,
              { borderColor: theme.border, backgroundColor: theme.bgSoft },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.clearTxt, { color: theme.red }]}>
              {t('journal.momentClearCover')}
            </Text>
          </Pressable>
          {candidates.length === 0 ? (
            <Text style={[styles.emptyTxt, { color: theme.textMuted }]}>
              {t('journal.emptyDay')}
            </Text>
          ) : (
            <FlatList
              data={candidates}
              keyExtractor={(e) => e.id}
              numColumns={2}
              columnWrapperStyle={{ gap: 10 }}
              contentContainerStyle={{ gap: 10, paddingTop: 10 }}
              renderItem={({ item }) => (
                <CoverCandidate
                  entry={item}
                  isCurrent={item.id === currentCoverEntryId}
                  onPress={() => onPick(item.id)}
                />
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CoverCandidate({
  entry,
  isCurrent,
  onPress,
}: {
  entry: JournalPhotoEntryWithPhotos;
  isCurrent: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const url = useSignedJournalPhotoUrl(entry.photos[0]?.storagePath ?? null);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          borderColor: isCurrent ? theme.accent : 'transparent',
          borderWidth: isCurrent ? 2.5 : 0,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      {url ? (
        <Image source={{ uri: url }} style={styles.tileImg} />
      ) : (
        <View style={[styles.tileImg, { backgroundColor: theme.bgSoft }]} />
      )}
      {isCurrent ? (
        <View style={[styles.currentBadge, { backgroundColor: theme.accent }]}>
          <Text style={styles.currentBadgeText}>✓</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    padding: 16,
    paddingBottom: 28,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '70%',
  },
  title: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 12,
  },
  clearRow: {
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  clearTxt: { fontSize: 13, fontWeight: '800' },
  emptyTxt: {
    paddingVertical: 28,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  tileImg: { width: '100%', height: '100%' },
  currentBadge: {
    position: 'absolute',
    top: 8,
    insetInlineEnd: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentBadgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },
});
