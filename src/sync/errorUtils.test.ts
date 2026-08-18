import { formatError } from './errorUtils';

describe('formatError', () => {
  it('handles null and undefined', () => {
    expect(formatError(null)).toBe('unknown error');
    expect(formatError(undefined)).toBe('unknown error');
  });

  it('handles Error instances', () => {
    expect(formatError(new Error('Test error message'))).toBe('Test error message');
  });

  it('handles string primitives', () => {
    expect(formatError('A string error')).toBe('A string error');
  });

  it('handles PostgrestError-like objects', () => {
    // Only code
    expect(formatError({ code: '23505' })).toBe('code=23505');
    // Only message
    expect(formatError({ message: 'duplicate key value violates unique constraint' })).toBe(
      'duplicate key value violates unique constraint'
    );
    // Multiple fields
    expect(
      formatError({
        code: '23505',
        message: 'duplicate key value',
        details: 'Key (id)=(1) already exists.',
        hint: 'Use a different id',
      })
    ).toBe('code=23505 duplicate key value details=Key (id)=(1) already exists. hint=Use a different id');

    // Ignore non-string message/details/hint
    expect(
      formatError({
        code: 123,
        message: 456,
        details: null,
        hint: {},
      })
    ).toBe('code=123');

    // Code is zero
    expect(formatError({ code: 0 })).toBe('code=0');
  });

  it('falls back to JSON.stringify for regular objects', () => {
    expect(formatError({ some: 'data', value: 42 })).toBe('{"some":"data","value":42}');
    expect(formatError({})).toBe('{}');
  });

  it('falls back gracefully to [unserializable error] for objects with circular references', () => {
    const circularObj: any = {};
    circularObj.self = circularObj;
    expect(formatError(circularObj)).toBe('[unserializable error]');
  });

  it('falls back to String() for other primitive types', () => {
    expect(formatError(42)).toBe('42');
    expect(formatError(true)).toBe('true');
    expect(formatError(false)).toBe('false');
    // BigInt
    expect(formatError(BigInt(9007199254740991))).toBe('9007199254740991');
    // Symbol
    expect(formatError(Symbol('test'))).toBe('Symbol(test)');
  });
});
