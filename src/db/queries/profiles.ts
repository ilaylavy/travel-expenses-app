import { getDatabase } from '@/db/database';
import type { Profile, ProfileRow } from '@/types/profile';

import { enqueueSync } from './syncQueue';

function rowToProfile(row: ProfileRow): Profile {
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
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ name: string }>(
    'SELECT name FROM profiles WHERE id = ?;',
    [userId],
  );
  return row?.name ?? null;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ProfileRow>(
    'SELECT * FROM profiles WHERE id = ?;',
    [userId],
  );
  return row ? rowToProfile(row) : null;
}

export interface UpdateProfileInput {
  userId: string;
  name?: string;
  defaultCurrency?: string;
  avatarUrl?: string | null;
}

export async function updateProfile(input: UpdateProfileInput): Promise<Profile> {
  const db = await getDatabase();
  const existing = await getProfile(input.userId);
  if (!existing) throw new Error('Profile not found');

  const next: Profile = {
    ...existing,
    name: input.name ?? existing.name,
    defaultCurrency: input.defaultCurrency ?? existing.defaultCurrency,
    avatarUrl: input.avatarUrl === undefined ? existing.avatarUrl : input.avatarUrl,
    updatedAt: new Date().toISOString(),
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE profiles
          SET name = ?, avatar_url = ?, default_currency = ?, updated_at = ?
        WHERE id = ?;`,
      [next.name, next.avatarUrl, next.defaultCurrency, next.updatedAt, next.id],
    );
    await enqueueSync(db, 'profiles', next.id, 'update', {
      id: next.id,
      name: next.name,
      avatar_url: next.avatarUrl,
      default_currency: next.defaultCurrency,
      created_at: next.createdAt,
      updated_at: next.updatedAt,
    });
  });

  return next;
}
