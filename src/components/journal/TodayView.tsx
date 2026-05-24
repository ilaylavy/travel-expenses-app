// Single-day journal view. Renders the DayNav (prev/next day chevrons),
// the DaySummaryCard (hero + counts + location editor), and a merged
// timeline of photo entries, voice clips, and expenses for the chosen
// day. The day cursor defaults to today (clamped to the trip's window)
// and the user can step through trip days via DayNav.
//
// Data flow:
//   - useDaySummary fetches the card aggregates and exposes a reload().
//   - listEntriesForDay / listClipsForDay / expense store give the three
//     per-day lists; buildDayTimeline merges + sorts them.
//   - Caption edits and location changes write through the data layer
//     then trigger a refresh so the card and rows stay in sync.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { DayNav } from '@/components/journal/DayNav';
import { DaySummaryCard } from '@/components/journal/DaySummaryCard';
import { JournalFab } from '@/components/journal/JournalFab';
import { ExpenseTimelineRow } from '@/components/journal/timeline/ExpenseTimelineRow';
import { PhotoEntryRow } from '@/components/journal/timeline/PhotoEntryRow';
import { VoiceClipRow } from '@/components/journal/timeline/VoiceClipRow';
import * as journalDays from '@/db/queries/journalDays';
import * as journalPhotoEntries from '@/db/queries/journalPhotoEntries';
import * as voiceClips from '@/db/queries/voiceClips';
import { useDaySummary } from '@/hooks/useDaySummary';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import {
  selectCategoriesForTrip,
  useCategoryStore,
} from '@/stores/categoryStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTripStore } from '@/stores/tripStore';
import type { ExpenseWithPhotos } from '@/types/expense';
import type { JournalPhotoEntryWithPhotos } from '@/types/journal';
import type { VoiceClip } from '@/types/voice';
import { todayIsoDate } from '@/utils/date';
import { buildDayTimeline, type TimelineItem } from '@/utils/journalTimeline';

interface Props {
  tripId: string;
  // Controlled day cursor — when provided, the parent (JournalScreen) owns
  // the dayDate so it can deep-link from the chapter view into a specific
  // day. When omitted, TodayView falls back to its internal state seeded
  // from today (clamped to the trip window).
  dayDateOverride?: string;
  onDayDateChange?: (next: string) => void;
}

