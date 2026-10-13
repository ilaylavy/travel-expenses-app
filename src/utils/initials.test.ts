import { initials } from './initials';

describe('initials utility', () => {
  it('should return empty string or ? for empty input', () => {
    expect(initials('')).toBe('?');
  });

  it('should return empty string or ? for whitespace only input', () => {
    expect(initials('   ')).toBe('?');
  });

  it('should return a single letter for a single name', () => {
    expect(initials('John')).toBe('J');
  });

  it('should return two letters for a first and last name', () => {
    expect(initials('John Doe')).toBe('JD');
  });

  it('should handle middle names by using the first and last parts', () => {
    expect(initials('John Middle Doe')).toBe('JD');
  });

  it('should handle extra whitespaces correctly', () => {
    expect(initials('  John    Doe  ')).toBe('JD');
  });

  it('should capitalize the initials regardless of input case', () => {
    expect(initials('john doe')).toBe('JD');
    expect(initials('jOhN dOe')).toBe('JD');
  });

  it('should handle multiple names properly', () => {
    expect(initials('A B C D E')).toBe('AE');
  });

  it('should handle single character names', () => {
    expect(initials('A B')).toBe('AB');
  });
});
