// Tiny expression-input engine for the calculator numpad. Grammar is
// intentionally minimal (no parens, no unary operators):
//
//   expr   := number (op number)*
//   op     := '+' | '-' | '*' | '/'
//   number := [0-9]+ ('.' [0-9]{0,2})?
//
// Operator precedence: `*` and `/` before `+` and `-`. Same-precedence
// reductions go left-to-right. The engine returns `null` (not a thrown
// error) for any unresolvable expression — empty, trailing operator,
// divide-by-zero — so the form can silently keep the Save button
// disabled while the user types.

export type Op = '+' | '-' | '*' | '/';
export type NumpadInput =
  | '0' | '1' | '2' | '3' | '4'
  | '5' | '6' | '7' | '8' | '9'
  | '.' | 'backspace' | Op;

export type DisplayToken =
  | { kind: 'number'; raw: string; formatted: string }
  | { kind: 'op'; op: Op; glyph: '+' | '−' | '×' | '÷' };

// Visual glyphs for the operator keys. Production uses the proper Unicode
// minus / multiplication / division signs instead of the ASCII variants.
const GLYPH: Record<Op, '+' | '−' | '×' | '÷'> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
};

const OP_CHARS = '+-*/';
const MAX_DECIMALS = 2;

// ─── tokenize ────────────────────────────────────────────────
// Splits the raw expression string into atoms — numbers (still as raw
// strings, so trailing-decimal cases like "12." survive) and operators.
// Internal: external callers use the friendlier `tokenize` below.
type RawToken =
  | { type: 'number'; raw: string }
  | { type: 'op'; op: Op };

function tokenizeRaw(expr: string): RawToken[] {
  const out: RawToken[] = [];
  let current = '';
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (/[0-9.]/.test(c)) {
      current += c;
    } else if (OP_CHARS.includes(c)) {
      if (current.length > 0) {
        out.push({ type: 'number', raw: current });
        current = '';
      }
      out.push({ type: 'op', op: c as Op });
    }
    // Anything else (whitespace, garbage) is silently dropped.
  }
  if (current.length > 0) out.push({ type: 'number', raw: current });
  return out;
}

// Display tokens — formatted numbers with locale-aware thousands
// separators + visual operator glyphs. Used by AmountSection to render
// the expression with operators in accent color and digits in text color.
export function tokenize(expr: string, locale = 'en'): DisplayToken[] {
  return tokenizeRaw(expr).map((t) => {
    if (t.type === 'op') {
      return { kind: 'op', op: t.op, glyph: GLYPH[t.op] };
    }
    const value = parseFloat(t.raw);
    let formatted: string;
    if (!Number.isFinite(value)) {
      formatted = t.raw;
    } else {
      try {
        formatted = new Intl.NumberFormat(locale).format(value);
      } catch {
        formatted = t.raw;
      }
    }
    // Preserve a trailing dot the user has typed but not yet completed
    // with a fractional digit — e.g. "12." should display as "12.", not "12".
    if (t.raw.endsWith('.') && !formatted.includes('.')) {
      formatted = `${formatted}.`;
    }
    return { kind: 'number', raw: t.raw, formatted };
  });
}

// ─── appendKey ───────────────────────────────────────────────
// Pure string transform applied for every numpad press. Centralizes the
// quirky rules — leading-zero collapse, decimal cap, operator replacement —
// so the React layer can stay dumb.
export function appendKey(expr: string, key: NumpadInput): string {
  if (key === 'backspace') return expr.slice(0, -1);

  if (OP_CHARS.includes(key)) {
    // Don't allow a leading operator — calculators in this design don't
    // support unary minus. User would have to type "0-..." manually if
    // they want a negative result.
    if (expr.length === 0) return expr;
    if (lastIsOp(expr)) {
      // Replace the trailing operator so "5+" → "5*" without an
      // intermediate backspace.
      return expr.slice(0, -1) + key;
    }
    return expr + key;
  }

  if (key === '.') {
    const last = lastNumberToken(expr);
    if (last.includes('.')) return expr;
    if (expr.length === 0 || lastIsOp(expr)) return `${expr}0.`;
    return `${expr}.`;
  }

  // ─ digit input ─
  if (expr.length === 0) return key;

  const last = lastNumberToken(expr);
  // Leading-zero collapse. "0" + "5" → "5"; "5+0" + "5" → "5+5". An extra
  // "0" pressed against a leading zero is ignored ("0" + "0" → "0").
  if (last === '0') {
    if (key === '0') return expr;
    return `${expr.slice(0, -1)}${key}`;
  }
  // Cap fractional length at MAX_DECIMALS. Anything past two decimal
  // digits is silently dropped — production rounds amounts to two decimals
  // already.
  if (last.includes('.')) {
    const fractional = last.split('.')[1] ?? '';
    if (fractional.length >= MAX_DECIMALS) return expr;
  }
  return expr + key;
}

