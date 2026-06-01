import type { Expense } from '@/types/expense';
import type { JournalMoment, JournalPhotoEntryWithPhotos } from '@/types/journal';
import type { VoiceClip } from '@/types/voice';

import {
  buildDayTimeline,
  computeReorderTimestamp,
  flattenSections,
  type TimelineItem,
  type TimelineSection,
} from './journalTimeline';

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

// ── helper to make JournalMoment fixtures ──────────────────────────────────
function makeMoment(overrides: Partial<JournalMoment> & { id: string }): JournalMoment {
  return {
    id: overrides.id,
    tripId: overrides.tripId ?? 't1',
    dayDate: overrides.dayDate ?? '2026-05-24',
    title: overrides.title ?? null,
    coverPhotoEntryId: overrides.coverPhotoEntryId ?? null,
    createdBy: overrides.createdBy ?? 'me',
    createdAt: overrides.createdAt ?? '2026-05-24T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-05-24T00:00:00Z',
    deletedAt: overrides.deletedAt ?? null,
  };
}

describe('buildDayTimeline', () => {
  it('interleaves all three kinds in chronological order', () => {
    const sections = buildDayTimeline({
      photoEntries: [photo('p1', '2026-05-23T10:00:00Z')],
      voiceClips: [clip('v1', '2026-05-23T09:00:00Z')],
      expenses: [expense('e1', '2026-05-23', '11:00:00')],
      moments: [],
      currentUserId: 'me',
    });
    const items = flattenSections(sections);
    expect(items.map((i) => i.id)).toEqual(['v1', 'p1', 'e1']);
    expect(items.map((i) => i.kind)).toEqual(['voice', 'photo', 'expense']);
  });

  it("filters out other members' private items", () => {
    const sections = buildDayTimeline({
      photoEntries: [photo('p1', '2026-05-23T10:00:00Z', true, 'other')],
      voiceClips: [clip('v1', '2026-05-23T09:00:00Z', true, 'me')],
      expenses: [expense('e1', '2026-05-23', '11:00:00', true, 'other')],
      moments: [],
      currentUserId: 'me',
    });
    // p1 and e1 are someone else's private items → hidden.
    const items = flattenSections(sections);
    expect(items.map((i) => i.id)).toEqual(['v1']);
  });

  it("keeps an item's own private items visible to the author", () => {
    const sections = buildDayTimeline({
      photoEntries: [photo('p1', '2026-05-23T10:00:00Z', true, 'me')],
      voiceClips: [],
      expenses: [],
      moments: [],
      currentUserId: 'me',
    });
    const items = flattenSections(sections);
    expect(items.map((i) => i.id)).toEqual(['p1']);
  });

  it('handles ties by stable sort (insertion order)', () => {
    const sections = buildDayTimeline({
      photoEntries: [photo('p1', '2026-05-23T09:00:00Z')],
      voiceClips: [clip('v1', '2026-05-23T09:00:00Z')],
      expenses: [],
      moments: [],
      currentUserId: 'me',
    });
    const items = flattenSections(sections);
    expect(items.length).toBe(2);
    expect(items[0].occurredAt.getTime()).toBe(items[1].occurredAt.getTime());
  });
});

// ── Moments grouping tests ──────────────────────────────────────────────────

