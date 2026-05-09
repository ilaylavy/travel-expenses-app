import {
  asBoolInt,
  asNumber,
  asString,
  BOOL_FIELDS_BY_TABLE,
} from './typeCoercion';

describe('asString', () => {
  it('returns null for null/undefined', () => {
    expect(asString(null)).toBeNull();
    expect(asString(undefined)).toBeNull();
  });

  it('stringifies non-null values', () => {
    expect(asString('hello')).toBe('hello');
    expect(asString(42)).toBe('42');
    expect(asString(true)).toBe('true');
    expect(asString(0)).toBe('0');
  });
});

describe('asNumber', () => {
  it('returns null for null/undefined and unparseable strings', () => {
    expect(asNumber(null)).toBeNull();
    expect(asNumber(undefined)).toBeNull();
    expect(asNumber('abc')).toBeNull();
    expect(asNumber('NaN')).toBeNull();
  });

  it('passes through numbers', () => {
    expect(asNumber(0)).toBe(0);
    expect(asNumber(-3.14)).toBe(-3.14);
  });

  it('parses numeric strings', () => {
    expect(asNumber('42')).toBe(42);
    expect(asNumber('3.14')).toBe(3.14);
    expect(asNumber('-1')).toBe(-1);
  });
});

describe('asBoolInt', () => {
  it('returns 1 for every Postgres-truthy variant', () => {
    expect(asBoolInt(true)).toBe(1);
    expect(asBoolInt(1)).toBe(1);
    expect(asBoolInt('1')).toBe(1);
    expect(asBoolInt('t')).toBe(1);
    expect(asBoolInt('true')).toBe(1);
  });

  it('returns 0 for everything else', () => {
    expect(asBoolInt(false)).toBe(0);
    expect(asBoolInt(0)).toBe(0);
    expect(asBoolInt('0')).toBe(0);
    expect(asBoolInt('f')).toBe(0);
    expect(asBoolInt('false')).toBe(0);
    expect(asBoolInt(null)).toBe(0);
    expect(asBoolInt(undefined)).toBe(0);
    expect(asBoolInt('')).toBe(0);
    expect(asBoolInt('TRUE')).toBe(0); // strict — uppercase isn't matched
  });
});

describe('BOOL_FIELDS_BY_TABLE', () => {
  it('lists the boolean fields for each sync table', () => {
    expect(BOOL_FIELDS_BY_TABLE.expenses).toEqual([
      'is_refund',
      'is_excluded_from_daily_metrics',
      'is_private',
      'is_split',
    ]);
    expect(BOOL_FIELDS_BY_TABLE.categories).toEqual(['is_archived']);
    expect(BOOL_FIELDS_BY_TABLE.expense_splits).toEqual(['is_payer']);
  });

  it('has empty arrays for tables without boolean columns', () => {
    expect(BOOL_FIELDS_BY_TABLE.profiles).toEqual([]);
    expect(BOOL_FIELDS_BY_TABLE.trips).toEqual([]);
    expect(BOOL_FIELDS_BY_TABLE.trip_members).toEqual([]);
    expect(BOOL_FIELDS_BY_TABLE.expense_photos).toEqual([]);
  });
});
