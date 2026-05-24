// Web fallback — the journal isn't a supported feature on web. Stubs return
// empty data and no-op writes so consumers compile.

import type { JournalMoment } from '@/types/journal';

export async function listMomentsForDay(
  _tripId: string,
  _dayDate: string,
): Promise<JournalMoment[]> {
  return [];
}

export async function createMoment(_input: {
  tripId: string;
  dayDate: string;
  title: string | null;
  coverPhotoEntryId: string | null;
  createdBy: string;
  memberIds: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string }>;
}): Promise<JournalMoment> {
  throw new Error('createMoment: not supported on web');
}

export async function updateMomentTitle(_id: string, _title: string | null): Promise<void> {}
export async function updateMomentCover(_id: string, _cover: string | null): Promise<void> {}
export async function addMember(
  _momentId: string,
  _kind: 'photo' | 'voice' | 'expense',
  _entryId: string,
): Promise<void> {}
export async function removeMember(
  _kind: 'photo' | 'voice' | 'expense',
  _entryId: string,
): Promise<void> {}
export async function deleteMoment(_id: string): Promise<void> {}
export async function splitMomentAfter(
  _momentId: string,
  _afterMember: { kind: 'photo' | 'voice' | 'expense'; id: string },
): Promise<JournalMoment> {
  throw new Error('splitMomentAfter: not supported on web');
}