describe('buildDayTimeline — Moments grouping', () => {
  it('groups members under their parent Moment in occurred_at order', () => {
    const m1 = makeMoment({ id: 'm1', title: 'Lunch' });
    const p1 = photo('p1', '2026-05-24T12:50:00Z');
    // assign momentId inline (fixture helper always sets null, so override)
    (p1 as JournalPhotoEntryWithPhotos).momentId = 'm1';
    const v1 = clip('v1', '2026-05-24T12:42:00Z');
    (v1 as VoiceClip).momentId = 'm1';
    const p2 = photo('p2', '2026-05-24T14:30:00Z'); // solo

    const sections = buildDayTimeline({
      photoEntries: [p1, p2],
      voiceClips: [v1],
      expenses: [],
      moments: [m1],
      currentUserId: 'me',
    });

    expect(sections).toHaveLength(2);

    // First section is the Moment
    const momentSection = sections[0] as Extract<TimelineSection, { kind: 'moment' }>;
    expect(momentSection.kind).toBe('moment');
    expect(momentSection.id).toBe('m1');
    expect(momentSection.moment).toBe(m1);
    expect(momentSection.members).toHaveLength(2);
    // Members sorted by occurredAt: voice (12:42) before photo (12:50)
    expect(momentSection.members[0].id).toBe('v1');
    expect(momentSection.members[1].id).toBe('p1');
    expect(momentSection.startsAt).toBe('2026-05-24T12:42:00.000Z');
    expect(momentSection.endsAt).toBe('2026-05-24T12:50:00.000Z');

    // Second section is the solo photo
    const soloSection = sections[1] as Extract<TimelineSection, { kind: 'solo' }>;
    expect(soloSection.kind).toBe('solo');
    expect(soloSection.id).toBe('p2');
    expect(soloSection.item.id).toBe('p2');
  });

  it('falls back to solo when a Moment has no surviving members', () => {
    // Moment exists but all its members were soft-deleted upstream, so
    // they are not in the input lists. The Moment section is dropped entirely.
    const m1 = makeMoment({ id: 'm1', title: 'Ghost Moment' });
    const soloPhoto = photo('p1', '2026-05-24T10:00:00Z');

    const sections = buildDayTimeline({
      photoEntries: [soloPhoto],
      voiceClips: [],
      expenses: [],
      moments: [m1],
      currentUserId: 'me',
    });

    // No moment section — only the solo
    expect(sections).toHaveLength(1);
    expect(sections[0].kind).toBe('solo');
    expect(sections[0].id).toBe('p1');
  });

  it('omits deleted Moments but keeps their member items as solos', () => {
    // Moment is soft-deleted; the items that referenced it are not deleted.
    const m1 = makeMoment({ id: 'm1', deletedAt: '2026-05-24T08:00:00Z' });
    const p1 = photo('p1', '2026-05-24T12:00:00Z');
    (p1 as JournalPhotoEntryWithPhotos).momentId = 'm1';
    const v1 = clip('v1', '2026-05-24T12:30:00Z');
    (v1 as VoiceClip).momentId = 'm1';

    const sections = buildDayTimeline({
      photoEntries: [p1],
      voiceClips: [v1],
      expenses: [],
      moments: [m1],
      currentUserId: 'me',
    });

    // Moment skipped; items appear as solos
    expect(sections).toHaveLength(2);
    const kinds = sections.map((s) => s.kind);
    expect(kinds).toEqual(['solo', 'solo']);
    const ids = sections.map((s) => s.id);
    // chronological order: p1 at 12:00, v1 at 12:30
    expect(ids).toEqual(['p1', 'v1']);
  });

  it('sorts sections chronologically by their effective start time', () => {
    // Solo at 10am, Moment starting at 11am, solo at 12pm — given in scrambled order
    const m1 = makeMoment({ id: 'm1', title: 'Midday' });
    const v1 = clip('v1', '2026-05-24T11:00:00Z');
    (v1 as VoiceClip).momentId = 'm1';

    const soloEarly = photo('p_early', '2026-05-24T10:00:00Z');
    const soloLate = photo('p_late', '2026-05-24T12:00:00Z');

    // Feed inputs in a scrambled order to make sure sorting is based on time
    const sections = buildDayTimeline({
      photoEntries: [soloLate, soloEarly],
      voiceClips: [v1],
      expenses: [],
      moments: [m1],
      currentUserId: 'me',
    });

    expect(sections).toHaveLength(3);
    expect(sections[0].id).toBe('p_early');  // 10am solo
    expect(sections[1].id).toBe('m1');       // 11am moment
    expect(sections[2].id).toBe('p_late');   // 12pm solo
  });

  it('preserves visibility filter before grouping (private items from other users are excluded)', () => {
    // Another user's private photo is assigned to a Moment — it must NOT be
    // included in the Moment's member count (visibility filter runs first).
    const m1 = makeMoment({ id: 'm1' });
    const privateOther = photo('p_other', '2026-05-24T11:00:00Z', true, 'other');
    (privateOther as JournalPhotoEntryWithPhotos).momentId = 'm1';
    // Own public photo also in the moment
    const ownPhoto = photo('p_own', '2026-05-24T11:30:00Z', false, 'me');
    (ownPhoto as JournalPhotoEntryWithPhotos).momentId = 'm1';

    const sections = buildDayTimeline({
      photoEntries: [privateOther, ownPhoto],
      voiceClips: [],
      expenses: [],
      moments: [m1],
      currentUserId: 'me',
    });

    // Private item filtered out; Moment exists with only the own photo
    expect(sections).toHaveLength(1);
    const momentSection = sections[0] as Extract<TimelineSection, { kind: 'moment' }>;
    expect(momentSection.kind).toBe('moment');
    expect(momentSection.members).toHaveLength(1);
    expect(momentSection.members[0].id).toBe('p_own');
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
