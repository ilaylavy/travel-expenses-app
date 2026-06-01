import { getDatabase } from '@/db/database';
import { newId } from '@/utils/id';
import type {
  DaySummary,
  JournalDay,
  JournalDayRow,
} from '@/types/journal';

import type { JournalDaysQueries } from './contract';
import { enqueueSync } from './syncQueue';

function rowToDay(r: JournalDayRow): JournalDay {
  return {
    id: r.id,
    tripId: r.trip_id,
    dayDate: r.day_date,
    location: r.location,
    coverPhotoEntryId: r.cover_photo_entry_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

export function dayToPayload(d: JournalDay): Record<string, unknown> {
  return {
    id: d.id,
    trip_id: d.tripId,
    day_date: d.dayDate,
    location: d.location,
    cover_photo_entry_id: d.coverPhotoEntryId,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
    deleted_at: d.deletedAt,
  };
}

export async function getDayMetadata(
  tripId: string,
  dayDateISO: string,
): Promise<JournalDay | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<JournalDayRow>(
    `SELECT * FROM journal_days
      WHERE trip_id = ? AND day_date = ? AND deleted_at IS NULL;`,
    [tripId, dayDateISO],
  );
  return row ? rowToDay(row) : null;
}

// Upsert: create the row if it's missing, otherwise update the location/cover.
async function upsertDay(
  tripId: string,
  dayDateISO: string,
  update: { location?: string | null; coverPhotoEntryId?: string | null },
): Promise<JournalDay> {
  const db = await getDatabase();
  const existing = await getDayMetadata(tripId, dayDateISO);
  const now = new Date().toISOString();
  if (existing) {
    const merged: JournalDay = {
      ...existing,
      location: update.location !== undefined ? update.location : existing.location,
      coverPhotoEntryId:
        update.coverPhotoEntryId !== undefined
          ? update.coverPhotoEntryId
          : existing.coverPhotoEntryId,
      updatedAt: now,
    };
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE journal_days
           SET location = ?, cover_photo_entry_id = ?, updated_at = ?
         WHERE id = ?;`,
        [merged.location, merged.coverPhotoEntryId, merged.updatedAt, merged.id],
      );
      await enqueueSync(db, 'journal_days', merged.id, 'update', dayToPayload(merged));
    });
    return merged;
  }
  const created: JournalDay = {
    id: newId(),
    tripId,
    dayDate: dayDateISO,
    location: update.location ?? null,
    coverPhotoEntryId: update.coverPhotoEntryId ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO journal_days
         (id, trip_id, day_date, location, cover_photo_entry_id,
          created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL);`,
      [
        created.id, created.tripId, created.dayDate, created.location,
        created.coverPhotoEntryId, created.createdAt, created.updatedAt,
      ],
    );
    await enqueueSync(db, 'journal_days', created.id, 'create', dayToPayload(created));
  });
  return created;
}

export async function setLocation(
  tripId: string,
  dayDateISO: string,
  location: string | null,
): Promise<JournalDay> {
  return upsertDay(tripId, dayDateISO, { location });
}

export async function setCoverPhotoEntry(
  tripId: string,
  dayDateISO: string,
  entryId: string | null,
): Promise<JournalDay> {
  return upsertDay(tripId, dayDateISO, { coverPhotoEntryId: entryId });
}

