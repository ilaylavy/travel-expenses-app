import { getDatabase } from '@/db/database';

interface ProfileRow {
  id: string;
  name: string;
}

export async function getProfileName(userId: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ProfileRow>(
    'SELECT id, name FROM profiles WHERE id = ?;',
    [userId],
  );
  return row?.name ?? null;
}
