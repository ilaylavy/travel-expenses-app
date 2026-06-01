// Merge journal photo entries, voice clips, and expenses into one
// chronologically-ordered timeline for a given day. Pure function — does no
// SQL on its own. Callers are responsible for fetching the three lists with
// the right per-day, per-user filters.

import type { Expense } from '@/types/expense';
import type {
  JournalMoment,
  JournalPhoto,
  JournalPhotoEntry,
  JournalPhotoEntryWithPhotos,
} from '@/types/journal';
import type { VoiceClip } from '@/types/voice';

export type TimelineItem =
  | {
      kind: 'photo';
      id: string;
      occurredAt: Date;
      entry: JournalPhotoEntry;
      photos: JournalPhoto[];
      caption: string | null;
      userId: string;
      isPrivate: boolean;
    }
  | {
      kind: 'voice';
      id: string;
      occurredAt: Date;
      clip: VoiceClip;
      transcript: string | null;
      userId: string;
      isPrivate: boolean;
    }
  | {
      kind: 'expense';
      id: string;
      occurredAt: Date;
      expense: Expense;
      userId: string;
      isPrivate: boolean;
    };

export type TimelineSection =
  | { kind: 'solo'; id: string; item: TimelineItem }
  | {
      kind: 'moment';
      id: string;
      moment: JournalMoment;
      members: TimelineItem[];
      startsAt: string; // ISO, min(members.occurredAt)
      endsAt: string;   // ISO, max(members.occurredAt)
    };

function visible(userId: string, isPrivate: boolean, currentUserId: string): boolean {
  return userId === currentUserId || !isPrivate;
}

// Extract the item-building logic into a private helper so it can be reused
// by the section builder without duplicating the per-kind mapping code.
function buildItems(input: {
  photoEntries: JournalPhotoEntryWithPhotos[];
  voiceClips: VoiceClip[];
  expenses: Expense[];
  currentUserId: string;
}): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const e of input.photoEntries) {
    if (!visible(e.userId, e.isPrivate, input.currentUserId)) continue;
    items.push({
      kind: 'photo',
      id: e.id,
      occurredAt: new Date(e.occurredAt),
      entry: e,
      photos: e.photos,
      caption: e.caption,
      userId: e.userId,
      isPrivate: e.isPrivate,
    });
  }
  for (const c of input.voiceClips) {
    if (!visible(c.userId, c.isPrivate, input.currentUserId)) continue;
    items.push({
      kind: 'voice',
      id: c.id,
      occurredAt: new Date(c.occurredAt),
      clip: c,
      transcript: c.transcript,
      userId: c.userId,
      isPrivate: c.isPrivate,
    });
  }
  for (const x of input.expenses) {
    if (!visible(x.userId, x.isPrivate, input.currentUserId)) continue;
    items.push({
      kind: 'expense',
      id: x.id,
      occurredAt: new Date(`${x.expenseDate}T${x.expenseTime}Z`),
      expense: x,
      userId: x.userId,
      isPrivate: x.isPrivate,
    });
  }

  // Array.prototype.sort is stable in V8 / Hermes. Tied timestamps preserve
  // insertion order (photo → voice → expense — arbitrary but consistent).
  items.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return items;
}

export function momentIdOf(it: TimelineItem): string | null {
  if (it.kind === 'photo') return it.entry.momentId;
  if (it.kind === 'voice') return it.clip.momentId;
  return it.expense.momentId;
}

function sectionStartMs(s: TimelineSection): number {
  if (s.kind === 'solo') return s.item.occurredAt.getTime();
  return new Date(s.startsAt).getTime();
}

export function buildDayTimeline(input: {
  photoEntries: JournalPhotoEntryWithPhotos[];
  voiceClips: VoiceClip[];
  expenses: Expense[];
  moments: JournalMoment[];
  currentUserId: string;
}): TimelineSection[] {
  // 1. Visibility filter + flat sort — same logic as before.
  const items = buildItems(input);

  // 2. Build a set of active (non-deleted) moment IDs so we can decide
  //    whether an item's momentId still points at a live Moment.
  const activeMomentIds = new Set<string>(
    input.moments.filter((m) => !m.deletedAt).map((m) => m.id),
  );

  // 3. Bucket items by momentId, but only if the referenced Moment is still
  //    active. Items referencing a deleted (or unknown) Moment fall into solos.
  const byMoment = new Map<string, TimelineItem[]>();
  const solos: TimelineItem[] = [];
  for (const it of items) {
    const mid = momentIdOf(it);
    if (mid != null && activeMomentIds.has(mid)) {
      const list = byMoment.get(mid) ?? [];
      list.push(it);
      byMoment.set(mid, list);
    } else {
      solos.push(it);
    }
  }

  // 4. Build Moment sections; skip Moments with zero surviving members
  //    (all their items were soft-deleted upstream and therefore absent
  //    from the input lists — the activeMomentIds guard already excludes
  //    deleted Moments).
  const sections: TimelineSection[] = [];
  for (const m of input.moments) {
    if (m.deletedAt) continue;
    const members = (byMoment.get(m.id) ?? [])
      .slice()
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    if (members.length === 0) continue;
    sections.push({
      kind: 'moment',
      id: m.id,
      moment: m,
      members,
      startsAt: members[0]!.occurredAt.toISOString(),
      endsAt: members[members.length - 1]!.occurredAt.toISOString(),
    });
  }

  // 5. Each solo item becomes its own section.
  for (const it of solos) {
    sections.push({ kind: 'solo', id: it.id, item: it });
  }

  // 5. Sort all sections by effective start time ascending.
  sections.sort((a, b) => sectionStartMs(a) - sectionStartMs(b));
  return sections;
}

// Back-compat helper: callers that still consume a flat TimelineItem[] can
// wrap buildDayTimeline with this instead of touching their own code yet.
// Phases 4-7 will migrate consumers to work directly with TimelineSection[].
export function flattenSections(sections: TimelineSection[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const s of sections) {
    if (s.kind === 'solo') out.push(s.item);
    else out.push(...s.members);
  }
  return out;
}

// Reorder support: given an item being moved and its new neighbors after the
// drop, compute the new ISO timestamp for the moved item. Midpoint when
// neighbors exist; -60s above first / +60s below last when at an edge.
// Operates on TimelineItem (not sections) — drag resolves within the flat
// visible list, not at the section level.
export function computeReorderTimestamp(args: {
  above: TimelineItem | null;
  below: TimelineItem | null;
}): string | null {
  const { above, below } = args;
  if (!above && !below) return null;
  if (!above && below) return new Date(below.occurredAt.getTime() - 60_000).toISOString();
  if (above && !below) return new Date(above.occurredAt.getTime() + 60_000).toISOString();
  const aboveMs = above!.occurredAt.getTime();
  const belowMs = below!.occurredAt.getTime();
  const mid = Math.floor((aboveMs + belowMs) / 2);
  // Tie-break if collision (above and below are at the same ms).
  if (mid === aboveMs && mid === belowMs) return new Date(aboveMs + 1_000).toISOString();
  return new Date(mid).toISOString();
}
