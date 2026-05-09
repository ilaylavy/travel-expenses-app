// Web build of the expense-analytics module. Native uses a SQL window
// function for the recent-notes dedup; PostgREST doesn't expose window
// functions directly, so we hydrate a small candidate set and dedup in JS.
// The trip-scoped query is small (a few hundred rows worst case) so this
// stays cheap.

import { supabase } from '@/services/supabase';
import type { RecentNoteSuggestion } from '@/types/expense';

import type { ExpenseAnalyticsQueries } from './contract';

export type { RecentNoteSuggestion };

interface RecentNoteJoinRow {
  note: string | null;
  category_id: string;
  expense_date: string;
  expense_time: string;
  created_at: string;
  is_private: boolean;
  user_id: string;
  categories: { emoji: string } | null;
}

export async function getRecentNotes(
  tripId: string,
  currentUserId: string,
  limit = 10,
): Promise<RecentNoteSuggestion[]> {
  // Pull a generous slice of recent expenses with notes and the category
  // emoji embedded. We over-fetch by 5x so the JS dedup has room to work
  // (each note keeps the most-recent occurrence).
  const { data, error } = await supabase
    .from('expenses')
    .select('note, category_id, expense_date, expense_time, created_at, is_private, user_id, categories!inner(emoji)')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .not('note', 'is', null)
    .neq('note', '')
    .order('expense_date', { ascending: false })
    .order('expense_time', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit * 5);
  if (error) throw error;

  const seen = new Set<string>();
  const out: RecentNoteSuggestion[] = [];
  for (const row of (data ?? []) as unknown as RecentNoteJoinRow[]) {
    const note = row.note?.trim();
    if (!note) continue;
    if (row.is_private && row.user_id !== currentUserId) continue;
    const lower = note.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push({
      note,
      categoryId: row.category_id,
      categoryEmoji: row.categories?.emoji ?? '📦',
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function lastUsedPaymentMethodForTrip(
  tripId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select('payment_method')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .not('payment_method', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.payment_method ?? null;
}

export async function categoryUsageForTrip(
  tripId: string,
): Promise<Map<string, { count: number; lastUsed: string }>> {
  // PostgREST doesn't expose GROUP BY in the standard select. Fall back to a
  // flat scan and aggregate in JS — the trip's expense set is small enough
  // that this is fine.
  const { data, error } = await supabase
    .from('expenses')
    .select('category_id, created_at')
    .eq('trip_id', tripId)
    .is('deleted_at', null);
  if (error) throw error;
  const map = new Map<string, { count: number; lastUsed: string }>();
  for (const row of (data ?? []) as { category_id: string; created_at: string }[]) {
    const existing = map.get(row.category_id);
    if (!existing) {
      map.set(row.category_id, { count: 1, lastUsed: row.created_at });
    } else {
      existing.count += 1;
      if (row.created_at > existing.lastUsed) existing.lastUsed = row.created_at;
    }
  }
  return map;
}

const _check: ExpenseAnalyticsQueries = {
  getRecentNotes,
  lastUsedPaymentMethodForTrip,
  categoryUsageForTrip,
};
void _check;
