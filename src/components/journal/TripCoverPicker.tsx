// Picker for the trip-level cover photo (the big banner on All Days). Same
// grid + clear-row pattern as MomentCoverPicker, but the candidates are
// every photo entry across the trip (loaded on first open).

import { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import * as journalPhotoEntries from '@/db/queries/journalPhotoEntries';
import { useSignedJournalPhotoUrl } from '@/hooks/useSignedJournalPhotoUrl';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { JournalPhotoEntryWithPhotos } from '@/types/journal';

interface Props {
  visible: boolean;
  tripId: string;
  currentStoragePath: string | null;
  onDismiss: () => void;
  onPick: (storagePath: string | null) => void;
}

export function TripCoverPicker({
  visible,
  tripId,
  currentStoragePath,
  onDismiss,
  onPick,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<JournalPhotoEntryWithPhotos[]>([]);

  useEffect(() => {
    if (!visible || !tripId) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await journalPhotoEntries.listAllEntriesForTrip(tripId);
        if (!cancelled) setEntries(list);
      } catch (e) {
        console.warn('TripCoverPicker load failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, tripId]);

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
            {t('journal.coverChangeSheet').toUpperCase()}
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
              {t('journal.coverClear')}
            </Text>
          </Pressable>
          {entries.length === 0 ? (
            <Text style={[styles.emptyTxt, { color: theme.textMuted }]}>
              {t('journal.emptyDay')}
            </Text>
          ) : (
            <FlatList
              data={entries}
              keyExtractor={(e) => e.id}
              numColumns={2}
              columnWrapperStyle={{ gap: 10 }}
              contentContainerStyle={{ gap: 10, paddingTop: 10 }}
              renderItem={({ item }) => {
                const sp = item.photos[0]?.storagePath ?? null;
                return (
                  <CoverCandidate
                    storagePath={sp}
                    isCurrent={sp != null && sp === currentStoragePath}
                    onPress={() => onPick(sp)}
                  />
                );
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CoverCandidate({
  storagePath,
  isCurrent,
  onPress,
}: {
  storagePath: string | null;
  isCurrent: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const url = useSignedJournalPhotoUrl(storagePath);
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
    maxHeight: '76%',
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
