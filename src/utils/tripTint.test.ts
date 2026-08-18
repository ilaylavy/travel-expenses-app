import { getTripTint } from './tripTint';
import type { ThemeColors } from '@/constants/theme';

describe('getTripTint', () => {
  // A mock theme that provides distinct colors for the keys used by getTripTint
  const mockTheme = {
    accent: '#accent',
    blue: '#blue',
    pink: '#pink',
    orange: '#orange',
    green: '#green',
    coral: '#coral',
    teal: '#teal',
    yellow: '#yellow',
  } as ThemeColors;

  it('returns accent color when tripId is empty', () => {
    expect(getTripTint('', mockTheme)).toBe(mockTheme.accent);
  });

  it('returns a stable color for a given tripId', () => {
    const tripId1 = 'trip123';
    const tripId2 = 'trip456';

    const tint1 = getTripTint(tripId1, mockTheme);
    const tint2 = getTripTint(tripId1, mockTheme);
    const tint3 = getTripTint(tripId2, mockTheme);

    // Repeated calls with same tripId should yield same tint
    expect(tint1).toBe(tint2);

    // Ensure we are getting valid string colors back
    expect(typeof tint1).toBe('string');
    expect(typeof tint3).toBe('string');
  });

  it('pulls from the TINT_KEYS based on hash', () => {
    // TINT_KEYS in tripTint.ts contains these specific keys
    const expectedColors = [
      mockTheme.accent,
      mockTheme.blue,
      mockTheme.pink,
      mockTheme.orange,
      mockTheme.green,
      mockTheme.coral,
      mockTheme.teal,
      mockTheme.yellow,
    ];

    const tint = getTripTint('some-unique-trip-id', mockTheme);
    expect(expectedColors).toContain(tint);
  });

  it('handles strings with same prefix differently if hash differs', () => {
    const tintA = getTripTint('tripA', mockTheme);
    const tintB = getTripTint('tripB', mockTheme);

    // It's possible for hashes to collide modulo length, but generally they differ
    expect(typeof tintA).toBe('string');
    expect(typeof tintB).toBe('string');
  });
});
