// Merge journal photo entries, voice clips, and expenses into one
// chronologically-ordered timeline for a given day. Pure function — does no
// SQL on its own. Callers are responsible for fetching the three lists with
// the right per-day, per-user filters.

import type { Expense } from '@/types/expense';
import type {
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

function visible(userId: string, isPrivate: boolean, currentUserId: string): boolean {
  return userId === currentUserId || !isPrivate;
}

export function buildDayTimeline(input: {
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

// Reorder support: given an item being moved and its new neighbors after the
// drop, compute the new ISO timestamp for the moved item. Midpoint when
// neighbors exist; -60s above first / +60s below last when at an edge.
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
