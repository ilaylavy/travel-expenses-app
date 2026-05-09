// Web build of the profiles query module. Reads/writes go directly to
// Supabase. The handle_new_user trigger seeds a row on signup for every
// auth.users insert, so the web client never needs to create a profile.

import { supabase } from '@/services/supabase';
import type { Profile, UpdateProfileInput } from '@/types/profile';

import type { ProfileQueries } from './contract';

export type { UpdateProfileInput };

interface RemoteProfileRow {
  id: string;
  name: string;
  avatar_url: string | null;
  default_currency: string;
  created_at: string;
  updated_at: string;
}

function rowToProfile(row: RemoteProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatar_url,
    defaultCurrency: row.default_currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProfileName(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.name ?? null;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToProfile(data as RemoteProfileRow) : null;
}

export async function updateProfile(input: UpdateProfileInput): Promise<Profile> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.defaultCurrency !== undefined) patch.default_currency = input.defaultCurrency;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', input.userId)
    .select('*')
    .single();
  if (error) throw error;
  return rowToProfile(data as RemoteProfileRow);
}

const _check: ProfileQueries = {
  getProfileName,
  getProfile,
  updateProfile,
};
void _check;