export function TodayView({ tripId, dayDateOverride, onDayDateChange }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const currentUserId = useAuthStore((s) => s.session?.user.id ?? '');
  const trip = useTripStore((s) => s.trips.find((x) => x.id === tripId));
  const expenses = useExpenseStore((s) => s.expenses);
  const activeExpenseTripId = useExpenseStore((s) => s.activeTripId);
  const loadExpensesForTrip = useExpenseStore((s) => s.loadForTrip);
  const allCategories = useCategoryStore((s) => s.categories);

  const [internalDayDate, setInternalDayDate] = useState<string>(() =>
    clampDateToTrip(todayIsoDate(), trip?.startDate ?? null, trip?.endDate ?? null),
  );
  const isControlled = dayDateOverride !== undefined;
  const dayDate = isControlled ? dayDateOverride : internalDayDate;
  const setDayDate = useCallback(
    (next: string | ((prev: string) => string)): void => {
      if (isControlled) {
        const resolved = typeof next === 'function' ? next(dayDate) : next;
        onDayDateChange?.(resolved);
      } else {
        setInternalDayDate(next);
      }
    },
    [isControlled, dayDate, onDayDateChange],
  );
  const [photoEntries, setPhotoEntries] = useState<JournalPhotoEntryWithPhotos[]>([]);
  const [clips, setClips] = useState<VoiceClip[]>([]);

  // Make sure expenses for this trip are loaded so the timeline isn't empty
  // when the user lands on the journal tab before opening the expenses tab.
  useEffect(() => {
    if (tripId && activeExpenseTripId !== tripId) {
      void loadExpensesForTrip(tripId);
    }
  }, [tripId, activeExpenseTripId, loadExpensesForTrip]);

  // Re-clamp when the trip data loads in (initial mount might race with
  // tripStore hydration). Only re-clamps the internal cursor — when the
  // parent controls dayDate, it's responsible for keeping the value in
  // range.
  useEffect(() => {
    if (!trip || isControlled) return;
    setInternalDayDate((prev) =>
      clampDateToTrip(prev, trip.startDate, trip.endDate),
    );
  }, [trip, isControlled]);

  const summary = useDaySummary(tripId, dayDate);

  const reloadDayLists = useCallback(async (): Promise<void> => {
    if (!tripId || !currentUserId) {
      setPhotoEntries([]);
      setClips([]);
      return;
    }
    try {
      const [pe, vc] = await Promise.all([
        journalPhotoEntries.listEntriesForDay(tripId, dayDate, currentUserId),
        voiceClips.listClipsForDay(tripId, dayDate, currentUserId),
      ]);
      setPhotoEntries(pe);
      setClips(vc);
    } catch (error) {
      console.warn('TodayView reloadDayLists failed:', error);
    }
  }, [tripId, dayDate, currentUserId]);

  useEffect(() => {
    void reloadDayLists();
  }, [reloadDayLists]);

  const tripCategories = useMemo(
    () => selectCategoriesForTrip(allCategories, tripId ?? null, { includeArchived: true }),
    [allCategories, tripId],
  );
  const categoryById = useMemo(
    () => new Map(tripCategories.map((c) => [c.id, c])),
    [tripCategories],
  );
  const expenseById = useMemo(
    () => new Map(expenses.map((e) => [e.id, e])),
    [expenses],
  );

  const expensesForDay = useMemo<ExpenseWithPhotos[]>(
    () =>
      expenses.filter(
        (e) =>
          e.deletedAt === null &&
          e.expenseDate === dayDate &&
          (!e.isPrivate || e.userId === currentUserId),
      ),
    [expenses, dayDate, currentUserId],
  );

  const timeline: TimelineItem[] = useMemo(
    () =>
      buildDayTimeline({
        photoEntries,
        voiceClips: clips,
        expenses: expensesForDay,
        currentUserId,
      }),
    [photoEntries, clips, expensesForDay, currentUserId],
  );

  const dayIndex = useMemo<number | null>(() => {
    if (!trip) return null;
    const start = parseDateOnly(trip.startDate);
    const cur = parseDateOnly(dayDate);
    if (!start || !cur) return null;
    return Math.max(
      1,
      Math.floor((cur.getTime() - start.getTime()) / 86_400_000) + 1,
    );
  }, [trip, dayDate]);

  const dayTotal = useMemo<number | null>(() => {
    if (!trip || !trip.endDate) return null;
    const start = parseDateOnly(trip.startDate);
    const end = parseDateOnly(trip.endDate);
    if (!start || !end) return null;
    return Math.max(
      1,
      Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1,
    );
  }, [trip]);

  const isToday = dayDate === todayIsoDate();

  const handlePrev = useCallback((): void => {
    setDayDate((prev) => {
      const next = shiftDate(prev, -1);
      if (!trip) return next;
      return clampDateToTrip(next, trip.startDate, trip.endDate);
    });
  }, [trip]);

  const handleNext = useCallback((): void => {
    setDayDate((prev) => {
      const next = shiftDate(prev, +1);
      if (!trip) return next;
      return clampDateToTrip(next, trip.startDate, trip.endDate);
    });
  }, [trip]);

  const handleLocationChange = useCallback(
    async (next: string | null): Promise<void> => {
      try {
        await journalDays.setLocation(tripId, dayDate, next);
        await summary.reload();
      } catch (error) {
        console.warn('TodayView setLocation failed:', error);
      }
    },
    [tripId, dayDate, summary],
  );

  const handleCaptionChange = useCallback(
    async (entryId: string, caption: string | null): Promise<void> => {
      try {
        await journalPhotoEntries.updateEntryCaption(entryId, caption);
        await reloadDayLists();
      } catch (error) {
        console.warn('TodayView updateEntryCaption failed:', error);
      }
    },
    [reloadDayLists],
  );

  // Phase 3 wires the gallery viewer, delete-confirm sheet, and the
  // transcribe-voice edge-function call. For now we stub them so the
  // row callbacks are well-typed; the placeholders are intentionally
  // visible in dev logs so the wiring task picks them up.
  const handleOpenPhoto = useCallback((_entryId: string, _index: number): void => {
    // TODO(phase-3): open the gallery viewer at this index.
  }, []);
  const handleOpenTranscript = useCallback((_clipId: string): void => {
    // TODO(phase-3): open the transcript edit modal.
  }, []);
  const handleLongPressItem = useCallback((_item: TimelineItem): void => {
    // TODO(phase-3): show delete-confirm action sheet.
  }, []);
  const handleRetranscribe = useCallback((_clipId: string): void => {
    // TODO(task-2.9): invoke the transcribe-voice edge function and
    // reload the day lists once the new status is persisted.
    console.warn('TodayView retranscribe is not yet wired (Task 2.9).');
  }, []);

  if (!trip) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.textSecondary }}>{t('trips.notFound')}</Text>
      </View>
    );
  }

  const homeCurrency = trip.homeCurrency;

  return (
    <View style={styles.root}>
      <DayNav
        dayDate={dayDate}
        dayIndex={dayIndex}
        dayTotal={dayTotal}
        isToday={isToday}
        onPrev={handlePrev}
        onNext={handleNext}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <DaySummaryCard
          tripId={tripId}
          dayDate={dayDate}
          dayIndex={dayIndex ?? 1}
          dayTotal={dayTotal}
          isToday={isToday}
          totalConvertedAmount={summary.totalConvertedAmount}
          homeCurrency={homeCurrency}
          photoCount={summary.photoCount}
          voiceCount={summary.voiceCount}
          expenseCount={summary.expenseCount}
          coverStoragePath={summary.coverStoragePath}
          effectiveLocation={summary.effectiveLocation}
          onLocationChange={handleLocationChange}
        />
        {timeline.length === 0 ? (
          <View style={[styles.empty, { borderColor: theme.borderLight }]}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {t('journal.emptyDay')}
            </Text>
          </View>
        ) : (
          timeline.map((item) => {
            if (item.kind === 'photo') {
              return (
                <PhotoEntryRow
                  key={`photo:${item.id}`}
                  entry={item.entry as JournalPhotoEntryWithPhotos}
                  onCaptionChange={(next) => {
                    void handleCaptionChange(item.id, next);
                  }}
                  onOpenPhoto={(index) => handleOpenPhoto(item.id, index)}
                  onLongPress={() => handleLongPressItem(item)}
                />
              );
            }
            if (item.kind === 'voice') {
              return (
                <VoiceClipRow
                  key={`voice:${item.id}`}
                  clip={item.clip}
                  onOpenTranscript={() => handleOpenTranscript(item.id)}
                  onLongPress={() => handleLongPressItem(item)}
                  onRetranscribe={() => handleRetranscribe(item.id)}
                />
              );
            }
            // Expense row: ExpenseCard needs ExpenseWithPhotos + category.
            // The timeline item carries the plain Expense from the merge
            // helper; look up the full row (with photos) from the store
            // so the badges line up with everywhere else expenses render.
            const full = expenseById.get(item.id);
            if (!full) return null;
            const category = categoryById.get(full.categoryId) ?? null;
            const isSelfLogged = full.userId === currentUserId;
            return (
              <ExpenseTimelineRow
                key={`expense:${item.id}`}
                expense={full}
                category={category}
                homeCurrency={homeCurrency}
                isSelfLogged={isSelfLogged}
                onLongPress={() => handleLongPressItem(item)}
              />
            );
          })
        )}
      </ScrollView>
      <JournalFab
        tripId={tripId}
        dayDate={dayDate}
        onCreated={async () => {
          await reloadDayLists();
          await summary.reload();
        }}
      />
    </View>
  );
}

// Local pure helpers — kept inside this file because they're only used by
// the day cursor and won't be reused. If a second screen needs the same
// shape later, lift them into src/utils/.

function parseDateOnly(iso: string): Date | null {
  // iso = YYYY-MM-DD; anchor to UTC so day-arithmetic stays DST-free.
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function shiftDate(iso: string, deltaDays: number): string {
  const d = parseDateOnly(iso);
  if (!d) return iso;
  d.setUTCDate(d.getUTCDate() + deltaDays);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function clampDateToTrip(
  iso: string,
  startDate: string | null,
  endDate: string | null,
): string {
  if (!startDate) return iso;
  if (iso < startDate) return startDate;
  if (endDate && iso > endDate) return endDate;
  return iso;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyText: { fontSize: 13, fontWeight: '500' },
});
