import { colors } from './theme';

export interface DefaultCategory {
  slug: string;
  name: string;
  emoji: string;
  color: string;
  sortOrder: number;
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { slug: 'food', name: 'Food', emoji: '🍽️', color: colors.warning, sortOrder: 0 },
  { slug: 'transport', name: 'Transport', emoji: '🚗', color: colors.info, sortOrder: 1 },
  { slug: 'hotel', name: 'Hotel', emoji: '🏨', color: colors.accent, sortOrder: 2 },
  { slug: 'flight', name: 'Flight', emoji: '✈️', color: colors.accentLight, sortOrder: 3 },
  { slug: 'coffee', name: 'Coffee', emoji: '☕', color: '#C08B5C', sortOrder: 4 },
  { slug: 'shopping', name: 'Shopping', emoji: '🛍️', color: '#FF8ED4', sortOrder: 5 },
  { slug: 'activities', name: 'Activities', emoji: '🎫', color: colors.success, sortOrder: 6 },
  { slug: 'other', name: 'Other', emoji: '📦', color: colors.textMuted, sortOrder: 7 },
] as const;
