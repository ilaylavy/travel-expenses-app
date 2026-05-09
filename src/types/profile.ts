// Single source of truth for the Profile entity.
export interface Profile {
  id: string;
  name: string;
  avatarUrl: string | null;
  defaultCurrency: string;
  createdAt: string;
  updatedAt: string;
}

// Raw SQLite row shape for the profiles table.
export interface ProfileRow {
  id: string;
  name: string;
  avatar_url: string | null;
  default_currency: string;
  created_at: string;
  updated_at: string;
}
