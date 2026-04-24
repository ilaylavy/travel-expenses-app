import type { SQLiteDatabase } from 'expo-sqlite';

import { V1_STATEMENTS, V3_STATEMENTS } from './schema';

export interface Migration {
  version: number;
  name: string;
  run: (db: SQLiteDatabase) => Promise<void>;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    run: async (db) => {
      for (const stmt of V1_STATEMENTS) {
        await db.execAsync(stmt);
      }
    },
  },
  {
    version: 2,
    name: 'rename_is_excluded_from_metrics',
    run: async (db) => {
      await db.execAsync(
        'ALTER TABLE expenses RENAME COLUMN is_excluded_from_metrics TO is_excluded_from_daily_metrics;',
      );
    },
  },
  {
    version: 3,
    name: 'add_is_private_to_expenses',
    run: async (db) => {
      for (const stmt of V3_STATEMENTS) {
        await db.execAsync(stmt);
      }
    },
  },
] as const;

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

async function getCurrentVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  return row?.user_version ?? 0;
}

async function setVersion(db: SQLiteDatabase, version: number): Promise<void> {
  // PRAGMA doesn't support parameter binding — version is an integer we control.
  await db.execAsync(`PRAGMA user_version = ${version};`);
}

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const current = await getCurrentVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > current);
  if (pending.length === 0) return;

  for (const migration of pending) {
    try {
      await db.execAsync('BEGIN TRANSACTION;');
      await migration.run(db);
      await setVersion(db, migration.version);
      await db.execAsync('COMMIT;');
    } catch (err) {
      await db.execAsync('ROLLBACK;').catch(() => {});
      throw new Error(
        `Migration v${migration.version} (${migration.name}) failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
