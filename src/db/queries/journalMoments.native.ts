import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import { newId } from '@/utils/id';
import type {
  JournalMoment,
  JournalMomentRow,
} from '@/types/journal';

import { enqueueSync } from './syncQueue';

function rowToMoment(r: JournalMomentRow): JournalMoment {
  return {
    id: r.id,
    tripId: r.trip_id,
    dayDate: r.day_date,
    title: r.title,
    coverPhotoEntryId: r.cover_photo_entry_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

function momentToPayload(m: JournalMoment): Record<string, unknown> {
  return {
    id: m.id,
    trip_id: m.tripId,
    day_date: m.dayDate,
    title: m.title,
    cover_photo_entry_id: m.coverPhotoEntryId,
    created_by: m.createdBy,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
    deleted_at: m.deletedAt,
  };
}

const MEMBER_TABLES: Record<'photo' | 'voice' | 'expense', string> = {
  photo: 'journal_photo_entries',
  voice: 'voice_clips',
  expense: 'expenses',
};

export async function listMomentsForDay(
  tripId: string,
  dayDate: string,
): Promise<JournalMoment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<JournalMomentRow>(
    `SELECT * FROM journal_moments
      WHERE trip_id = ? AND day_date = ? AND deleted_at IS NULL
      ORDER BY created_at ASC;`,
    [tripId, dayDate],
  );
  return rows.map(rowToMoment);
}

export async function listMomentsForTrip(tripId: string): Promise<JournalMoment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<JournalMomentRow>(
    `SELECT * FROM journal_moments
      WHERE trip_id = ? AND deleted_at IS NULL
      ORDER BY day_date DESC, created_at ASC;`,
    [tripId],
  );
  return rows.map(rowToMoment);
}

export async function createMoment(input: {
  tripId: string;
  dayDate: string;
  title: string | null;
  coverPhotoEntryId: string | null;
  createdBy: string;
  memberIds: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string }>;
}): Promise<JournalMoment> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const moment: JournalMoment = {
    id: newId(),
    tripId: input.tripId,
    dayDate: input.dayDate,
    title: input.title,
    coverPhotoEntryId: input.coverPhotoEntryId,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO journal_moments
         (id, trip_id, day_date, title, cover_photo_entry_id, created_by,
          created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
      [moment.id, moment.tripId, moment.dayDate, moment.title,
       moment.coverPhotoEntryId, moment.createdBy, moment.createdAt, moment.updatedAt],
    );
    await enqueueSync(db, 'journal_moments', moment.id, 'create', momentToPayload(moment));

    for (const member of input.memberIds) {
      await assignMomentToEntryInTx(db, moment.id, member.kind, member.id, now);
    }
  });

  return moment;
}

export async function updateMomentTitle(
  momentId: string,
  title: string | null,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE journal_moments SET title = ?, updated_at = ? WHERE id = ?;`,
      [title, updatedAt, momentId],
    );
    await enqueueSync(db, 'journal_moments', momentId, 'update', {
      id: momentId,
      title,
      updated_at: updatedAt,
    });
  });
}

export async function updateMomentCover(
  momentId: string,
  coverPhotoEntryId: string | null,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE journal_moments SET cover_photo_entry_id = ?, updated_at = ? WHERE id = ?;`,
      [coverPhotoEntryId, updatedAt, momentId],
    );
    await enqueueSync(db, 'journal_moments', momentId, 'update', {
      id: momentId,
      cover_photo_entry_id: coverPhotoEntryId,
      updated_at: updatedAt,
    });
  });
}

export async function addMember(
  momentId: string,
  kind: 'photo' | 'voice' | 'expense',
  entryId: string,
): Promise<void> {
  const db = await getDatabase();
  const ts = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await assignMomentToEntryInTx(db, momentId, kind, entryId, ts);
  });
}

export async function removeMember(
  kind: 'photo' | 'voice' | 'expense',
  entryId: string,
): Promise<void> {
  const db = await getDatabase();
  const ts = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    // Find the entry's current moment_id so we can check "last member" after.
    const table = MEMBER_TABLES[kind];
    const row = await db.getFirstAsync<{ moment_id: string | null }>(
      `SELECT moment_id FROM ${table} WHERE id = ?;`,
      [entryId],
    );
    const previousMomentId = row?.moment_id ?? null;
    if (!previousMomentId) return;

    await assignMomentToEntryInTx(db, null, kind, entryId, ts);
    await maybeAutoDeleteEmptyMomentInTx(db, previousMomentId, ts);
  });
}

export async function deleteMoment(momentId: string): Promise<void> {
  const db = await getDatabase();
  const ts = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    // Null out every member's moment_id and queue each as an update.
    for (const kind of ['photo', 'voice', 'expense'] as const) {
      const table = MEMBER_TABLES[kind];
      const updatedMembers = await db.getAllAsync<{ id: string }>(
        `UPDATE ${table} SET moment_id = NULL, updated_at = ? WHERE moment_id = ? RETURNING id;`,
        [ts, momentId],
      );
      for (const m of updatedMembers) {
        await enqueueSync(db, table as never, m.id, 'update', {
          id: m.id,
          moment_id: null,
          updated_at: ts,
        });
      }
    }
    // Soft-delete the Moment itself.
    await db.runAsync(
      `UPDATE journal_moments SET deleted_at = ?, updated_at = ? WHERE id = ?;`,
      [ts, ts, momentId],
    );
    await enqueueSync(db, 'journal_moments', momentId, 'update', {
      id: momentId,
      deleted_at: ts,
      updated_at: ts,
    });
  });
}

