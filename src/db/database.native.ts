import * as SQLite from 'expo-sqlite';

import { runMigrations } from './migrations';

const DB_NAME = 'travel-expenses.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await runMigrations(db);
  return db;
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = open().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function closeDatabase(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.closeAsync();
  dbPromise = null;
}

// For tests / sign-out cleanup only. Deletes the underlying SQLite file.
export async function deleteDatabase(): Promise<void> {
  await closeDatabase();
  await SQLite.deleteDatabaseAsync(DB_NAME);
}

export { DB_NAME };
