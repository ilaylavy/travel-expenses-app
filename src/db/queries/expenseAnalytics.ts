import { getDatabase } from '@/db/database';

export interface RecentNoteSuggestion {
  note: string;
  categoryId: string;
  categoryEmoji: string;
}

// Distinct note strings used most recently in this trip, paired with the
// category they were last logged under. Powers the suggestion chips on the
// entry screen, including auto-selecting the category when tapped. Notes
// from other members' private expenses are excluded.
export async function getRecentNotes(
  tripId: string,
  currentUserId: string,
  limit = 10,
): Promise<RecentNoteSuggestion[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    note: string;
    category_id: string;
    emoji: string;
  }>(
    `SELECT e.note AS note, e.category_id AS category_id, c.emoji AS emoji
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.id IN (
         SELECT id FROM (
           SELECT id,
                  ROW_NUMBER() OVER (
                    PARTITION BY LOWER(note)
                    ORDER BY expense_date DESC, expense_time DESC, created_at DESC
                  ) AS rn
             FROM expenses
             WHERE trip_id = ?
               AND deleted_at IS NULL
               AND note IS NOT NULL
               AND TRIM(note) <> ''
               AND (is_private = 0 OR user_id = ?)
         ) WHERE rn = 1
       )
       ORDER BY e.expense_date DESC, e.expense_time DESC, e.created_at DESC
       LIMIT ?;`,
    [tripId, currentUserId, limit],
  );
  return rows.map((r) => ({
    note: r.note,
    categoryId: r.category_id,
    categoryEmoji: r.emoji,
  }));
}

// Most recently used payment method — used to pre-select the selector.
export async function lastUsedPaymentMethodForTrip(
  tripId: string,
): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payment_method: string | null }>(
    `SELECT payment_method FROM expenses
       WHERE trip_id = ? AND deleted_at IS NULL AND payment_method IS NOT NULL
       ORDER BY created_at DESC LIMIT 1;`,
    [tripId],
  );
  return row?.payment_method ?? null;
}

// Counts how often each category has been used in this trip, so the entry
// screen can show recently/frequently used categories first.
export async function categoryUsageForTrip(
  tripId: string,
): Promise<Map<string, { count: number; lastUsed: string }>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    category_id: string;
    uses: number;
    last_used: string;
  }>(
    `SELECT category_id, COUNT(*) AS uses, MAX(created_at) AS last_used
       FROM expenses
       WHERE trip_id = ? AND deleted_at IS NULL
       GROUP BY category_id;`,
    [tripId],
  );
  const map = new Map<string, { count: number; lastUsed: string }>();
  for (const row of rows) {
    map.set(row.category_id, { count: row.uses, lastUsed: row.last_used });
  }
  return map;
}
