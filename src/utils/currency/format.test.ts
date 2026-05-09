import {
  convert,
  formatAmount,
  getCurrencySymbol,
  roundAmount,
  roundRate,
} from './format';

describe('roundAmount', () => {
  it('rounds to 2 decimals', () => {
    expect(roundAmount(1.234)).toBe(1.23);
    expect(roundAmount(1.235)).toBe(1.24);
    expect(roundAmount(1)).toBe(1);
  });

  it('handles negatives and zero', () => {
    expect(roundAmount(-1.5)).toBe(-1.5);
    expect(roundAmount(-1.234)).toBe(-1.23);
    expect(roundAmount(0)).toBe(0);
  });
});

describe('roundRate', () => {
  it('rounds to 6 decimals', () => {
    expect(roundRate(1.1234567)).toBe(1.123457);
    expect(roundRate(1.0000001)).toBe(1);
  });
});

describe('convert', () => {
  it('multiplies and rounds to 2 decimals', () => {
    expect(convert(100, 1.234)).toBe(123.4);
    expect(convert(33.33, 0.5)).toBe(16.67);
  });
});

describe('getCurrencySymbol', () => {
  it('returns symbol for known codes', () => {
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol('EUR')).toBe('€');
  });

  it('falls back to the code when unknown', () => {
    expect(getCurrencySymbol('ZZZ')).toBe('ZZZ');
  });
});

describe('formatAmount', () => {
  it('formats USD with 2 decimal places', () => {
    expect(formatAmount(1234.5, 'USD')).toMatch(/\$1[,.]?234\.50/);
  });

  it('formats zero-decimal currencies without fractional part', () => {
    expect(formatAmount(1234, 'JPY')).not.toMatch(/\./);
    expect(formatAmount(1234.5, 'JPY')).not.toMatch(/\./);
  });
});
