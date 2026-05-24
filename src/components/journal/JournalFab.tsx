// Floating "add" button for the journal Today view. Mirrors the canonical
// expense-tab FAB style (62×62, fabGradient, glow shadow, bottom: 90 to
// clear the bottom tab bar) so the two screens feel like part of the same
// app. In RTL languages the FAB anchors to bottom-left instead of
// bottom-right — we read direction from useIsRTL so the mirroring stays in
// sync with the active i18next language on both native and web.
//
// Behavior: tap opens AddMenuSheet. Picking a row routes to either the
// photo-pick orchestrator, the VoiceRecordSheet, or the existing
// /add-expense screen. After a successful create the parent's onCreated
// is awaited so the day's lists + summary refresh in one pass.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useIsRTL } from '@/hooks/useIsRTL';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { href } from '@/utils/nav';

import { AddMenuSheet } from './AddMenuSheet';
import { runJournalPhotoPick } from './capture/photoPick';
import { VoiceRecordSheet } from './VoiceRecordSheet';

interface Props {
  tripId: string;
  dayDate: string;
  onCreated: () => void | Promise<void>;
}

export function JournalFab({ tripId, dayDate, onCreated }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const isRTL = useIsRTL();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setMenuOpen(true)}
        accessibilityLabel={t('journal.addPhotos')}
        style={({ pressed }) => [
          styles.fab,
          isRTL ? styles.fabLeft : styles.fabRight,
          {
            shadowColor: theme.accent,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          },
        ]}
      >
        <LinearGradient
          colors={theme.fabGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <Text style={styles.plus}>＋</Text>
        </LinearGradient>
      </Pressable>
      <AddMenuSheet
        visible={menuOpen}
        onDismiss={() => setMenuOpen(false)}
        onAddPhotos={async () => {
          setMenuOpen(false);
          await runJournalPhotoPick({ tripId, dayDate });
          await onCreated();
        }}
        onRecordVoice={() => {
          setMenuOpen(false);
          setRecordOpen(true);
        }}
        onAddExpense={() => {
          setMenuOpen(false);
          // The add-expense screen reads tripId from its route params and
          // defaults the date to today via useExpenseEntryForm. dayDate is
          // unused for now (the form has no `date` param); revisit when the
          // entry form gains a date-preset hook.
          router.push(href(`/add-expense?tripId=${tripId}`));
        }}
      />
      <VoiceRecordSheet
        visible={recordOpen}
        tripId={tripId}
        dayDate={dayDate}
        onDismiss={() => setRecordOpen(false)}
        onSaved={async () => {
          setRecordOpen(false);
          await onCreated();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 90,
    width: 62,
    height: 62,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  fabRight: { right: 20 },
  fabLeft: { left: 20 },
  fabInner: {
    flex: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  plus: { color: '#FFFFFF', fontSize: 30, fontWeight: '700', lineHeight: 32 },
});
