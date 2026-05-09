// Web build of the categories query module. The data is read directly from
// Supabase Postgres — no local SQLite, no sync queue. Default categories
// (trip_id IS NULL) are seeded server-side for everyone, so the web client
// just reads them; seedDefaultCategoriesIfNeeded() resolves to 0 here.

import { supabase } from '@/services/supabase';
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@/types/category';

import type { CategoryQueries } from './contract';

export type { CreateCategoryInput, UpdateCategoryInput };

interface RemoteCategoryRow {
  id: string;
  name: string;
  emoji: string;
  color: string;
  sort_order: number;
  trip_id: string | null;
  created_by: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

function rowToCategory(row: RemoteCategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    sortOrder: row.sort_order,
    tripId: row.trip_id,
    createdBy: row.created_by,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAllCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToCategory);
}

export async function listCategoriesForTrip(tripId: string): Promise<Category[]> {
  // Same shape as native: globals + trip-specific.
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .or(`trip_id.is.null,trip_id.eq.${tripId}`)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToCategory);
}

export async function getCategory(id: string): Promise<Category | null> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToCategory(data) : null;
}

async function nextSortOrder(tripId: string | null): Promise<number> {
  const query = supabase
    .from('categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);
  const { data, error } = tripId
    ? await query.eq('trip_id', tripId)
    : await query.is('trip_id', null);
  if (error) throw error;
  return (data?.[0]?.sort_order ?? -1) + 1;
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  const sortOrder = input.sortOrder ?? (await nextSortOrder(input.tripId));
  const { data, error } = await supabase
    .from('categories')
    .insert({
      name: input.name,
      emoji: input.emoji,
      color: input.color,
      sort_order: sortOrder,
      trip_id: input.tripId,
      created_by: input.createdBy,
      is_archived: false,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToCategory(data);
}

export async function updateCategory(input: UpdateCategoryInput): Promise<Category> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.emoji !== undefined) patch.emoji = input.emoji;
  if (input.color !== undefined) patch.color = input.color;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.isArchived !== undefined) patch.is_archived = input.isArchived;

  const { data, error } = await supabase
    .from('categories')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToCategory(data);
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  // Sequential updates — Supabase has no batch UPDATE WHERE id = ANY with
  // per-row values. The volume is tiny (a handful of categories), so the
  // round-trips are fine.
  for (let i = 0; i < orderedIds.length; i += 1) {
    const { error } = await supabase
      .from('categories')
      .update({ sort_order: i })
      .eq('id', orderedIds[i]);
    if (error) throw error;
  }
}

export async function deleteCategoryIfEmpty(id: string): Promise<boolean> {
  const { count, error: countError } = await supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)
    .is('deleted_at', null);
  if (countError) throw countError;
  if ((count ?? 0) > 0) return false;
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
  return true;
}

export async function seedDefaultCategoriesIfNeeded(): Promise<number> {
  // Defaults are seeded server-side for every user; nothing to do on web.
  return 0;
}

const _check: CategoryQueries = {
  listAllCategories,
  listCategoriesForTrip,
  getCategory,
  createCategory,
  updateCategory,
  reorderCategories,
  deleteCategoryIfEmpty,
  seedDefaultCategoriesIfNeeded,
};
void _check;
