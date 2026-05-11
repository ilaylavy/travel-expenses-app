import type { SQLiteDatabase } from 'expo-sqlite';

import {
  V1_STATEMENTS,
  V3_STATEMENTS,
  V4_STATEMENTS,
  V5_STATEMENTS,
  V6_STATEMENTS,
  V7_STATEMENTS,
} from './schema';

// Migrations are append-only. Once a version has shipped, do NOT edit its SQL
// or the baseline DDL it depends on (the Vn_STATEMENTS in schema.ts) — every
// device that already ran it would diverge from new installs. To change the
// schema, add a new migration with the next version number. Version numbers
// are also append-only: a retired version (see v2 below) stays retired so its
// number is never reused.

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
  // v2 (rename_is_excluded_from_metrics) was retired: the v1 baseline was
  // edited to use the post-rename column name, leaving v2 with nothing to
  // rename on fresh installs. Number reserved, do not reuse.
  {
    version: 3,
    name: 'add_is_private_to_expenses',
    run: async (db) => {
      for (const stmt of V3_STATEMENTS) {
        await db.execAsync(stmt);
      }
    },
  },
  {
    version: 4,
    name: 'add_expense_splits_and_is_split',
    run: async (db) => {
      for (const stmt of V4_STATEMENTS) {
        await db.execAsync(stmt);
      }
    },
  },
  {
    version: 5,
    name: 'per_user_trip_budgets',
    run: async (db) => {
      for (const stmt of V5_STATEMENTS) {
        await db.execAsync(stmt);
      }
    },
  },
  {
    version: 6,
    name: 'settlement_payments',
    run: async (db) => {
      for (const stmt of V6_STATEMENTS) {
        await db.execAsync(stmt);
      }
    },
  },
  {
    version: 7,
    name: 'settlement_per_expense_attribution',
    run: async (db) => {
      for (const stmt of V7_STATEMENTS) {
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
