import { initials } from './initials';

describe('initials', () => {
  it('returns the first and last initial of a typical two-part name', () => {
    expect(initials('John Doe')).toBe('JD');
  });

  it('returns just the first initial for a single-part name', () => {
    expect(initials('John')).toBe('J');
  });

  it('returns the first and last initial for multi-part names (> 2 parts)', () => {
    expect(initials('John Middle Doe')).toBe('JD');
    expect(initials('John Jacob Jingleheimer Schmidt')).toBe('JS');
  });

  it('converts initials to uppercase', () => {
    expect(initials('john doe')).toBe('JD');
    expect(initials('jOhn DoE')).toBe('JD');
  });

  it('returns "?" for empty strings', () => {
    expect(initials('')).toBe('?');
  });

  it('returns "?" for whitespace-only strings', () => {
    expect(initials(' ')).toBe('?');
    expect(initials('   ')).toBe('?');
  });

  it('handles names with leading and trailing whitespace', () => {
    expect(initials('  John Doe  ')).toBe('JD');
  });

  it('handles names with multiple spaces between words', () => {
    expect(initials('John   Doe')).toBe('JD');
  });
});
