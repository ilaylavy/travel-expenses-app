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
  fabGradient: readonly [string, string, string];
  cardGradient: readonly [string, string];
}

export const darkTheme: ThemeColors = {
  bg: '#0E1016',
  bgSoft: '#151820',
  surface: '#1C2030',
  surfaceRaised: '#232840',
  border: '#2E3450',
  borderLight: '#363D58',
  text: '#F0F1F5',
  textSecondary: '#9BA1BE',
  textMuted: '#636B8A',
  accent: '#7C6EF6',
  accentLight: '#9D92FF',
  accentSoft: 'rgba(124, 110, 246, 0.14)',
  accentGlow: 'rgba(124, 110, 246, 0.3)',
  green: '#2ED8A4',
  greenSoft: 'rgba(46, 216, 164, 0.14)',
  red: '#FF6B7A',
  redSoft: 'rgba(255, 107, 122, 0.14)',
  orange: '#FFB347',
  orangeSoft: 'rgba(255, 179, 71, 0.14)',
  blue: '#5EB5FF',
  blueSoft: 'rgba(94, 181, 255, 0.14)',
  pink: '#FF7EB3',
  pinkSoft: 'rgba(255, 126, 179, 0.14)',
  yellow: '#FFE066',
  yellowSoft: 'rgba(255, 224, 102, 0.14)',
  teal: '#4DD9C0',
  tealSoft: 'rgba(77, 217, 192, 0.14)',
  coral: '#FF8A80',
  coralSoft: 'rgba(255, 138, 128, 0.14)',
  navBg: 'rgba(14, 16, 22, 0.92)',
  gradient1: ['#7C6EF6', '#5EB5FF'] as const,
  gradient2: ['#FF7EB3', '#FFB347'] as const,
  gradient3: ['#2ED8A4', '#5EB5FF'] as const,
  fabGradient: ['#7C6EF6', '#9D92FF', '#5EB5FF'] as const,
  cardGradient: ['#1C2030', '#232840'] as const,
};

export const lightTheme: ThemeColors = {
  bg: '#F5F6FA',
  bgSoft: '#EDEEF4',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E2E4EE',
  borderLight: '#ECEDF5',
  text: '#1A1D2E',
  textSecondary: '#6B7194',
  textMuted: '#9CA0B8',
  accent: '#6C5CE7',
  accentLight: '#8577F0',
  accentSoft: 'rgba(108, 92, 231, 0.1)',
  accentGlow: 'rgba(108, 92, 231, 0.15)',
  green: '#00C48C',
  greenSoft: 'rgba(0, 196, 140, 0.1)',
  red: '#FF5263',
  redSoft: 'rgba(255, 82, 99, 0.1)',
  orange: '#FF9F43',
  orangeSoft: 'rgba(255, 159, 67, 0.1)',
  blue: '#3B8BFF',
  blueSoft: 'rgba(59, 139, 255, 0.1)',
  pink: '#FF6B9D',
  pinkSoft: 'rgba(255, 107, 157, 0.1)',
  yellow: '#FFCB45',
  yellowSoft: 'rgba(255, 203, 69, 0.1)',
  teal: '#00D2B4',
  tealSoft: 'rgba(0, 210, 180, 0.1)',
  coral: '#FF7B72',
  coralSoft: 'rgba(255, 123, 114, 0.1)',
  navBg: 'rgba(255, 255, 255, 0.92)',
  gradient1: ['#6C5CE7', '#3B8BFF'] as const,
  gradient2: ['#FF6B9D', '#FF9F43'] as const,
  gradient3: ['#00C48C', '#3B8BFF'] as const,
  fabGradient: ['#6C5CE7', '#8577F0', '#3B8BFF'] as const,
  cardGradient: ['#FFFFFF', '#F8F9FF'] as const,
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

export const spacing = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 22,
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

export const typography = {
  title: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.8 },
  sectionTitle: { fontSize: 15, fontWeight: '700' as const },
  itemTitle: { fontSize: 17, fontWeight: '700' as const },
  subtitle: { fontSize: 14, fontWeight: '600' as const },
  body: { fontSize: 14, fontWeight: '500' as const },
  secondary: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 11, fontWeight: '500' as const },
  micro: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.4 },
  amountLarge: { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1.5 },
  amountMedium: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.5 },
  amountSmall: { fontSize: 16, fontWeight: '700' as const },
  numpad: { fontSize: 22, fontWeight: '600' as const },
  entryAmount: { fontSize: 48, fontWeight: '800' as const, letterSpacing: -2 },
  screenTitle: { fontSize: 28, fontWeight: '700' as const },
} as const;
