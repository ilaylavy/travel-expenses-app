export interface ThemeColors {
  bg: string;
  bgSoft: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderLight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  accentSoft: string;
  accentGlow: string;
  green: string;
  greenSoft: string;
  red: string;
  redSoft: string;
  orange: string;
  orangeSoft: string;
  blue: string;
  blueSoft: string;
  pink: string;
  pinkSoft: string;
  yellow: string;
  yellowSoft: string;
  teal: string;
  tealSoft: string;
  coral: string;
  coralSoft: string;
  navBg: string;
  gradient1: readonly [string, string];
  gradient2: readonly [string, string];
  gradient3: readonly [string, string];
  fabGradient: readonly [string, string];
  cardGradient: readonly [string, string];
}

// Refined edition (see .claude/skills/travel-expenses-design/colors_and_type.css):
// indigo accent, lower-saturation categories, monochrome indigo gradients reserved
// for hero card + FAB. Borders read as silhouettes, not lines.
export const darkTheme: ThemeColors = {
  bg: '#0B0D13',
  bgSoft: '#14171F',
  surface: '#191D27',
  surfaceRaised: '#1E2330',
  border: '#262B3A',
  borderLight: '#1F2330',
  text: '#F0F1F5',
  textSecondary: '#9BA1BE',
  textMuted: '#5F6580',
  accent: '#7C6EF6',
  accentLight: '#9D92FF',
  accentSoft: 'rgba(124, 110, 246, 0.12)',
  accentGlow: 'rgba(124, 110, 246, 0.22)',
  green: '#34C28B',
  greenSoft: 'rgba(52, 194, 139, 0.12)',
  red: '#E25C6A',
  redSoft: 'rgba(226, 92, 106, 0.12)',
  orange: '#E89F4D',
  orangeSoft: 'rgba(232, 159, 77, 0.12)',
  blue: '#57A8E8',
  blueSoft: 'rgba(87, 168, 232, 0.12)',
  pink: '#DC78A6',
  pinkSoft: 'rgba(220, 120, 166, 0.12)',
  yellow: '#D9C462',
  yellowSoft: 'rgba(217, 196, 98, 0.12)',
  teal: '#4DC5B0',
  tealSoft: 'rgba(77, 197, 176, 0.12)',
  coral: '#E47974',
  coralSoft: 'rgba(228, 121, 116, 0.12)',
  navBg: 'rgba(11, 13, 19, 0.92)',
  gradient1: ['#4F45C7', '#6E5FE0'] as const,
  gradient2: ['#B25A78', '#C97A55'] as const,
  gradient3: ['#2E9E76', '#4994C2'] as const,
  fabGradient: ['#5F52DC', '#7C6EF6'] as const,
  cardGradient: ['#1B1F2B', '#181C26'] as const,
};

export const lightTheme: ThemeColors = {
  bg: '#FAFAFC',
  bgSoft: '#F2F3F8',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E5E7EE',
  borderLight: '#EFF0F5',
  text: '#15172A',
  textSecondary: '#5A607D',
  textMuted: '#A3A8BC',
  accent: '#6151E0',
  accentLight: '#7E70EE',
  accentSoft: 'rgba(97, 81, 224, 0.08)',
  accentGlow: 'rgba(97, 81, 224, 0.12)',
  green: '#19A56C',
  greenSoft: 'rgba(25, 165, 108, 0.08)',
  red: '#D24654',
  redSoft: 'rgba(210, 70, 84, 0.08)',
  orange: '#D78838',
  orangeSoft: 'rgba(215, 136, 56, 0.08)',
  blue: '#2F89D4',
  blueSoft: 'rgba(47, 137, 212, 0.08)',
  pink: '#C45D8C',
  pinkSoft: 'rgba(196, 93, 140, 0.08)',
  yellow: '#C2A12F',
  yellowSoft: 'rgba(194, 161, 47, 0.08)',
  teal: '#16AA94',
  tealSoft: 'rgba(22, 170, 148, 0.08)',
  coral: '#C95F5A',
  coralSoft: 'rgba(201, 95, 90, 0.08)',
  navBg: 'rgba(255, 255, 255, 0.92)',
  gradient1: ['#6151E0', '#8275ED'] as const,
  gradient2: ['#C45D8C', '#D78838'] as const,
  gradient3: ['#19A56C', '#2F89D4'] as const,
  fabGradient: ['#6151E0', '#8275ED'] as const,
  cardGradient: ['#FFFFFF', '#FBFBFD'] as const,
};

export const getTheme = (isDark: boolean): ThemeColors => (isDark ? darkTheme : lightTheme);

// Legacy shim so early placeholder screens keep compiling. Prefer useTheme() in new code.
export const colors = {
  background: darkTheme.bg,
  surface: darkTheme.surface,
  surfaceElevated: darkTheme.surfaceRaised,
  border: darkTheme.border,
  textPrimary: darkTheme.text,
  textSecondary: darkTheme.textSecondary,
  textMuted: darkTheme.textMuted,
  accent: darkTheme.accent,
  accentLight: darkTheme.accentLight,
  success: darkTheme.green,
  error: darkTheme.red,
  warning: darkTheme.orange,
  info: darkTheme.blue,
  transparent: 'transparent',
} as const;

// Refined edition: base-4 with custom 22/28/36 steps reserved for screen
// padding and breathing room around hero cards. Larger than the old scale
// — the new system runs deliberately airier.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 28,
  xxxl: 36,
  base: 16,
} as const;

export const sizing = {
  radiusCard: 22,
  radiusCardInner: 18,
  radiusButton: 14,
  radiusChip: 22,
  radiusInput: 14,
  radiusIcon: 12,
  radiusSmall: 10,
  radiusPill: 999,
  categoryIconLarge: 50,
  categoryIconMedium: 42,
  categoryIconSmall: 36,
  mapPin: 44,
  navHeight: 74,
  fabSize: 56,
  fabRadius: 18,
  fabOffset: -10,
  headerButton: 36,
  headerButtonRadius: 12,
  statusBarHeight: 50,
} as const;

// Border weight scale. Use `base` for cards/inputs, `hairline` for dividers,
// `heavy` only when extra prominence is needed.
export const borderWidth = {
  hairline: 1,
  base: 1.5,
  heavy: 2,
} as const;

// Tabular numerics are baked into every amount-* token below — amounts are
// always numeric so the variant is intent-aligned and removes drift.
const TABULAR = { fontVariant: ['tabular-nums' as const] };

export const typography = {
  title: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.8 },
  sectionTitle: { fontSize: 15, fontWeight: '700' as const },
  itemTitle: { fontSize: 17, fontWeight: '700' as const },
  subtitle: { fontSize: 14, fontWeight: '600' as const },
  body: { fontSize: 14, fontWeight: '500' as const },
  secondary: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 11, fontWeight: '500' as const },
  micro: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.4 },
  amountHero: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -1, ...TABULAR },
  amountLarge: { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1.5, ...TABULAR },
  amountMedium: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.5, ...TABULAR },
  amountSmall: { fontSize: 16, fontWeight: '700' as const, ...TABULAR },
  numpad: { fontSize: 22, fontWeight: '600' as const, ...TABULAR },
  entryAmount: { fontSize: 48, fontWeight: '800' as const, letterSpacing: -2, ...TABULAR },
  screenTitle: { fontSize: 28, fontWeight: '700' as const },
} as const;
