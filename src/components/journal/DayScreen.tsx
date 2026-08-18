// Day-screen composition. The visual layers (DateStrip → DayCoverHero →
// DayStatsStrip → Timeline) are rendered inside a single ScrollView so the
// hero scrolls out of view while the date strip stays sticky at the top.
//
// Routing context:
//   - showBackButton=false → tab-root entry (smart-routed from journal.tsx)
//   - showBackButton=true  → pushed from All Days
// Lesson #2: the DateStrip renders its own back glyph in the inline-start
// position; we do NOT also render an "All Days" button when the back button
// is showing (those navigate to the same place and duplicate chrome reads
// as broken).
//
// Data fan-out:
//   useDaySummary  — totals + cover + effective location for the chrome.
//   useDayMoments  — Moment headers for this day (Phase 6 renders the pill).
//   listEntriesForDay + listClipsForDay — photo entries + voice clips.
//   useExpenseStore — expenses, filtered to this day in-memory.
//
// Spread expenses (Lesson #8): an expense with spread_start_date /
// spread_end_date set must appear on EVERY day in the range, not only its
// expense_date. The per-day filter uses the same BETWEEN check as the
// backend listDaySummaries SQL.
//
// is_private (Lesson #16): even though the journal is shared, expenses
// still respect per-user is_private — keep the (!isPrivate || self) clause.

import { useFocusEffect } from 'expo-router';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateStrip } from './DateStrip';
import { DayCoverHero } from './DayCoverHero';
import { DayCoverPicker } from './DayCoverPicker';
import { DaySpendingBreakdown } from './DaySpendingBreakdown';
import { DayStatsStrip } from './DayStatsStrip';
import { JournalFab } from './JournalFab';
import { MomentCoverPicker } from './MomentCoverPicker';
import { MomentHeader } from './MomentHeader';
import { MomentNameSheet } from './MomentNameSheet';
import { MomentOptionsSheet } from './MomentOptionsSheet';
import { MomentSelectionBanner } from './MomentSelectionBanner';
import { MomentTintBand } from './MomentTintBand';
import { NODE_COLUMN_WIDTH } from './spineGeometry';
import { TimelineItemActions } from './TimelineItemActions';
import { TimestampEditor } from './TimestampEditor';
import { TranscriptEditor } from './TranscriptEditor';
import { ExpenseTimelineRow } from './timeline/ExpenseTimelineRow';
import { PhotoEntryRow } from './timeline/PhotoEntryRow';
import { VoiceClipRow } from './timeline/VoiceClipRow';
import * as expenseQueries from '@/db/queries/expenses';
import * as journalDays from '@/db/queries/journalDays';
import * as journalMoments from '@/db/queries/journalMoments';
import * as journalPhotoEntries from '@/db/queries/journalPhotoEntries';
import { getProfileName } from '@/db/queries/profiles';
import { listTripMembers } from '@/db/queries/trips';
import * as voiceClips from '@/db/queries/voiceClips';
import { useDayMoments } from '@/hooks/useDayMoments';
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
import {
  buildDayTimeline,
  momentIdOf,
  type TimelineItem,
} from '@/utils/journalTimeline';

interface Props {
  tripId: string;
  initialDayDate: string;
  showBackButton: boolean;
}

