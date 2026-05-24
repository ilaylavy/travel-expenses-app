import type { Expense } from '@/types/expense';
import type { JournalPhotoEntryWithPhotos } from '@/types/journal';
import type { VoiceClip } from '@/types/voice';

import { buildDayTimeline, computeReorderTimestamp } from './journalTimeline';

function photo(
  id: string,
  occurredAt: string,
  isPrivate = false,
  userId = 'me',
): JournalPhotoEntryWithPhotos {
  return {
    id,
    tripId: 't1',
    userId,
    occurredAt,
    caption: null,
    isPrivate,
    momentId: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    deletedAt: null,
    photos: [],
  };
}

function clip(
  id: string,
  occurredAt: string,
  isPrivate = false,
  userId = 'me',
): VoiceClip {
  return {
    id,
    tripId: 't1',
    userId,
    occurredAt,
    storagePath: '',
    localUri: null,
    durationSec: 10,
    transcript: null,
    transcriptStatus: 'done',
    transcriptError: null,
    isPrivate,
    momentId: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    deletedAt: null,
  };
}

function expense(
  id: string,
  date: string,
  time: string,
  isPrivate = false,
  userId = 'me',
): Expense {
  return {
    id,
    tripId: 't1',
    userId,
    amount: 10,
    currency: 'EUR',
    convertedAmount: 10,
    exchangeRate: 1,
    categoryId: 'cat1',
    note: null,
    paymentMethod: null,
    latitude: null,
    longitude: null,
    placeName: null,
    expenseDate: date,
    expenseTime: time,
    isRefund: false,
    isExcludedFromDailyMetrics: false,
    isPrivate,
    isSplit: false,
    spreadStartDate: null,
    spreadEndDate: null,
    momentId: null,
    createdAt: `${date}T${time}Z`,
    updatedAt: `${date}T${time}Z`,
    deletedAt: null,
  };
}

describe('buildDayTimeline', () => {
  it('interleaves all three kinds in chronological order', () => {
    const items = buildDayTimeline({
      photoEntries: [photo('p1', '2026-05-23T10:00:00Z')],
      voiceClips: [clip('v1', '2026-05-23T09:00:00Z')],
      expenses: [expense('e1', '2026-05-23', '11:00:00')],
      currentUserId: 'me',
    });
    expect(items.map((i) => i.id)).toEqual(['v1', 'p1', 'e1']);
    expect(items.map((i) => i.kind)).toEqual(['voice', 'photo', 'expense']);
  });

  it("filters out other members' private items", () => {
    const items = buildDayTimeline({
      photoEntries: [photo('p1', '2026-05-23T10:00:00Z', true, 'other')],
      voiceClips: [clip('v1', '2026-05-23T09:00:00Z', true, 'me')],
      expenses: [expense('e1', '2026-05-23', '11:00:00', true, 'other')],
      currentUserId: 'me',
    });
    // p1 and e1 are someone else's private items → hidden.
    expect(items.map((i) => i.id)).toEqual(['v1']);
  });

  it("keeps an item's own private items visible to the author", () => {
    const items = buildDayTimeline({
      photoEntries: [photo('p1', '2026-05-23T10:00:00Z', true, 'me')],
      voiceClips: [],
      expenses: [],
      currentUserId: 'me',
    });
    expect(items.map((i) => i.id)).toEqual(['p1']);
  });

  it('handles ties by stable sort (insertion order)', () => {
    const items = buildDayTimeline({
      photoEntries: [photo('p1', '2026-05-23T09:00:00Z')],
      voiceClips: [clip('v1', '2026-05-23T09:00:00Z')],
      expenses: [],
      currentUserId: 'me',
    });
    expect(items.length).toBe(2);
    expect(items[0].occurredAt.getTime()).toBe(items[1].occurredAt.getTime());
  });
});

describe('computeReorderTimestamp', () => {
  function asItem(occurredAtISO: string): import('./journalTimeline').TimelineItem {
    return {
      kind: 'voice',
      id: 'x',
      occurredAt: new Date(occurredAtISO),
      clip: clip('x', occurredAtISO),
      transcript: null,
      userId: 'me',
      isPrivate: false,
    };
  }

  it('returns midpoint between two neighbors', () => {
    const ts = computeReorderTimestamp({
      above: asItem('2026-05-23T10:00:00.000Z'),
      below: asItem('2026-05-23T10:02:00.000Z'),
    });
    expect(ts).toBe('2026-05-23T10:01:00.000Z');
  });

  it('returns 60s before first when dropped at top', () => {
    const ts = computeReorderTimestamp({
      above: null,
      below: asItem('2026-05-23T10:00:00.000Z'),
    });
    expect(ts).toBe('2026-05-23T09:59:00.000Z');
  });

  it('returns 60s after last when dropped at bottom', () => {
    const ts = computeReorderTimestamp({
      above: asItem('2026-05-23T10:00:00.000Z'),
      below: null,
    });
    expect(ts).toBe('2026-05-23T10:01:00.000Z');
  });

  it('returns null with no neighbors', () => {
    expect(computeReorderTimestamp({ above: null, below: null })).toBeNull();
  });
});
