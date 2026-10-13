import { getTripTint } from './tripTint';
import type { ThemeColors } from '@/constants/theme';

describe('getTripTint', () => {
  const mockTheme = {
    accent: '#ACCENT',
    blue: '#BLUE',
    pink: '#PINK',
    orange: '#ORANGE',
    green: '#GREEN',
    coral: '#CORAL',
    teal: '#TEAL',
    yellow: '#YELLOW',
  } as ThemeColors;

  it('returns theme.accent if tripId is empty', () => {
    expect(getTripTint('', mockTheme)).toBe('#ACCENT');
  });

  it('returns a consistent color for a given tripId', () => {
    const id = 'trip-123';
    const color1 = getTripTint(id, mockTheme);
    const color2 = getTripTint(id, mockTheme);
    expect(color1).toBe(color2);
    expect(color1).not.toBeUndefined();
  });

  it('distributes colors among different tripIds', () => {
    const colors = new Set([
      getTripTint('trip-1', mockTheme),
      getTripTint('trip-2', mockTheme),
      getTripTint('trip-3', mockTheme),
      getTripTint('trip-4', mockTheme),
      getTripTint('trip-5', mockTheme),
    ]);
    expect(colors.size).toBeGreaterThan(1);
  });

  it('should only return colors from the predefined tint keys', () => {
    const allowedColors = [
      '#ACCENT',
      '#BLUE',
      '#PINK',
      '#ORANGE',
      '#GREEN',
      '#CORAL',
      '#TEAL',
      '#YELLOW',
    ];
    for (let i = 0; i < 50; i++) {
      const color = getTripTint(`random-trip-id-${i}`, mockTheme);
      expect(allowedColors).toContain(color);
    }
  });
});
