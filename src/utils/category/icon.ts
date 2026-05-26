import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { DEFAULT_CATEGORY_ICONS, type IconName } from '@/components/Icon';
import type { Category } from '@/types/category';

const SLUG_BY_NAME: Record<string, string> = DEFAULT_CATEGORIES.reduce(
  (acc, def) => {
    acc[def.name.toLowerCase()] = def.slug;
    return acc;
  },
  {} as Record<string, string>,
);

// Resolves the icon name (from the SVG registry) for a category. Returns
// null for user-custom categories — those keep using their stored emoji.
export function getCategoryIconName(
  category: Pick<Category, 'name' | 'tripId'>,
): IconName | null {
  if (category.tripId !== null) return null;
  const slug = SLUG_BY_NAME[category.name.toLowerCase()];
  if (!slug) return null;
  return DEFAULT_CATEGORY_ICONS[slug] ?? null;
}
