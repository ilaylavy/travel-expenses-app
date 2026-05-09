import type { ThemeColors } from '@/constants/theme';

// Category colors are stored as semantic theme tokens (e.g. "orange", "blue")
// so the actual hex resolves per theme mode. Legacy hex values still render
// correctly via the fallback path.
export const CATEGORY_COLOR_TOKENS = [
  'accent',
  'orange',
  'blue',
  'pink',
  'yellow',
  'green',
  'teal',
  'coral',
  'red',
] as const;

export type CategoryColorToken = (typeof CATEGORY_COLOR_TOKENS)[number];

const BASE_KEYS: Record<CategoryColorToken, keyof ThemeColors> = {
  accent: 'accent',
  orange: 'orange',
  blue: 'blue',
  pink: 'pink',
  yellow: 'yellow',
  green: 'green',
  teal: 'teal',
  coral: 'coral',
  red: 'red',
};

const SOFT_KEYS: Record<CategoryColorToken, keyof ThemeColors> = {
  accent: 'accentSoft',
  orange: 'orangeSoft',
  blue: 'blueSoft',
  pink: 'pinkSoft',
  yellow: 'yellowSoft',
  green: 'greenSoft',
  teal: 'tealSoft',
  coral: 'coralSoft',
  red: 'redSoft',
};

function isToken(value: string): value is CategoryColorToken {
  return (CATEGORY_COLOR_TOKENS as readonly string[]).includes(value);
}

export function getCategoryColor(colorValue: string, theme: ThemeColors): string {
  if (isToken(colorValue)) {
    const key = BASE_KEYS[colorValue];
    const v = theme[key];
    return typeof v === 'string' ? v : theme.accent;
  }
  return colorValue || theme.accent;
}

export function getCategorySoftColor(colorValue: string, theme: ThemeColors): string {
  if (isToken(colorValue)) {
    const key = SOFT_KEYS[colorValue];
    const v = theme[key];
    return typeof v === 'string' ? v : theme.accentSoft;
  }
  return theme.accentSoft;
}
