// Web build of the settlements query module. No SQLite cache; reads/writes go
// directly to Supabase. Mirrors the public surface of settlements.native.ts so
// callers can stay platform-agnostic.

import { supabase } from '@/services/supabase';
import type {
  CreateSettlementInput,
  SettlementPayment,
} from '@/types/settlement';

import type { SettlementsQueries } from './contract';

interface RemoteSettlementRow {
  id: string;
  trip_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number | string;
  currency: string;
  exchange_rate: number | string;
  converted_amount: number | string;
  settled_date: string;
  note: string | null;
  expense_split_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function asNumber(v: number | string): number {
  return typeof v === 'number' ? v : Number(v);
}

function rowToSettlement(row: RemoteSettlementRow): SettlementPayment {
  return {
    id: row.id,
    tripId: row.trip_id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    amount: asNumber(row.amount),
    currency: row.currency,
    exchangeRate: asNumber(row.exchange_rate),
    convertedAmount: asNumber(row.converted_amount),
    settledDate: row.settled_date,
    note: row.note,
    expenseSplitId: row.expense_split_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function listSettlementsForTrip(
  tripId: string,
): Promise<SettlementPayment[]> {
  const { data, error } = await supabase
    .from('settlement_payments')
    .select('*')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .order('settled_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RemoteSettlementRow[]).map(rowToSettlement);
}

export async function listSettlementsForPair(
  tripId: string,
  userA: string,
  userB: string,
): Promise<SettlementPayment[]> {
  const { data, error } = await supabase
    .from('settlement_payments')
    .select('*')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .or(
      `and(from_user_id.eq.${userA},to_user_id.eq.${userB}),` +
        `and(from_user_id.eq.${userB},to_user_id.eq.${userA})`,
    )
    .order('settled_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RemoteSettlementRow[]).map(rowToSettlement);
}

export async function createSettlement(
  input: CreateSettlementInput,
): Promise<SettlementPayment> {
  const { data, error } = await supabase
    .from('settlement_payments')
    .insert({
      trip_id: input.tripId,
      from_user_id: input.fromUserId,
      to_user_id: input.toUserId,
      amount: input.amount,
      currency: input.currency,
      exchange_rate: input.exchangeRate,
      converted_amount: input.convertedAmount,
      settled_date: input.settledDate,
      note: input.note ?? null,
      expense_split_id: input.expenseSplitId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToSettlement(data as RemoteSettlementRow);
}

export async function deleteSettlement(id: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('settlement_payments')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw error;
}

const _check: SettlementsQueries = {
  listSettlementsForTrip,
  listSettlementsForPair,
  createSettlement,
  deleteSettlement,
};
void _check;
