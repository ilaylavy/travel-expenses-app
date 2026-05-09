import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { getDatabase } from '@/db/database';
import type { Category, CategoryRow } from '@/types/category';
import { newId } from '@/utils/id';

import { enqueueSync } from './syncQueue';

export interface CreateCategoryInput {
  name: string;
  emoji: string;
  color: string;
  tripId: string | null;
  createdBy: string | null;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  id: string;
  name?: string;
  emoji?: string;
  color?: string;
  sortOrder?: number;
  isArchived?: boolean;
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    sortOrder: row.sort_order,
    tripId: row.trip_id,
    createdBy: row.created_by,
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function categoryToPayload(category: Category): Record<string, unknown> {
  return {
    id: category.id,
    name: category.name,
    emoji: category.emoji,
    color: category.color,
    sort_order: category.sortOrder,
    trip_id: category.tripId,
    created_by: category.createdBy,
    is_archived: category.isArchived ? 1 : 0,
    created_at: category.createdAt,
    updated_at: category.updatedAt,
  };
}

export async function listAllCategories(): Promise<Category[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<CategoryRow>(
    'SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC;',
  );
  return rows.map(rowToCategory);
}

// Effective categories for a trip: all global defaults + any trip-specific ones.
// Archived rows are included — callers filter as needed.
export async function listCategoriesForTrip(tripId: string): Promise<Category[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<CategoryRow>(
    'SELECT * FROM categories WHERE trip_id IS NULL OR trip_id = ? ORDER BY sort_order ASC, created_at ASC;',
    [tripId],
  );
  return rows.map(rowToCategory);
}

export async function getCategory(id: string): Promise<Category | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<CategoryRow>(
    'SELECT * FROM categories WHERE id = ?;',
    [id],
  );
  return row ? rowToCategory(row) : null;
}

async function nextSortOrder(db: SQLiteDatabase, tripId: string | null): Promise<number> {
  const row = await db.getFirstAsync<{ max_order: number | null }>(
    tripId
      ? 'SELECT MAX(sort_order) AS max_order FROM categories WHERE trip_id = ?;'
      : 'SELECT MAX(sort_order) AS max_order FROM categories WHERE trip_id IS NULL;',
    tripId ? [tripId] : [],
  );
  return (row?.max_order ?? -1) + 1;
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const sortOrder = input.sortOrder ?? (await nextSortOrder(db, input.tripId));
  const category: Category = {
    id: newId(),
    name: input.name,
    emoji: input.emoji,
    color: input.color,
    sortOrder,
    tripId: input.tripId,
    createdBy: input.createdBy,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.withTransactionAsync(async () => {
    await insertCategory(db, category);
    await enqueueSync(db, 'categories', category.id, 'create', categoryToPayload(category));
  });

  return category;
}

export async function updateCategory(input: UpdateCategoryInput): Promise<Category> {
  const db = await getDatabase();
  const existing = await getCategory(input.id);
  if (!existing) throw new Error('Category not found');

  const next: Category = {
    ...existing,
    name: input.name ?? existing.name,
    emoji: input.emoji ?? existing.emoji,
    color: input.color ?? existing.color,
    sortOrder: input.sortOrder ?? existing.sortOrder,
    isArchived: input.isArchived ?? existing.isArchived,
    updatedAt: new Date().toISOString(),
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE categories
         SET name = ?, emoji = ?, color = ?, sort_order = ?, is_archived = ?, updated_at = ?
       WHERE id = ?;`,
      [
        next.name,
        next.emoji,
        next.color,
        next.sortOrder,
        next.isArchived ? 1 : 0,
        next.updatedAt,
        next.id,
      ],
    );
    await enqueueSync(db, 'categories', next.id, 'update', categoryToPayload(next));
  });

  return next;
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i += 1) {
      const id = orderedIds[i];
      await db.runAsync(
        'UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?;',
        [i, now, id],
      );
      const existing = await db.getFirstAsync<CategoryRow>(
        'SELECT * FROM categories WHERE id = ?;',
        [id],
      );
      if (existing) {
        await enqueueSync(
          db,
          'categories',
          id,
          'update',
          categoryToPayload(rowToCategory(existing)),
        );
      }
    }
  });
}

// Hard-delete only permitted when no expenses reference this category.
// Archive (update isArchived=true) should be used otherwise.
export async function deleteCategoryIfEmpty(id: string): Promise<boolean> {
  const db = await getDatabase();
  const count = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM expenses WHERE category_id = ? AND deleted_at IS NULL;',
    [id],
  );
  if ((count?.n ?? 0) > 0) return false;

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM categories WHERE id = ?;', [id]);
    await enqueueSync(db, 'categories', id, 'delete', { id });
  });
  return true;
}

export async function seedDefaultCategoriesIfNeeded(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM categories WHERE trip_id IS NULL;',
  );
  if ((row?.n ?? 0) > 0) return 0;

  const now = new Date().toISOString();
  const seeded: Category[] = DEFAULT_CATEGORIES.map((def) => ({
    id: newId(),
    name: def.name,
    emoji: def.emoji,
    color: def.color,
    sortOrder: def.sortOrder,
    tripId: null,
    createdBy: null,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  }));

  // Global defaults (trip_id = null) are server-managed and are NOT enqueued.
  // They get reconciled against remote canonical rows via reconcileDefaults.
  await db.withTransactionAsync(async () => {
    for (const category of seeded) {
      await insertCategory(db, category);
    }
  });

  return seeded.length;
}

async function insertCategory(db: SQLiteDatabase, category: Category): Promise<void> {
  await db.runAsync(
    `INSERT INTO categories
       (id, name, emoji, color, sort_order, trip_id, created_by, is_archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      category.id,
      category.name,
      category.emoji,
      category.color,
      category.sortOrder,
      category.tripId,
      category.createdBy,
      category.isArchived ? 1 : 0,
      category.createdAt,
      category.updatedAt,
    ],
  );
}
