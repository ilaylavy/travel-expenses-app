// Single source of truth for the Profile entity.
// During the ongoing reorganization, the canonical Profile declaration still
// lives in db/queries/profiles.ts so existing importers keep working; this
// module re-exports it as the long-term home (Phase 5c flips the direction).
export { type Profile } from '@/db/queries/profiles';

// Raw SQLite row shape for the profiles table.
export interface ProfileRow {
  id: string;
  name: string;
  avatar_url: string | null;
  default_currency: string;
  created_at: string;
  updated_at: string;
}
