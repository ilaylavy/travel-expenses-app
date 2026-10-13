import { getDatabase } from './src/db/database';
import { deleteSplits, createSplits } from './src/db/queries/expenseSplits.native';

async function run() {
  const db = await getDatabase();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS expense_splits (
      id TEXT PRIMARY KEY,
      expense_id TEXT,
      user_id TEXT,
      amount REAL,
      is_payer INTEGER,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS settlement_payments (
      id TEXT PRIMARY KEY,
      expense_split_id TEXT,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT,
      record_id TEXT,
      action TEXT,
      payload TEXT,
      created_at TEXT
    );
  `);

  const expenseId = 'test-expense';

  // Create 100 splits
  const splits = [];
  for (let i = 0; i < 100; i++) {
    splits.push({
      userId: `user-${i}`,
      amount: 10,
      isPayer: false
    });
  }

  await createSplits(expenseId, splits);

  const start = performance.now();
  await deleteSplits(expenseId);
  const end = performance.now();

  console.log(`Time taken: ${end - start} ms`);
}

run().catch(console.error);
