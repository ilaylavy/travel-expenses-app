import type { CategoryColorToken } from '@/utils/categoryColor';

export interface DefaultCategory {
  slug: string;
  name: string;
  emoji: string;
  color: CategoryColorToken;
  sortOrder: number;
}

// Color values are semantic theme tokens — resolved at render time via
// getCategoryColor(). See DESIGN_SYSTEM.md §3 for the mapping.
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { slug: 'food', name: 'Food', emoji: '🍽️', color: 'orange', sortOrder: 0 },
  { slug: 'transport', name: 'Transport', emoji: '🚗', color: 'blue', sortOrder: 1 },
  { slug: 'hotel', name: 'Hotel', emoji: '🏨', color: 'accent', sortOrder: 2 },
  { slug: 'flight', name: 'Flight', emoji: '✈️', color: 'pink', sortOrder: 3 },
  { slug: 'coffee', name: 'Coffee', emoji: '☕', color: 'yellow', sortOrder: 4 },
  { slug: 'shopping', name: 'Shopping', emoji: '🛍️', color: 'green', sortOrder: 5 },
  { slug: 'activities', name: 'Activities', emoji: '🎫', color: 'coral', sortOrder: 6 },
  { slug: 'other', name: 'Other', emoji: '📦', color: 'teal', sortOrder: 7 },
] as const;
