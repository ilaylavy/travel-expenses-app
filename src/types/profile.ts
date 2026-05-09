// Single source of truth for the Profile entity.
// During the ongoing reorganization, the canonical declaration still lives in
// db/queries/profiles.ts so existing importers keep working; this module
// re-exports it as the long-term home (Phase 5c flips the direction).
export { type Profile } from '@/db/queries/profiles';