export function DayScreen({ tripId, initialDayDate, showBackButton }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const trip = useTripStore((s) => s.trips.find((tr) => tr.id === tripId) ?? null);
  const currentUserId = useAuthStore((s) => s.session?.user.id ?? '');
  const expenses = useExpenseStore((s) => s.expenses);
  const activeExpenseTripId = useExpenseStore((s) => s.activeTripId);
  const loadExpensesForTrip = useExpenseStore((s) => s.loadForTrip);
  const allCategories = useCategoryStore((s) => s.categories);

  const [dayDate, setDayDate] = useState<string>(initialDayDate);
  const [photoEntries, setPhotoEntries] = useState<JournalPhotoEntryWithPhotos[]>([]);
  const [clips, setClips] = useState<VoiceClip[]>([]);
  // Shared-journal: name lookup for attribution. Empty when single-user.
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const isSharedTrip = Object.keys(memberNames).length > 1;

  const summary = useDaySummary(tripId, dayDate);
  const moments = useDayMoments(tripId, dayDate);

  // Action / editor modal state — owned by the screen so the row components
  // stay presentational.
  const [actionTarget, setActionTarget] = useState<TimelineItem | null>(null);
  const [editingTimestampFor, setEditingTimestampFor] = useState<TimelineItem | null>(null);
  const [editingTranscriptFor, setEditingTranscriptFor] = useState<VoiceClip | null>(null);
  const [coverPickerVisible, setCoverPickerVisible] = useState(false);
  // Local-only collapse state per Moment. Not persisted — visual preference
  // that resets on remount, like a disclosure widget.
  const [collapsedMomentIds, setCollapsedMomentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleMomentCollapse = useCallback((id: string) => {
    setCollapsedMomentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Selection mode (Phase 7+). Lesson #14: selection can either create a
  // new Moment or add/remove entries on an existing Moment. The purpose
  // determines what happens on confirm.
  type SelectionPurpose =
    | { kind: 'create' }
    | { kind: 'addToMoment'; momentId: string };
  const [selectionPurpose, setSelectionPurpose] =
    useState<SelectionPurpose | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [namingMoment, setNamingMoment] = useState<null | {
    memberIds: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string }>;
    defaultCoverEntryId: string | null;
    candidatePhotoEntryIds: string[];
  }>(null);

  const toggleSelected = useCallback((kind: 'photo' | 'voice' | 'expense', id: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const k = `${kind}:${id}`;
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const startCreateMoment = useCallback(() => {
    setSelectedKeys(new Set());
    setSelectionPurpose({ kind: 'create' });
  }, []);

  const cancelSelection = useCallback(() => {
    setSelectionPurpose(null);
    setSelectedKeys(new Set());
  }, []);

  // Moment editing — Options sheet (rename / cover / split / delete / add).
  const [editingMomentId, setEditingMomentId] = useState<string | null>(null);
  const [coverPickerForMomentId, setCoverPickerForMomentId] =
    useState<string | null>(null);
  const [splittingMomentId, setSplittingMomentId] = useState<string | null>(null);
  // Per-category breakdown sheet, opened by tapping the day total in the
  // stats strip.
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  // Add-menu state — lifted from JournalFab so the empty-day disc can open
  // the same menu without the user hunting for the FAB across the screen.
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // Tracks the most-recent createdAt we've seen in this day's lists. When a
  // fresh entry shows up (createdAt newer than this), we mark it as
  // animate-in so the row mounts with a 280ms fade + slide.
  const lastSeenCreatedAtRef = useRef<string>('');
  const [animateInKey, setAnimateInKey] = useState<string | null>(null);
  // Position tracking for scroll-to-first-of-kind: each row reports its
  // y-offset (relative to the timelineWrap, which sits below the cover
  // hero + stats strip) via onLayout. The chip handler scans the visible
  // sections in order and scrolls to the first match.
  const scrollRef = useRef<ScrollView>(null);
  const rowYRef = useRef<Map<string, number>>(new Map());
  // Offset added to the ScrollView origin for the cover hero + stats strip
  // above the timeline. Captured via the timelineWrap's own onLayout so we
  // don't hardcode it — heights vary with content (no cover vs cover, etc).
  const timelineWrapYRef = useRef<number>(0);

  // Make sure expenses are loaded for this trip before we filter them.
  useEffect(() => {
    if (tripId && activeExpenseTripId !== tripId) {
      void loadExpensesForTrip(tripId);
    }
  }, [tripId, activeExpenseTripId, loadExpensesForTrip]);

  // Member names for attribution (only used when there's >1 member).
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    void (async () => {
      try {
        const members = await listTripMembers(tripId);
        if (cancelled) return;
        const entries = await Promise.all(
          members.map(async (m) => [m.userId, (await getProfileName(m.userId)) ?? ''] as const),
        );
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const [id, name] of entries) if (name) map[id] = name;
        setMemberNames(map);
      } catch (e) {
        console.warn('DayScreen member-names load failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const reloadDayLists = useCallback(async (): Promise<void> => {
    if (!tripId) return;
    try {
      const [pe, vc] = await Promise.all([
        journalPhotoEntries.listEntriesForDay(tripId, dayDate),
        voiceClips.listClipsForDay(tripId, dayDate),
      ]);
      setPhotoEntries(pe);
      setClips(vc);
    } catch (e) {
      console.warn('DayScreen reloadDayLists failed:', e);
    }
  }, [tripId, dayDate]);

  useEffect(() => {
    void reloadDayLists();
  }, [reloadDayLists]);

  // Detect a fresh entry: any photo entry or voice clip whose createdAt is
  // newer than what we've previously seen. Mark it animateIn for one render.
  useEffect(() => {
    let newestCreatedAt = lastSeenCreatedAtRef.current;
    let newestKey: string | null = null;
    for (const p of photoEntries) {
      if (p.createdAt > newestCreatedAt) {
        newestCreatedAt = p.createdAt;
        newestKey = `photo:${p.id}`;
      }
    }
    for (const c of clips) {
      if (c.createdAt > newestCreatedAt) {
        newestCreatedAt = c.createdAt;
        newestKey = `voice:${c.id}`;
      }
    }
    // Bootstrap: skip animation on the very first list load by recording
    // the newest createdAt without setting animateInKey.
    if (lastSeenCreatedAtRef.current === '' && newestCreatedAt !== '') {
      lastSeenCreatedAtRef.current = newestCreatedAt;
      return;
    }
    if (newestKey && newestCreatedAt > lastSeenCreatedAtRef.current) {
      lastSeenCreatedAtRef.current = newestCreatedAt;
      setAnimateInKey(newestKey);
      // Reset so the next re-render after the animation starts doesn't
      // re-trigger it. 350ms gives the 280ms animation room to start.
      const t = setTimeout(() => setAnimateInKey(null), 350);
      return () => clearTimeout(t);
    }
  }, [photoEntries, clips]);

  // Re-fetch this day's lists + summary + moments whenever the screen comes
  // back into focus. Covers the case where a sibling screen (or a sync
  // event) mutated data while the user was elsewhere.
  // CRITICAL: depend on the .reload FUNCTIONS, not the whole `summary` /
  // `moments` objects. The hook results are memoized but their inner state
  // (data / moments array) gets a fresh reference on every reload — which
  // ripples up through the memo and would flip the callback identity on
  // every render → useFocusEffect re-fires → reload → setState → repeat.
  // The reload functions themselves are useCallback'd with stable deps
  // ([tripId, dayDateISO, me]), so depending on them keeps the callback
  // identity stable across data changes.
  const summaryReload = summary.reload;
  const momentsReload = moments.reload;
  useFocusEffect(
    useCallback(() => {
      void reloadDayLists();
      void summaryReload();
      void momentsReload();
      if (tripId && activeExpenseTripId !== tripId) {
        void loadExpensesForTrip(tripId);
      }
    }, [reloadDayLists, summaryReload, momentsReload, tripId, activeExpenseTripId, loadExpensesForTrip]),
  );

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

  // Lesson #8: include spread expenses on every day in their range.
  // Lesson #16: still respect is_private for non-self users.
  const expensesForDay = useMemo<ExpenseWithPhotos[]>(() => {
    return expenses.filter((e) => {
      if (e.deletedAt !== null) return false;
      if (e.isPrivate && e.userId !== currentUserId) return false;
      const start = e.spreadStartDate ?? e.expenseDate;
      const end = e.spreadEndDate ?? e.expenseDate;
      return dayDate >= start && dayDate <= end;
    });
  }, [expenses, dayDate, currentUserId]);

  // Build sections (Moments included) and flatten to a list of items.
  // Moment visual treatment (pill + tint band) is wired in Phase 6 — for
  // now we render the flat order so the spine + rows are testable.
  const sections = useMemo(
    () =>
      buildDayTimeline({
        photoEntries,
        voiceClips: clips,
        expenses: expensesForDay,
        moments: moments.moments,
        currentUserId,
      }),
    [photoEntries, clips, expensesForDay, moments.moments, currentUserId],
  );

  const isEmpty = sections.length === 0;

  if (!trip) return null;

  const isToday = dayDate === todayIsoDate();
  const dayIndex = computeDayIndex(trip.startDate, dayDate);
  const dayTotal = trip.endDate ? computeDayIndex(trip.startDate, trip.endDate) : null;
  const homeCurrency = trip.homeCurrency;

  // Per-row mutations.
  const handleLocationChange = async (next: string | null): Promise<void> => {
    try {
      await journalDays.setLocation(tripId, dayDate, next);
      await summary.reload();
    } catch (e) {
      console.warn('DayScreen setLocation failed:', e);
    }
  };

  const handleCaptionChange = async (
    entryId: string,
    caption: string | null,
  ): Promise<void> => {
    try {
      await journalPhotoEntries.updateEntryCaption(entryId, caption);
      await reloadDayLists();
    } catch (e) {
      console.warn('DayScreen updateEntryCaption failed:', e);
    }
  };

  const handleRetranscribe = async (clipId: string): Promise<void> => {
    try {
      await supabase.functions.invoke('transcribe-voice', {
        body: { voice_clip_id: clipId },
      });
    } catch (e) {
      console.warn('DayScreen retranscribe failed:', e);
    }
  };

  // Scroll the page so the first entry of the requested kind sits ~80px
  // below the date strip. Solo rows record their y directly; Moment-member
  // rows sit inside a TintBand (their own y is band-relative, which we
  // can't translate without extra plumbing), so for Moment-member matches
  // we scroll to the Moment HEADER instead — close enough, and the user
  // can see the matching entry inside the band from there.
  const scrollToFirstOfKind = (kind: 'photo' | 'voice' | 'expense'): void => {
    for (const s of sections) {
      if (s.kind === 'solo' && s.item.kind === kind) {
        const y = rowYRef.current.get(`solo:${s.item.kind}:${s.item.id}`);
        if (y != null) {
          scrollRef.current?.scrollTo({
            y: Math.max(0, timelineWrapYRef.current + y - 80),
            animated: true,
          });
        }
        return;
      }
      if (s.kind === 'moment') {
        const hasKind = s.members.some((m) => m.kind === kind);
        if (!hasKind) continue;
        const y = rowYRef.current.get(`moment:${s.id}`);
        if (y != null) {
          scrollRef.current?.scrollTo({
            y: Math.max(0, timelineWrapYRef.current + y - 80),
            animated: true,
          });
        }
        return;
      }
    }
  };

  const handleRowLayout = (key: string) => (e: LayoutChangeEvent): void => {
    rowYRef.current.set(key, e.nativeEvent.layout.y);
  };

  const handleSetCoverFromEntry = async (entryId: string): Promise<void> => {
    try {
      await journalDays.setCoverPhotoEntry(tripId, dayDate, entryId);
      await summary.reload();
    } catch (e) {
      console.warn('DayScreen setCoverPhotoEntry failed:', e);
    }
  };

  const handleClearCover = async (): Promise<void> => {
    try {
      await journalDays.setCoverPhotoEntry(tripId, dayDate, null);
      await summary.reload();
    } catch (e) {
      console.warn('DayScreen clearCover failed:', e);
    }
  };

  const inSelection = selectionPurpose != null;

  // Per-row cap flags: capTop on the very first visible row, capBottom on
  // the very last. Computed here so the renderRow logic can stay simple.
  const totalSections = sections.length;
  const isFirstSection = (sIdx: number): boolean => sIdx === 0;
  const isLastSection = (sIdx: number): boolean => sIdx === totalSections - 1;

  const renderRow = (
    item: TimelineItem,
    opts: {
      isMember: boolean;
      spineCapTop?: boolean;
      spineCapBottom?: boolean;
    },
  ): React.ReactNode => {
    // Lookup the attribution name only when the trip is shared AND the
    // entry is not the current user's.
    const loggedById = item.userId;
    const isSelfLogged = loggedById === currentUserId;
    const loggedByName = isSharedTrip && !isSelfLogged
      ? memberNames[loggedById] ?? null
      : null;

    const selectionKey = `${item.kind}:${item.id}`;
    const selected = selectedKeys.has(selectionKey);
    const toggleThis = () => toggleSelected(item.kind, item.id);

    if (item.kind === 'photo') {
      return (
        <PhotoEntryRow
          key={`photo:${item.id}`}
          entry={item.entry as JournalPhotoEntryWithPhotos}
          loggedByName={loggedByName}
          isMember={opts.isMember}
          spineThickness={opts.isMember ? 'thick' : 'thin'}
          spineCapTop={opts.spineCapTop ?? false}
          spineCapBottom={opts.spineCapBottom ?? false}
          selectable={inSelection}
          selected={selected}
          onSelectToggle={toggleThis}
          animateIn={animateInKey === selectionKey}
          onCaptionChange={(next) => {
            void handleCaptionChange(item.id, next);
          }}
          onOpenPhoto={() => {
            /* gallery viewer wired later */
          }}
          onLongPress={() => {
            if (inSelection) return;
            setActionTarget(item);
          }}
          onPhotoLongPress={() => {
            if (inSelection) return;
            setActionTarget(item);
          }}
          onDragStart={() => undefined}
        />
      );
    }
    if (item.kind === 'voice') {
      return (
        <VoiceClipRow
          key={`voice:${item.id}`}
          clip={item.clip}
          loggedByName={loggedByName}
          isMember={opts.isMember}
          spineThickness={opts.isMember ? 'thick' : 'thin'}
          spineCapTop={opts.spineCapTop ?? false}
          spineCapBottom={opts.spineCapBottom ?? false}
          selectable={inSelection}
          selected={selected}
          onSelectToggle={toggleThis}
          animateIn={animateInKey === selectionKey}
          onOpenTranscript={() => setEditingTranscriptFor(item.clip)}
          onLongPress={() => {
            if (inSelection) return;
            setActionTarget(item);
          }}
          onRetranscribe={() => {
            void handleRetranscribe(item.id);
          }}
          onDragStart={() => undefined}
        />
      );
    }
    // Expense: pull the full ExpenseWithPhotos from the store.
    const full = expenseById.get(item.id);
    if (!full) return null;
    const category = categoryById.get(full.categoryId) ?? null;
    return (
      <ExpenseTimelineRow
        key={`expense:${item.id}`}
        expense={full}
        category={category}
        homeCurrency={homeCurrency}
        loggedByName={loggedByName}
        isSelfLogged={isSelfLogged}
        isMember={opts.isMember}
        spineThickness={opts.isMember ? 'thick' : 'thin'}
        spineCapTop={opts.spineCapTop ?? false}
        spineCapBottom={opts.spineCapBottom ?? false}
        selectable={inSelection}
        selected={selected}
        onSelectToggle={toggleThis}
        animateIn={animateInKey === selectionKey}
        onLongPress={() => {
          if (inSelection) return;
          setActionTarget(item);
        }}
        onDragStart={() => undefined}
      />
    );
  };

  // Look up the current moment_id of an entry by (kind, id). Used to detect
  // when a member being added/created into a Moment is being stolen from
  // another Moment (most often a different day's, e.g., a spread expense)
  // so we can warn the user via toast.
  const currentMomentIdOf = (
    kind: 'photo' | 'voice' | 'expense',
    id: string,
  ): string | null => {
    if (kind === 'photo') {
      return photoEntries.find((e) => e.id === id)?.momentId ?? null;
    }
    if (kind === 'voice') {
      return clips.find((c) => c.id === id)?.momentId ?? null;
    }
    return expenseById.get(id)?.momentId ?? null;
  };

  // Selection confirm — branches on purpose. For 'create', collect ids
  // and open the name sheet. For 'addToMoment', diff selected vs current
  // membership and apply add/remove. (Lesson #14.)
  const confirmSelection = async (): Promise<void> => {
    if (!selectionPurpose) return;
    const memberIds: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string }> = [];
    for (const key of selectedKeys) {
      const idx = key.indexOf(':');
      if (idx < 0) continue;
      const kind = key.slice(0, idx) as 'photo' | 'voice' | 'expense';
      const id = key.slice(idx + 1);
      memberIds.push({ kind, id });
    }
    const photoMembers = memberIds.filter((m) => m.kind === 'photo').map((m) => m.id);

    if (selectionPurpose.kind === 'create') {
      setNamingMoment({
        memberIds,
        defaultCoverEntryId: photoMembers[0] ?? null,
        candidatePhotoEntryIds: photoMembers,
      });
      return;
    }
    // addToMoment: diff current vs selected.
    const momentId = selectionPurpose.momentId;
    const existing = sections.find(
      (s) => s.kind === 'moment' && s.id === momentId,
    );
    if (!existing || existing.kind !== 'moment') {
      cancelSelection();
      return;
    }
    const existingKeys = new Set(
      existing.members.map((m) => `${m.kind}:${m.id}`),
    );
    const selectedSet = new Set(memberIds.map((m) => `${m.kind}:${m.id}`));
    const toAdd = memberIds.filter((m) => !existingKeys.has(`${m.kind}:${m.id}`));
    const toRemove = existing.members.filter(
      (m) => !selectedSet.has(`${m.kind}:${m.id}`),
    );
    // Count how many incoming members were already members of a *different*
    // Moment — those will be silently moved by the addMember overwrite.
    let stolenCount = 0;
    for (const a of toAdd) {
      const prev = currentMomentIdOf(a.kind, a.id);
      if (prev != null && prev !== momentId) stolenCount += 1;
    }
    try {
      await Promise.all([
        ...toAdd.map((a) => journalMoments.addMember(momentId, a.kind, a.id)),
        ...toRemove.map((r) => journalMoments.removeMember(r.kind, r.id))
      ]);
      cancelSelection();
      await Promise.all([reloadDayLists(), moments.reload(), summary.reload()]);
      if (stolenCount > 0) {
        Alert.alert(
          '',
          t('journal.momentStolenFromAnother', { count: stolenCount }),
        );
      }
    } catch (e) {
      console.warn('addToMoment failed:', e);
    }
  };

  const handleMomentNameSave = async (
    title: string | null,
    coverEntryId: string | null,
  ): Promise<void> => {
    if (!namingMoment) return;
    // Count members that were already in another Moment so we can toast
    // about the silent move once creation succeeds.
    let stolenCount = 0;
    for (const m of namingMoment.memberIds) {
      if (currentMomentIdOf(m.kind, m.id) != null) stolenCount += 1;
    }
    try {
      await journalMoments.createMoment({
        tripId,
        dayDate,
        title,
        coverPhotoEntryId: coverEntryId,
        createdBy: currentUserId,
        memberIds: namingMoment.memberIds,
      });
      setNamingMoment(null);
      cancelSelection();
      await Promise.all([reloadDayLists(), moments.reload(), summary.reload()]);
      if (stolenCount > 0) {
        Alert.alert(
          '',
          t('journal.momentStolenFromAnother', { count: stolenCount }),
        );
      }
    } catch (e) {
      console.warn('createMoment failed:', e);
    }
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: theme.bg }]}
    >
      <DateStrip
        tripId={tripId}
        startDate={trip.startDate}
        endDate={trip.endDate}
        currentDate={dayDate}
        onPick={setDayDate}
        showBackButton={showBackButton}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <DayCoverHero
          dayDate={dayDate}
          isToday={isToday}
          dayIndex={dayIndex}
          dayTotal={dayTotal}
          effectiveLocation={summary.effectiveLocation}
          coverStoragePath={summary.coverStoragePath}
          onPlaceholderPress={() => setCoverPickerVisible(true)}
          onCoverLongPress={() => setCoverPickerVisible(true)}
        />
        <DayStatsStrip
          totalConvertedAmount={summary.totalConvertedAmount}
          homeCurrency={homeCurrency}
          photoCount={summary.photoCount}
          voiceCount={summary.voiceCount}
          expenseCount={summary.expenseCount}
          effectiveLocation={summary.effectiveLocation}
          isAutoLocation={summary.meta?.location == null}
          onTotalPress={() => setBreakdownOpen(true)}
          onChipPress={scrollToFirstOfKind}
          onLocationChange={handleLocationChange}
        />
        <View
          style={styles.timelineWrap}
          onLayout={(e) => {
            timelineWrapYRef.current = e.nativeEvent.layout.y;
          }}
        >
          {/* Spine: per-row slices via SpineSlice (inside SpineNode and
              MomentHeader). No global spine here — see SpineSlice.tsx and
              Lesson #5: spine is ONE line, ownership is per-row to handle
              caps + Moment thickness transitions cleanly. */}
          {isEmpty ? (
            <View style={styles.emptyDay}>
              {/* Three stacked dots evoke the spine continuing into nothing
                  — a quiet visual cue that there's room for entries here. */}
              <View style={styles.emptyDots}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.emptyDot,
                      { backgroundColor: theme.accent, opacity: 0.3 - i * 0.08 },
                    ]}
                  />
                ))}
              </View>
              <Pressable
                onPress={() => setAddMenuOpen(true)}
                accessibilityLabel={t('journal.addPhotos')}
                style={({ pressed }) => [
                  styles.emptyCta,
                  {
                    backgroundColor: theme.accentSoft,
                    borderColor: theme.accent,
                  },
                  pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] },
                ]}
              >
                <Text style={[styles.emptyCtaGlyph, { color: theme.accent }]}>
                  ＋
                </Text>
              </Pressable>
              <Text style={[styles.emptyDayText, { color: theme.text }]}>
                {t('journal.dayEmpty')}
              </Text>
            </View>
          ) : (
            sections.map((s, sIdx) => {
              if (s.kind === 'solo') {
                return (
                  <View
                    key={`solo:${s.id}`}
                    onLayout={handleRowLayout(`solo:${s.item.kind}:${s.item.id}`)}
                  >
                    {renderRow(s.item, {
                      isMember: false,
                      spineCapTop: isFirstSection(sIdx),
                      spineCapBottom: isLastSection(sIdx),
                    })}
                  </View>
                );
              }
              const collapsed = collapsedMomentIds.has(s.id);
              const isSplitting = splittingMomentId === s.id;
              return (
                <View
                  key={`m:${s.id}`}
                  onLayout={handleRowLayout(`moment:${s.id}`)}
                >
                  <MomentHeader
                    moment={s.moment}
                    startsAt={s.startsAt}
                    endsAt={s.endsAt}
                    memberCount={s.members.length}
                    collapsed={collapsed}
                    onPress={() => {
                      if (inSelection) return;
                      setEditingMomentId(s.id);
                    }}
                    onToggleCollapse={() => toggleMomentCollapse(s.id)}
                    spineCapTop={isFirstSection(sIdx)}
                    spineCapBottom={isLastSection(sIdx) && collapsed}
                  />
                  {collapsed ? (
                    <View style={styles.collapsedHint}>
                      <Text
                        style={[
                          styles.collapsedHintText,
                          { color: theme.textMuted },
                        ]}
                      >
                        {t('journal.momentCount', { count: s.members.length })}
                      </Text>
                    </View>
                  ) : (
                    <MomentTintBand>
                      {s.members.map((it, idx) => (
                        <Fragment key={`${it.kind}:${it.id}`}>
                          {renderRow(it, {
                            isMember: true,
                            spineCapTop: false,
                            spineCapBottom:
                              isLastSection(sIdx) && idx === s.members.length - 1,
                          })}
                          {isSplitting && idx < s.members.length - 1 ? (
                            <Pressable
                              onPress={() => {
                                Alert.alert(
                                  t('journal.momentSplit'),
                                  t('journal.momentSplitConfirm', {
                                    a: s.moment.title ?? t('journal.untitledMoment'),
                                    b: `${s.moment.title ?? t('journal.untitledMoment')} (2)`,
                                  }),
                                  [
                                    { text: t('common.cancel'), style: 'cancel' },
                                    {
                                      text: t('journal.momentSplit'),
                                      onPress: async () => {
                                        try {
                                          await journalMoments.splitMomentAfter(s.id, {
                                            kind: it.kind,
                                            id: it.id,
                                          });
                                          setSplittingMomentId(null);
                                          await Promise.all([
                                            reloadDayLists(),
                                            moments.reload(),
                                          ]);
                                        } catch (e) {
                                          console.warn('splitMomentAfter failed:', e);
                                        }
                                      },
                                    },
                                  ],
                                );
                              }}
                              style={({ pressed }) => [
                                styles.splitBetween,
                                { borderColor: theme.accent },
                                pressed && { opacity: 0.7 },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.splitBetweenTxt,
                                  { color: theme.accent },
                                ]}
                              >
                                ✂  {t('journal.momentSplit')}
                              </Text>
                            </Pressable>
                          ) : null}
                        </Fragment>
                      ))}
                    </MomentTintBand>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
      {!inSelection ? (
        <JournalFab
          tripId={tripId}
          dayDate={dayDate}
          momentEnabled={sections.length > 0}
          onCreateMoment={startCreateMoment}
          menuOpen={addMenuOpen}
          onMenuOpenChange={setAddMenuOpen}
          onCreated={async () => {
            await reloadDayLists();
            await summary.reload();
            await moments.reload();
          }}
        />
      ) : null}
      {inSelection ? (
        <MomentSelectionBanner
          selectedCount={selectedKeys.size}
          mode={selectionPurpose?.kind === 'addToMoment' ? 'edit' : 'create'}
          onCancel={cancelSelection}
          onConfirm={() => {
            void confirmSelection();
          }}
        />
      ) : null}
      <MomentNameSheet
        visible={namingMoment != null}
        defaultCoverEntryId={namingMoment?.defaultCoverEntryId ?? null}
        candidatePhotoEntryIds={namingMoment?.candidatePhotoEntryIds ?? []}
        onDismiss={() => setNamingMoment(null)}
        onSave={(title, coverEntryId) => {
          void handleMomentNameSave(title, coverEntryId);
        }}
      />
      <TimelineItemActions
        item={actionTarget}
        isMember={actionTarget != null && momentIdOf(actionTarget) != null}
        onDismiss={() => setActionTarget(null)}
        onEditTimestamp={() => {
          if (!actionTarget) return;
          setEditingTimestampFor(actionTarget);
          setActionTarget(null);
        }}
        onSetCover={async () => {
          if (!actionTarget || actionTarget.kind !== 'photo') return;
          const id = actionTarget.id;
          setActionTarget(null);
          await handleSetCoverFromEntry(id);
        }}
        onRetranscribe={async () => {
          if (!actionTarget || actionTarget.kind !== 'voice') return;
          const id = actionTarget.id;
          setActionTarget(null);
          await handleRetranscribe(id);
        }}
        onRemoveFromMoment={async () => {
          if (!actionTarget) return;
          const target = actionTarget;
          setActionTarget(null);
          try {
            await journalMoments.removeMember(target.kind, target.id);
            await Promise.all([
              reloadDayLists(),
              moments.reload(),
              summary.reload(),
            ]);
          } catch (e) {
            console.warn('removeMember failed:', e);
          }
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
          } catch (e) {
            console.warn('DayScreen delete failed:', e);
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
                const d = new Date(iso);
                const hh = String(d.getHours()).padStart(2, '0');
                const mm = String(d.getMinutes()).padStart(2, '0');
                await expenseQueries.updateExpense({
                  id: target.id,
                  expenseTime: `${hh}:${mm}:00`,
                });
                await loadExpensesForTrip(tripId);
              }
              // Cross-day eject (Lesson + spec): if the new ISO lands on a
              // different day AND the entry was a Moment member, remove
              // it from the Moment and toast.
              const newDate = iso.slice(0, 10);
              if (newDate !== dayDate) {
                const prevMomentId = momentIdOf(target);
                if (prevMomentId) {
                  const mom = moments.moments.find((m) => m.id === prevMomentId);
                  try {
                    await journalMoments.removeMember(target.kind, target.id);
                    Alert.alert(
                      '',
                      t('journal.momentMemberEjectedCrossDay', {
                        date: newDate,
                        momentName: mom?.title ?? t('journal.untitledMoment'),
                      }),
                    );
                  } catch (e) {
                    console.warn('Cross-day eject failed:', e);
                  }
                }
              }
              await Promise.all([reloadDayLists(), moments.reload()]);
            } catch (e) {
              console.warn('DayScreen timestamp update failed:', e);
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
          } catch (e) {
            console.warn('DayScreen updateClipTranscript failed:', e);
          }
        }}
      />
      <DayCoverPicker
        visible={coverPickerVisible}
        candidates={photoEntries}
        currentCoverEntryId={summary.meta?.coverPhotoEntryId ?? null}
        onPick={async (entryId) => {
          setCoverPickerVisible(false);
          await handleSetCoverFromEntry(entryId);
        }}
        onClear={async () => {
          setCoverPickerVisible(false);
          await handleClearCover();
        }}
        onDismiss={() => setCoverPickerVisible(false)}
      />
      <MomentOptionsSheet
        moment={
          editingMomentId
            ? moments.moments.find((m) => m.id === editingMomentId) ?? null
            : null
        }
        onDismiss={() => setEditingMomentId(null)}
        onRename={async (title) => {
          if (!editingMomentId) return;
          try {
            await journalMoments.updateMomentTitle(editingMomentId, title);
            await moments.reload();
          } catch (e) {
            console.warn('updateMomentTitle failed:', e);
          }
        }}
        onChangeCover={() => {
          if (!editingMomentId) return;
          setCoverPickerForMomentId(editingMomentId);
          setEditingMomentId(null);
        }}
        onAddEntries={() => {
          const mid = editingMomentId;
          if (!mid) return;
          // Pre-fill selection with this Moment's current members so the
          // user can deselect to remove + add new ones; confirm runs the
          // diff in confirmSelection's addToMoment branch (Lesson #14).
          const initial = new Set<string>();
          for (const s of sections) {
            if (s.kind === 'moment' && s.id === mid) {
              for (const m of s.members) initial.add(`${m.kind}:${m.id}`);
            }
          }
          setSelectedKeys(initial);
          setSelectionPurpose({ kind: 'addToMoment', momentId: mid });
          setEditingMomentId(null);
        }}
        onSplit={() => {
          if (!editingMomentId) return;
          setSplittingMomentId(editingMomentId);
          setEditingMomentId(null);
        }}
        onDelete={async () => {
          if (!editingMomentId) return;
          const mid = editingMomentId;
          setEditingMomentId(null);
          try {
            await journalMoments.deleteMoment(mid);
            await Promise.all([
              reloadDayLists(),
              moments.reload(),
              summary.reload(),
            ]);
          } catch (e) {
            console.warn('deleteMoment failed:', e);
          }
        }}
      />
      <DaySpendingBreakdown
        visible={breakdownOpen}
        expenses={expensesForDay}
        categoriesById={categoryById}
        homeCurrency={homeCurrency}
        onDismiss={() => setBreakdownOpen(false)}
      />
      <MomentCoverPicker
        visible={coverPickerForMomentId != null}
        candidates={photoEntries.filter(
          (p) => coverPickerForMomentId != null && p.momentId === coverPickerForMomentId,
        )}
        currentCoverEntryId={
          coverPickerForMomentId
            ? moments.moments.find((m) => m.id === coverPickerForMomentId)
                ?.coverPhotoEntryId ?? null
            : null
        }
        onDismiss={() => setCoverPickerForMomentId(null)}
        onPick={async (entryId) => {
          const mid = coverPickerForMomentId;
          setCoverPickerForMomentId(null);
          if (!mid) return;
          try {
            await journalMoments.updateMomentCover(mid, entryId);
            await moments.reload();
          } catch (e) {
            console.warn('updateMomentCover failed:', e);
          }
        }}
      />
    </SafeAreaView>
  );
}

function computeDayIndex(start: string, target: string): number | null {
  const s = new Date(`${start}T00:00:00Z`);
  const t = new Date(`${target}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(t.getTime())) return null;
  return Math.max(1, Math.floor((t.getTime() - s.getTime()) / 86_400_000) + 1);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 140 },
  // Lesson #5: zero horizontal padding here. The SpineNode's column width
  // (64) already centers the dot inside it, and the spine is positioned
  // relative to this wrap. Adding paddingHorizontal here would create the
  // 14px offset described in the brief.
  timelineWrap: {
    position: 'relative',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  emptyDay: {
    paddingTop: 36,
    paddingBottom: 60,
    alignItems: 'center',
    gap: 14,
  },
  emptyDots: { gap: 5, marginBottom: 8, alignItems: 'center' },
  emptyDot: { width: 6, height: 6, borderRadius: 3 },
  emptyCta: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCtaGlyph: { fontSize: 26, fontWeight: '800' },
  emptyDayText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 240,
    letterSpacing: 0.1,
  },
  collapsedHint: {
    paddingInlineStart: NODE_COLUMN_WIDTH + 4,
    paddingVertical: 6,
    marginBottom: 10,
  },
  collapsedHintText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  splitBetween: {
    marginInlineStart: NODE_COLUMN_WIDTH + 12,
    marginVertical: 2,
    marginBottom: 14,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  splitBetweenTxt: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
