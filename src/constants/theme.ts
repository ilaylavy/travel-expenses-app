export const colors = {
  background: '#0F1117',
  surface: '#1A1D27',
  surfaceElevated: '#1E2130',
  border: '#2A2E3F',
  textPrimary: '#E8E9ED',
  textSecondary: '#8B8FA3',
  textMuted: '#5C6078',
  accent: '#6C5CE7',
  accentLight: '#A29BFE',
  success: '#00B894',
  error: '#FF6B6B',
  warning: '#FDCB6E',
  info: '#74B9FF',
  transparent: 'transparent',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  screenTitle: { fontSize: 28, fontWeight: '700' as const },
  sectionTitle: { fontSize: 18, fontWeight: '600' as const },
  cardTitle: { fontSize: 14, fontWeight: '600' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  secondary: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  amountLarge: { fontSize: 44, fontWeight: '700' as const },
  amountMedium: { fontSize: 36, fontWeight: '700' as const },
} as const;

export const theme = { colors, spacing, radius, typography } as const;
export type Theme = typeof theme;
