// Local SQLite schema.
// Mirrors the remote Postgres schema, adapted to SQLite types:
//   - UUIDs       -> TEXT
//   - timestamps  -> TEXT (ISO-8601 with timezone)
//   - decimals    -> REAL
//   - booleans    -> INTEGER (0/1)
//   - dates       -> TEXT (YYYY-MM-DD)
//
// Plus two local-only tables: sync_queue and sync_metadata.

export const V1_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar_url TEXT,
    default_currency TEXT NOT NULL DEFAULT 'USD',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '✈️',
    start_date TEXT NOT NULL,
    end_date TEXT,
    base_currency TEXT NOT NULL,
    home_currency TEXT NOT NULL,
    budget REAL,
    owner_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS trip_members (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    invited_at TEXT NOT NULL,
    joined_at TEXT,
    UNIQUE (trip_id, user_id)
  );`,

  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE,
    created_by TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    converted_amount REAL NOT NULL,
    exchange_rate REAL NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id),
    note TEXT,
    payment_method TEXT,
    latitude REAL,
    longitude REAL,
    place_name TEXT,
    expense_date TEXT NOT NULL,
    expense_time TEXT NOT NULL,
    is_refund INTEGER NOT NULL DEFAULT 0,
    is_excluded_from_metrics INTEGER NOT NULL DEFAULT 0,
    spread_start_date TEXT,
    spread_end_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS expense_photos (
    id TEXT PRIMARY KEY,
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    local_uri TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS exchange_rates (
    id TEXT PRIMARY KEY,
    base_currency TEXT NOT NULL,
    target_currency TEXT NOT NULL,
    rate REAL NOT NULL,
    fetched_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (base_currency, target_currency, fetched_date)
  );`,

  // --- Local-only tables ---

  `CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    synced_at TEXT,
    error TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS sync_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,

  // --- Indexes ---

  'CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON expenses(trip_id);',
  'CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);',
  'CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);',
  'CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);',
  'CREATE INDEX IF NOT EXISTS idx_trip_members_trip_id ON trip_members(trip_id);',
  'CREATE INDEX IF NOT EXISTS idx_trip_members_user_id ON trip_members(user_id);',
  'CREATE INDEX IF NOT EXISTS idx_categories_trip_id ON categories(trip_id);',
  'CREATE INDEX IF NOT EXISTS idx_expense_photos_expense_id ON expense_photos(expense_id);',
  'CREATE INDEX IF NOT EXISTS idx_sync_queue_unsynced ON sync_queue(synced_at) WHERE synced_at IS NULL;',
] as const;

export const ALL_TABLES = [
  'profiles',
  'trips',
  'trip_members',
  'categories',
  'expenses',
  'expense_photos',
  'exchange_rates',
  'sync_queue',
  'sync_metadata',
] as const;