export async function splitMomentAfter(
  momentId: string,
  afterMember: { kind: 'photo' | 'voice' | 'expense'; id: string },
): Promise<JournalMoment> {
  const db = await getDatabase();
  // Resolve current moment metadata + ordered member list.
  const moment = await db.getFirstAsync<JournalMomentRow>(
    `SELECT * FROM journal_moments WHERE id = ? AND deleted_at IS NULL;`,
    [momentId],
  );
  if (!moment) throw new Error(`splitMomentAfter: moment ${momentId} not found`);

  const orderedMembers = await listOrderedMembers(db, momentId);
  const cutIdx = orderedMembers.findIndex(
    (m) => m.kind === afterMember.kind && m.id === afterMember.id,
  );
  if (cutIdx < 0 || cutIdx === orderedMembers.length - 1) {
    throw new Error(`splitMomentAfter: invalid cut point`);
  }
  const movers = orderedMembers.slice(cutIdx + 1);

  // Build the new Moment with the second-half members.
  const newTitle = (moment.title ?? 'Untitled') + ' (2)';
  return await createMoment({
    tripId: moment.trip_id,
    dayDate: moment.day_date,
    title: newTitle,
    coverPhotoEntryId: null,
    createdBy: moment.created_by,
    memberIds: movers.map((m) => ({ kind: m.kind, id: m.id })),
  });
}

// ─── helpers ────────────────────────────────────────────────────────────

async function assignMomentToEntryInTx(
  db: SQLiteDatabase,
  momentId: string | null,
  kind: 'photo' | 'voice' | 'expense',
  entryId: string,
  ts: string,
): Promise<void> {
  const table = MEMBER_TABLES[kind];
  await db.runAsync(
    `UPDATE ${table} SET moment_id = ?, updated_at = ? WHERE id = ?;`,
    [momentId, ts, entryId],
  );
  await enqueueSync(db, table as never, entryId, 'update', {
    id: entryId,
    moment_id: momentId,
    updated_at: ts,
  });
}

async function maybeAutoDeleteEmptyMomentInTx(
  db: SQLiteDatabase,
  momentId: string,
  ts: string,
): Promise<void> {
  const counts = await db.getFirstAsync<{ n: number }>(
    `SELECT
       ( (SELECT COUNT(*) FROM journal_photo_entries WHERE moment_id = ? AND deleted_at IS NULL)
       + (SELECT COUNT(*) FROM voice_clips           WHERE moment_id = ? AND deleted_at IS NULL)
       + (SELECT COUNT(*) FROM expenses              WHERE moment_id = ? AND deleted_at IS NULL)
       ) AS n;`,
    [momentId, momentId, momentId],
  );
  if ((counts?.n ?? 0) > 0) return;

  await db.runAsync(
    `UPDATE journal_moments SET deleted_at = ?, updated_at = ? WHERE id = ?;`,
    [ts, ts, momentId],
  );
  await enqueueSync(db, 'journal_moments', momentId, 'update', {
    id: momentId,
    deleted_at: ts,
    updated_at: ts,
  });
}

async function listOrderedMembers(
  db: SQLiteDatabase,
  momentId: string,
): Promise<Array<{ kind: 'photo' | 'voice' | 'expense'; id: string; occurredAt: string }>> {
  const photos = await db.getAllAsync<{ id: string; occurred_at: string }>(
    `SELECT id, occurred_at FROM journal_photo_entries WHERE moment_id = ? AND deleted_at IS NULL;`,
    [momentId],
  );
  const voices = await db.getAllAsync<{ id: string; occurred_at: string }>(
    `SELECT id, occurred_at FROM voice_clips WHERE moment_id = ? AND deleted_at IS NULL;`,
    [momentId],
  );
  const expenses = await db.getAllAsync<{ id: string; expense_date: string; expense_time: string }>(
    `SELECT id, expense_date, expense_time FROM expenses WHERE moment_id = ? AND deleted_at IS NULL;`,
    [momentId],
  );
  const all: Array<{ kind: 'photo' | 'voice' | 'expense'; id: string; occurredAt: string }> = [
    ...photos.map((p) => ({ kind: 'photo' as const, id: p.id, occurredAt: p.occurred_at })),
    ...voices.map((v) => ({ kind: 'voice' as const, id: v.id, occurredAt: v.occurred_at })),
    ...expenses.map((e) => ({
      kind: 'expense' as const,
      id: e.id,
      occurredAt: `${e.expense_date}T${e.expense_time}Z`,
    })),
  ];
  all.sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0));
  return all;
}
