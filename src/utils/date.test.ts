import {
  countDaysInRange,
  formatDateRange,
  formatDay,
  formatDayWithYear,
  formatReadableDate,
  formatReadableDateRange,
  isValidIsoDate,
  todayIsoDate,
} from './date';

describe('isValidIsoDate', () => {
  it('accepts well-formed ISO dates', () => {
    expect(isValidIsoDate('2026-05-09')).toBe(true);
    expect(isValidIsoDate('2000-01-01')).toBe(true);
  });

  it('rejects invalid shapes and unparseable dates', () => {
    expect(isValidIsoDate('2026-5-9')).toBe(false);
    expect(isValidIsoDate('not a date')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
  });
});

describe('formatDay', () => {
  it('formats short month + day, ignoring local TZ', () => {
    expect(formatDay('2026-05-09')).toBe('May 9');
    expect(formatDay('2026-12-31')).toBe('Dec 31');
    expect(formatDay('2026-01-01')).toBe('Jan 1');
  });

  it('echoes back unparseable input', () => {
    expect(formatDay('garbage')).toBe('garbage');
  });
});

describe('formatDayWithYear / formatReadableDate', () => {
  it('includes the year', () => {
    expect(formatDayWithYear('2026-05-09')).toBe('May 9, 2026');
    expect(formatReadableDate('2026-12-31')).toBe('Dec 31, 2026');
  });
});

describe('formatDateRange', () => {
  it('uses Ongoing when end date is null', () => {
    expect(formatDateRange('2026-05-09', null)).toBe('May 9, 2026 · Ongoing');
    expect(formatDateRange('2026-05-09', null, 'In progress')).toBe(
      'May 9, 2026 · In progress',
    );
  });

  it('compresses same-year ranges by dropping the start year', () => {
    expect(formatDateRange('2026-05-09', '2026-05-12')).toBe('May 9 – May 12, 2026');
  });

  it('shows both years when years differ', () => {
    expect(formatDateRange('2025-12-30', '2026-01-02')).toBe(
      'Dec 30, 2025 – Jan 2, 2026',
    );
  });
});

describe('formatReadableDateRange', () => {
  it('compresses same-month ranges', () => {
    expect(formatReadableDateRange('2026-05-09', '2026-05-12')).toBe(
      'May 9 → 12, 2026',
    );
  });

  it('shows both months when months differ in same year', () => {
    expect(formatReadableDateRange('2026-05-09', '2026-06-01')).toBe(
      'May 9 → Jun 1, 2026',
    );
  });

  it('shows full date when years differ', () => {
    expect(formatReadableDateRange('2025-12-30', '2026-01-02')).toBe(
      'Dec 30, 2025 → Jan 2, 2026',
    );
  });
});

describe('countDaysInRange', () => {
  it('returns inclusive day count', () => {
    expect(countDaysInRange('2026-05-09', '2026-05-09')).toBe(1);
    expect(countDaysInRange('2026-05-09', '2026-05-12')).toBe(4);
  });

  it('handles month/year boundaries', () => {
    expect(countDaysInRange('2026-12-30', '2027-01-02')).toBe(4);
  });

  it('returns 1 for unparseable input', () => {
    expect(countDaysInRange('garbage', 'garbage')).toBe(1);
  });
});

describe('todayIsoDate', () => {
  it('matches the YYYY-MM-DD pattern', () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
