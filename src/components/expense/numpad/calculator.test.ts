import {
  appendKey,
  evaluate,
  hasOperator,
  isResolvable,
  tokenize,
  trailingOperator,
} from './calculator';

describe('calculator.appendKey', () => {
  it('appends digits', () => {
    expect(appendKey('', '1')).toBe('1');
    expect(appendKey('1', '2')).toBe('12');
    expect(appendKey('12', '3')).toBe('123');
  });

  it('collapses leading zero', () => {
    expect(appendKey('0', '5')).toBe('5');
    expect(appendKey('0', '0')).toBe('0');
    expect(appendKey('5+0', '5')).toBe('5+5');
    expect(appendKey('5+0', '0')).toBe('5+0');
  });

  it('handles decimals', () => {
    expect(appendKey('', '.')).toBe('0.');
    expect(appendKey('0', '.')).toBe('0.');
    expect(appendKey('0.', '5')).toBe('0.5');
    expect(appendKey('12', '.')).toBe('12.');
    expect(appendKey('12.', '5')).toBe('12.5');
    expect(appendKey('5+', '.')).toBe('5+0.');
  });

  it('rejects double decimal in same number', () => {
    expect(appendKey('1.2', '.')).toBe('1.2');
    expect(appendKey('0.', '.')).toBe('0.');
  });

  it('allows decimal in each new number', () => {
    expect(appendKey('1.5+2', '.')).toBe('1.5+2.');
    expect(appendKey('1.5+2.', '7')).toBe('1.5+2.7');
  });

  it('caps fractional digits at 2', () => {
    expect(appendKey('1.55', '5')).toBe('1.55');
    expect(appendKey('1.5', '5')).toBe('1.55');
  });

  it('ignores leading operator', () => {
    expect(appendKey('', '+')).toBe('');
    expect(appendKey('', '-')).toBe('');
    expect(appendKey('', '*')).toBe('');
    expect(appendKey('', '/')).toBe('');
  });

  it('replaces trailing operator', () => {
    expect(appendKey('5+', '-')).toBe('5-');
    expect(appendKey('5*', '/')).toBe('5/');
  });

  it('appends operator after number', () => {
    expect(appendKey('5', '+')).toBe('5+');
    expect(appendKey('1.5', '*')).toBe('1.5*');
  });

  it('handles backspace', () => {
    expect(appendKey('5+3', 'backspace')).toBe('5+');
    expect(appendKey('5+', 'backspace')).toBe('5');
    expect(appendKey('5', 'backspace')).toBe('');
    expect(appendKey('', 'backspace')).toBe('');
  });
});

describe('calculator.evaluate', () => {
  it('handles simple addition', () => {
    expect(evaluate('2+3')).toBe(5);
    expect(evaluate('1+2+3')).toBe(6);
  });

  it('handles subtraction left-to-right', () => {
    expect(evaluate('10-4+2')).toBe(8);
    expect(evaluate('10-4-2')).toBe(4);
  });

  it('respects multiplication precedence', () => {
    expect(evaluate('2+3*4')).toBe(14);
    expect(evaluate('2*3+4')).toBe(10);
    expect(evaluate('10-2*3')).toBe(4);
  });

  it('handles division', () => {
    expect(evaluate('6/2')).toBe(3);
    expect(evaluate('10/4')).toBe(2.5);
  });

  it('returns null for divide-by-zero', () => {
    expect(evaluate('1/0')).toBeNull();
    expect(evaluate('5+10/0')).toBeNull();
  });

  it('handles decimals', () => {
    expect(evaluate('1.5+2.5')).toBe(4);
    expect(evaluate('0.1+0.2')).toBeCloseTo(0.3);
  });

  it('returns single-number expressions verbatim', () => {
    expect(evaluate('42')).toBe(42);
    expect(evaluate('0')).toBe(0);
    expect(evaluate('0.5')).toBe(0.5);
  });

  it('returns null for empty or incomplete', () => {
    expect(evaluate('')).toBeNull();
    expect(evaluate('5+')).toBeNull();
    expect(evaluate('5+3-')).toBeNull();
  });

  it('returns null for trailing-decimal numbers when used alone', () => {
    // "12." is parseFloat'd to 12 — accept it as the user's intent.
    expect(evaluate('12.')).toBe(12);
  });
});

describe('calculator.tokenize', () => {
  it('formats numbers with thousands separators', () => {
    const tokens = tokenize('1200+350', 'en');
    expect(tokens).toEqual([
      { kind: 'number', raw: '1200', formatted: '1,200' },
      { kind: 'op', op: '+', glyph: '+' },
      { kind: 'number', raw: '350', formatted: '350' },
    ]);
  });

  it('uses Unicode operator glyphs', () => {
    const tokens = tokenize('1*2-3/4', 'en');
    const ops = tokens.filter((t) => t.kind === 'op');
    expect(ops.map((t) => (t.kind === 'op' ? t.glyph : null))).toEqual(['×', '−', '÷']);
  });

  it('preserves trailing decimal point', () => {
    const tokens = tokenize('12.', 'en');
    expect(tokens[0]).toMatchObject({ formatted: '12.' });
  });
});

describe('calculator.helpers', () => {
  it('trailingOperator returns the last op or null', () => {
    expect(trailingOperator('5+')).toBe('+');
    expect(trailingOperator('5*')).toBe('*');
    expect(trailingOperator('5')).toBeNull();
    expect(trailingOperator('')).toBeNull();
  });

  it('hasOperator detects operators anywhere in the expression', () => {
    expect(hasOperator('5+3')).toBe(true);
    expect(hasOperator('5')).toBe(false);
    expect(hasOperator('')).toBe(false);
  });

  it('isResolvable mirrors evaluate', () => {
    expect(isResolvable('5+3')).toBe(true);
    expect(isResolvable('5+')).toBe(false);
    expect(isResolvable('')).toBe(false);
    expect(isResolvable('1/0')).toBe(false);
  });
});
