// Web build of the local DB module. The web app is online-only — every read
// and write hits Supabase directly, so there is no SQLite database. These
// stubs exist so platform-fork mistakes fail loudly (getDatabase) or
// silently (closeDatabase, deleteDatabase) instead of importing expo-sqlite
// in the browser.

const ERROR_MESSAGE =
  'Database is unavailable on web. A query module probably forgot to add a .web.ts variant.';

export function getDatabase(): Promise<never> {
  return Promise.reject(new Error(ERROR_MESSAGE));
}

export async function closeDatabase(): Promise<void> {
  // No-op: nothing to close on web.
}

export async function deleteDatabase(): Promise<void> {
  // No-op: nothing to delete on web.
}

export const DB_NAME = 'travel-expenses.db';
