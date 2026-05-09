import type { TFunction } from 'i18next';

import { DEFAULT_CATEGORIES } from '@/constants/categories';
import type { Category } from '@/types/category';

const SLUG_BY_NAME: Record<string, string> = DEFAULT_CATEGORIES.reduce(
  (acc, def) => {
    acc[def.name.toLowerCase()] = def.slug;
    return acc;
  },
  {} as Record<string, string>,
);

// Default categories are seeded with English names baked into the DB row.
// We translate them at render time by mapping name → slug → i18n key,
// while user-created categories (tripId !== null) keep their literal name.
export function getCategoryDisplayName(
  category: Pick<Category, 'name' | 'tripId'>,
  t: TFunction,
): string {
  if (category.tripId === null) {
    const slug = SLUG_BY_NAME[category.name.toLowerCase()];
    if (slug) return t(`categories.defaultNames.${slug}`, { defaultValue: category.name });
  }
  return category.name;
}
