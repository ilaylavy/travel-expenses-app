import { getCategoryIconName } from './icon';

// Mock react-native and react-native-svg
jest.mock('react-native', () => ({
  StyleSheet: {
    create: jest.fn(),
  },
}));

jest.mock('react-native-svg', () => ({
  Svg: 'Svg',
  Circle: 'Circle',
  Line: 'Line',
  Path: 'Path',
}));

describe('getCategoryIconName', () => {
  it('returns the correct icon name for a known default category', () => {
    expect(getCategoryIconName({ name: 'Food', tripId: null })).toBe('food');
    expect(getCategoryIconName({ name: 'Transport', tripId: null })).toBe('transport');
  });

  it('is case-insensitive when matching category names', () => {
    expect(getCategoryIconName({ name: 'fOOd', tripId: null })).toBe('food');
    expect(getCategoryIconName({ name: 'TRANSPORT', tripId: null })).toBe('transport');
  });

  it('returns null for a custom user category (tripId is not null)', () => {
    expect(getCategoryIconName({ name: 'Food', tripId: '123' })).toBeNull();
  });

  it('returns null for an unknown default category (tripId is null but name unknown)', () => {
    expect(getCategoryIconName({ name: 'UnknownCategory', tripId: null })).toBeNull();
  });
});
