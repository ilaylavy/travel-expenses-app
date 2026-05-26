import type { ThemeColors } from '@/constants/theme';

// 8-color palette from the design system's category tints, ordered so the
// accent leads and adjacent rows in the list rotate cleanly through hues.
// Trip monograms hash their tripId into this array so each trip gets a
// stable tint that survives re-renders, language switches, and theme flips.
const TINT_KEYS = [
  'accent',
  'blue',
  'pink',
  'orange',
  'green',
  'coral',
  'teal',
  'yellow',
] as const;

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Returns a stable tint hex for a given trip id. Resolves at call time
// against the live theme so dark and light each pull from their own palette
// without the caller doing the dance.
export function getTripTint(tripId: string, theme: ThemeColors): string {
  if (!tripId) return theme.accent;
  const key = TINT_KEYS[hashCode(tripId) % TINT_KEYS.length];
  return theme[key];
}
