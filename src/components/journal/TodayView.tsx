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
import { TimelineItemActions } from '@/components/journal/TimelineItemActions';
import { TimestampEditor } from '@/components/journal/TimestampEditor';
import { TranscriptEditor } from '@/components/journal/TranscriptEditor';
import { ExpenseTimelineRow } from '@/components/journal/timeline/ExpenseTimelineRow';
import { PhotoEntryRow } from '@/components/journal/timeline/PhotoEntryRow';
import { VoiceClipRow } from '@/components/journal/timeline/VoiceClipRow';
import * as expenseQueries from '@/db/queries/expenses';
import * as journalDays from '@/db/queries/journalDays';
import * as journalPhotoEntries from '@/db/queries/journalPhotoEntries';
import * as voiceClips from '@/db/queries/voiceClips';
import { useDaySummary } from '@/hooks/useDaySummary';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/services/supabase';
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
  // Phase 3 editing slots. Mutually independent — long-press surfaces the
  // action sheet first, which then opens the timestamp editor or runs an
  // inline mutation. The transcript editor is reached from the row
  // directly (tap on transcript text), not via the action sheet.
  const [actionTarget, setActionTarget] = useState<TimelineItem | null>(null);
  const [editingTimestampFor, setEditingTimestampFor] = useState<TimelineItem | null>(
    null,
  );
  const [editingTranscriptFor, setEditingTranscriptFor] = useState<VoiceClip | null>(
    null,
  );

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

  // Gallery viewer is still a Phase 3.4 task — kept as a no-op so the row
  // callback typechecks.
  const handleOpenPhoto = useCallback((_entryId: string, _index: number): void => {
    // TODO(phase-3.4): open the gallery viewer at this index.
  }, []);
  const handleOpenTranscript = useCallback(
    (clipId: string): void => {
      const target = clips.find((c) => c.id === clipId);
      if (target) setEditingTranscriptFor(target);
    },
    [clips],
  );
  const handleLongPressItem = useCallback((item: TimelineItem): void => {
    setActionTarget(item);
  }, []);
  const handleRetranscribe = useCallback(async (clipId: string): Promise<void> => {
    // Best-effort: errors are surfaced in the row via the transcribeFailed
    // copy on the next reload, so we only log here.
    try {
      await supabase.functions.invoke('transcribe-voice', {
        body: { voice_clip_id: clipId },
      });
    } catch (error) {
      console.warn('TodayView retranscribe failed:', error);
    }
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
      <TimelineItemActions
        item={actionTarget}
        onDismiss={() => setActionTarget(null)}
        onEditTimestamp={() => {
          if (!actionTarget) return;
          setEditingTimestampFor(actionTarget);
          setActionTarget(null);
        }}
        onSetCover={async () => {
          if (!actionTarget || actionTarget.kind !== 'photo') return;
          const targetId = actionTarget.id;
          setActionTarget(null);
          try {
            await journalDays.setCoverPhotoEntry(tripId, dayDate, targetId);
            await summary.reload();
          } catch (error) {
            console.warn('TodayView setCoverPhotoEntry failed:', error);
          }
        }}
        onRetranscribe={async () => {
          if (!actionTarget || actionTarget.kind !== 'voice') return;
          const targetId = actionTarget.id;
          setActionTarget(null);
          await handleRetranscribe(targetId);
        }}
        onDelete={async () => {
          if (!actionTarget) return;
          const target = actionTarget;
          setActionTarget(null);
          try {
            if (target.kind === 'photo') {
              await journalPhotoEntries.softDeleteEntry(target.id);
            } else if (target.kind === 'voice') {
              await voiceClips.softDeleteClip(target.id);
            } else {
              await expenseQueries.softDeleteExpense(target.id);
            }
            await reloadDayLists();
            await summary.reload();
          } catch (error) {
            console.warn('TodayView delete failed:', error);
          }
        }}
      />
      {editingTimestampFor ? (
        <TimestampEditor
          initialISO={
            editingTimestampFor.kind === 'expense'
              ? `${editingTimestampFor.expense.expenseDate}T${editingTimestampFor.expense.expenseTime}Z`
              : editingTimestampFor.occurredAt.toISOString()
          }
          onSave={async (iso) => {
            const target = editingTimestampFor;
            setEditingTimestampFor(null);
            try {
              if (target.kind === 'photo') {
                await journalPhotoEntries.updateEntryOccurredAt(target.id, iso);
              } else if (target.kind === 'voice') {
                await voiceClips.updateClipOccurredAt(target.id, iso);
              } else {
                // Expense stores wall-clock date + time separately, so we
                // only update expense_time here (timestamp edits don't
                // migrate days from this surface).
                const d = new Date(iso);
                const hh = String(d.getHours()).padStart(2, '0');
                const mm = String(d.getMinutes()).padStart(2, '0');
                await expenseQueries.updateExpense({
                  id: target.id,
                  expenseTime: `${hh}:${mm}:00`,
                });
                await loadExpensesForTrip(tripId);
              }
              await reloadDayLists();
            } catch (error) {
              console.warn('TodayView timestamp update failed:', error);
            }
          }}
          onDismiss={() => setEditingTimestampFor(null)}
        />
      ) : null}
      <TranscriptEditor
        clip={editingTranscriptFor}
        onDismiss={() => setEditingTranscriptFor(null)}
        onSave={async (transcript) => {
          if (!editingTranscriptFor) return;
          const id = editingTranscriptFor.id;
          setEditingTranscriptFor(null);
          try {
            await voiceClips.updateClipTranscript(
              id,
              transcript.length === 0 ? null : transcript,
            );
            await reloadDayLists();
          } catch (error) {
            console.warn('TodayView updateClipTranscript failed:', error);
          }
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