// Build the chapter-view aggregate. One SQL roundtrip via a recursive CTE that
// generates one row per trip date, with per-day count/total/cover/location
// subqueries.
//
//  - days_in_trip: every date between trips.start_date and the trip end
//    (today if ongoing, else end_date, capped at start + 365 days).
//  - per_day counts come from filtered subqueries (photos / voice / expenses).
//  - hero photo path: cover override if set, else first photo of the day.
//  - effective location: journal_days.location override if set, else most-
//    frequent expense place_name (tie-broken by alphabetical to keep stable).
export async function listDaySummaries(tripId: string): Promise<DaySummary[]> {
  const db = await getDatabase();
  const trip = await db.getFirstAsync<{ start_date: string; end_date: string | null }>(
    'SELECT start_date, end_date FROM trips WHERE id = ?;',
    [tripId],
  );
  if (!trip) return [];

  const rows = await db.getAllAsync<{
    day_date: string;
    photo_count: number;
    voice_count: number;
    expense_count: number;
    total_converted_amount: number;
    cover_storage_path: string | null;
    override_location: string | null;
    inferred_location: string | null;
  }>(
    `
    WITH RECURSIVE
      params(start_date, end_date) AS (
        SELECT
          ?,
          COALESCE(?, date('now', 'localtime'))
      ),
      days(day_date) AS (
        SELECT start_date FROM params
        UNION ALL
        SELECT date(day_date, '+1 day') FROM days
         WHERE day_date < (SELECT end_date FROM params)
           AND day_date < date((SELECT start_date FROM params), '+365 day')
      )
    SELECT
      d.day_date,
      (SELECT COUNT(*) FROM journal_photo_entries e
         WHERE e.trip_id = ? AND e.deleted_at IS NULL
           AND SUBSTR(e.occurred_at, 1, 10) = d.day_date) AS photo_count,
      (SELECT COUNT(*) FROM voice_clips v
         WHERE v.trip_id = ? AND v.deleted_at IS NULL
           AND SUBSTR(v.occurred_at, 1, 10) = d.day_date) AS voice_count,
      (SELECT COUNT(*) FROM expenses x
         WHERE x.trip_id = ? AND x.deleted_at IS NULL
           AND d.day_date BETWEEN COALESCE(x.spread_start_date, x.expense_date)
                              AND COALESCE(x.spread_end_date, x.expense_date)) AS expense_count,
      -- Spread expenses (Lesson #8): pro-rate the amount across every day
      -- in the spread range. A €400/4-day hotel contributes €100 per day.
      -- Non-spread rows divide by 1 (the COALESCE collapses to expense_date).
      (SELECT COALESCE(SUM(
          x.converted_amount * 1.0 / (
            CAST(julianday(COALESCE(x.spread_end_date, x.expense_date))
               - julianday(COALESCE(x.spread_start_date, x.expense_date)) AS INTEGER) + 1
          )
        ), 0) FROM expenses x
         WHERE x.trip_id = ? AND x.deleted_at IS NULL
           AND d.day_date BETWEEN COALESCE(x.spread_start_date, x.expense_date)
                              AND COALESCE(x.spread_end_date, x.expense_date)
           AND x.is_excluded_from_daily_metrics = 0) AS total_converted_amount,
      COALESCE(
        (SELECT jp.storage_path
           FROM journal_days jd
           JOIN journal_photo_entries cov ON cov.id = jd.cover_photo_entry_id
           JOIN journal_photos jp ON jp.entry_id = cov.id
          WHERE jd.trip_id = ? AND jd.day_date = d.day_date AND jd.deleted_at IS NULL
          ORDER BY jp.sort_order ASC
          LIMIT 1),
        (SELECT jp.storage_path
           FROM journal_photo_entries e
           JOIN journal_photos jp ON jp.entry_id = e.id
          WHERE e.trip_id = ? AND e.deleted_at IS NULL
            AND SUBSTR(e.occurred_at, 1, 10) = d.day_date
          ORDER BY e.occurred_at ASC, jp.sort_order ASC
          LIMIT 1)
      ) AS cover_storage_path,
      (SELECT jd.location FROM journal_days jd
         WHERE jd.trip_id = ? AND jd.day_date = d.day_date AND jd.deleted_at IS NULL) AS override_location,
      (SELECT x.place_name FROM expenses x
         WHERE x.trip_id = ? AND x.deleted_at IS NULL
           AND d.day_date BETWEEN COALESCE(x.spread_start_date, x.expense_date)
                              AND COALESCE(x.spread_end_date, x.expense_date)
           AND x.place_name IS NOT NULL
         GROUP BY x.place_name
         ORDER BY COUNT(*) DESC, x.place_name ASC
         LIMIT 1) AS inferred_location
    FROM days d
    ORDER BY d.day_date ASC;
    `,
    [
      trip.start_date,
      trip.end_date,
      tripId,   // photo_count
      tripId,   // voice_count
      tripId,   // expense_count
      tripId,   // total
      tripId,   // cover override
      tripId,   // cover fallback
      tripId,   // override_location
      tripId,   // inferred_location
    ],
  );

  const startDate = trip.start_date;
  return rows.map((r) => {
    const dayIndex =
      Math.floor((Date.parse(r.day_date) - Date.parse(startDate)) / 86_400_000) + 1;
    return {
      dayDate: r.day_date,
      dayIndex: Math.max(1, dayIndex),
      photoCount: r.photo_count,
      voiceCount: r.voice_count,
      expenseCount: r.expense_count,
      totalConvertedAmount: r.total_converted_amount,
      coverStoragePath: r.cover_storage_path,
      effectiveLocation: r.override_location ?? r.inferred_location,
      momentTitles: [],
      momentCount: 0,
    };
  });
}

const _check: JournalDaysQueries = {
  getDayMetadata,
  setLocation,
  setCoverPhotoEntry,
  listDaySummaries,
};
void _check;