// ─── evaluate ────────────────────────────────────────────────
// Two-pass left-to-right reducer over the tokenized atoms. Returns null
// for any structurally-incomplete expression so the form can disable Save
// without surfacing an error.
export function evaluate(expr: string): number | null {
  const raw = tokenizeRaw(expr);
  if (raw.length === 0) return null;
  // Must start with a number; must alternate number/op/number/...; must
  // end with a number. Length must therefore be odd.
  if (raw.length % 2 === 0) return null;
  if (raw[0].type !== 'number') return null;

  type Atom = { type: 'num'; value: number } | { type: 'op'; op: Op };
  const atoms: Atom[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (i % 2 === 0) {
      if (t.type !== 'number') return null;
      const v = parseFloat(t.raw);
      if (!Number.isFinite(v)) return null;
      atoms.push({ type: 'num', value: v });
    } else {
      if (t.type !== 'op') return null;
      atoms.push({ type: 'op', op: t.op });
    }
  }

  // Pass A: collapse * and / left-to-right.
  const passA: Atom[] = [];
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    if (a.type === 'op' && (a.op === '*' || a.op === '/')) {
      const prev = passA.pop();
      const next = atoms[i + 1];
      if (!prev || prev.type !== 'num' || !next || next.type !== 'num') {
        return null;
      }
      let v: number;
      if (a.op === '*') {
        v = prev.value * next.value;
      } else {
        if (next.value === 0) return null;
        v = prev.value / next.value;
      }
      if (!Number.isFinite(v)) return null;
      passA.push({ type: 'num', value: v });
      i += 1; // skip the next atom (we just consumed it)
    } else {
      passA.push(a);
    }
  }

  // Pass B: collapse + and - left-to-right.
  if (passA.length === 0 || passA[0].type !== 'num') return null;
  let result = passA[0].value;
  for (let i = 1; i < passA.length; i += 2) {
    const op = passA[i];
    const next = passA[i + 1];
    if (!op || op.type !== 'op') return null;
    if (!next || next.type !== 'num') return null;
    if (op.op === '+') result += next.value;
    else if (op.op === '-') result -= next.value;
    else return null;
  }
  return Number.isFinite(result) ? result : null;
}

// ─── helpers ─────────────────────────────────────────────────
// Returns the operator at the end of the expression, or null when the
// expression is empty or ends in a digit. Used by NumPad to highlight
// the active operator key.
export function trailingOperator(expr: string): Op | null {
  if (expr.length === 0) return null;
  const c = expr[expr.length - 1];
  return OP_CHARS.includes(c) ? (c as Op) : null;
}

// True when the expression has at least one operator — i.e. it's a real
// expression and not just a single number. Drives the "= result" sub-line
// in the AmountSection display.
export function hasOperator(expr: string): boolean {
  for (const c of expr) if (OP_CHARS.includes(c)) return true;
  return false;
}

// True iff evaluate() would return a finite number. Useful as a Save FAB
// gate without re-running the full reducer for the same result.
export function isResolvable(expr: string): boolean {
  return evaluate(expr) !== null;
}

// Internal helpers used by appendKey.
function lastIsOp(expr: string): boolean {
  if (expr.length === 0) return false;
  return OP_CHARS.includes(expr[expr.length - 1]);
}

function lastNumberToken(expr: string): string {
  // Scan backward, collecting digits and the decimal point. Stops at the
  // first operator (or the start of the string). Returns the trailing
  // number-segment of the expression.
  let i = expr.length - 1;
  while (i >= 0 && /[0-9.]/.test(expr[i])) i -= 1;
  return expr.slice(i + 1);
}
