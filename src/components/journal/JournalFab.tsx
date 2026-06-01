// Floating "add" button for the journal day view. Mirrors the canonical
// expense-tab FAB style (62×62, fabGradient, glow shadow, bottom: 90 to
// clear the bottom tab bar). RTL languages anchor it to bottom-left.
//
// The add-menu state can be controlled from outside (via `menuOpen` +
// `onMenuOpenChange`) so the parent screen can open the same menu from a
// different surface — e.g., the empty-day CTA disc opens the menu without
// the user having to find the FAB across the screen. When `menuOpen` is
// omitted, the FAB owns the state internally (uncontrolled mode).

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
  // Selection-mode entry point (Phase 7+). Tapping it dismisses the menu
  // and the DayScreen flips into selection mode.
  onCreateMoment: () => void;
  momentEnabled: boolean;
  // Optional controlled-mode props. When `menuOpen` is provided, the parent
  // owns the open/close state and the FAB just calls back via
  // onMenuOpenChange. Useful for opening the menu from a different surface
  // (e.g., the empty-day disc on DayScreen).
  menuOpen?: boolean;
  onMenuOpenChange?: (next: boolean) => void;
}

export function JournalFab({
  tripId,
  dayDate,
  onCreated,
  onCreateMoment,
  momentEnabled,
  menuOpen: controlledMenuOpen,
  onMenuOpenChange,
}: Props) {
  const theme = useTheme();
  const router = useRouter();
  const isRTL = useIsRTL();
  const { t } = useTranslation();
  const [internalMenuOpen, setInternalMenuOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  const isControlled = controlledMenuOpen !== undefined;
  const menuOpen = isControlled ? controlledMenuOpen : internalMenuOpen;
  const setMenuOpen = (next: boolean): void => {
    if (isControlled) onMenuOpenChange?.(next);
    else setInternalMenuOpen(next);
  };

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
        momentEnabled={momentEnabled}
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
        onCreateMoment={() => {
          setMenuOpen(false);
          onCreateMoment();
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
