import { CURRENCIES } from '@/constants/currencies';

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

// Currencies that conventionally display without a fractional part.
const ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG',
  'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF', 'HUF',
]);

export function formatAmount(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
  const rounded = roundAmount(amount);
  const formatted = rounded.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${symbol}${formatted}`;
}

// Apply a stored exchange rate. Rate is defined as: 1 base = rate target.
export function convert(amount: number, rate: number): number {
  return roundAmount(amount * rate);
}

// 2-decimal rounding for display/storage of monetary amounts.
export function roundAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// 6-decimal rounding for stored exchange rates.
export function roundRate(rate: number): number {
  return Math.round(rate * 1_000_000) / 1_000_000;
}

export function todayDateString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
