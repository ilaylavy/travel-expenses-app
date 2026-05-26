import {
  combineDateWithTimeOfDay,
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

describe('combineDateWithTimeOfDay', () => {
  it('anchors the date prefix to dayDate regardless of TZ or time-of-day', () => {
    // Contract: substring(0, 10) === dayDate, always.
    expect(combineDateWithTimeOfDay('2026-05-15', null).slice(0, 10)).toBe('2026-05-15');
    expect(combineDateWithTimeOfDay('2026-05-15', undefined).slice(0, 10)).toBe('2026-05-15');
    expect(
      combineDateWithTimeOfDay('2026-05-15', '2024-06-14T22:00:00.000Z').slice(0, 10),
    ).toBe('2026-05-15');
    expect(
      combineDateWithTimeOfDay('2026-05-15', '2024-06-15T05:00:00.000Z').slice(0, 10),
    ).toBe('2026-05-15');
    expect(
      combineDateWithTimeOfDay('2026-12-31', '2024-06-15T23:59:59.999Z').slice(0, 10),
    ).toBe('2026-12-31');
  });

  it('returns a well-formed ISO-8601 string with TZ offset', () => {
    const result = combineDateWithTimeOfDay('2026-05-15', '2024-06-14T22:00:00.000Z');
    expect(result).toMatch(/^2026-05-15T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
  });

  it('uses midnight (00:00:00.000) when no reference is provided', () => {
    expect(combineDateWithTimeOfDay('2026-05-15', null)).toMatch(
      /^2026-05-15T00:00:00\.000[+-]\d{2}:\d{2}$/,
    );
    expect(combineDateWithTimeOfDay('2026-05-15', undefined)).toMatch(
      /^2026-05-15T00:00:00\.000[+-]\d{2}:\d{2}$/,
    );
  });

  it('uses midnight when the reference is unparseable', () => {
    expect(combineDateWithTimeOfDay('2026-05-15', 'garbage')).toMatch(
      /^2026-05-15T00:00:00\.000[+-]\d{2}:\d{2}$/,
    );
  });

  it('falls back to now() when dayDate is invalid', () => {
    const result = combineDateWithTimeOfDay('not-a-date', '2024-06-14T22:00:00.000Z');
    // Should be a valid ISO string (default toISOString format).
    expect(() => new Date(result).toISOString()).not.toThrow();
  });

  it('preserves the time-of-day from the reference (local wall-clock)', () => {
    // The reference timestamp maps to some local hour. The result should
    // carry the SAME local hour/minute. We can't assert absolute hours
    // without controlling the test machine's TZ — but we can assert that
    // parsing the result back and reading getHours/getMinutes matches the
    // reference's getHours/getMinutes.
    const ref = '2024-06-14T22:00:00.000Z';
    const refDate = new Date(ref);
    const result = combineDateWithTimeOfDay('2026-05-15', ref);
    const resultDate = new Date(result);
    expect(resultDate.getHours()).toBe(refDate.getHours());
    expect(resultDate.getMinutes()).toBe(refDate.getMinutes());
    expect(resultDate.getSeconds()).toBe(refDate.getSeconds());
    expect(resultDate.getMilliseconds()).toBe(refDate.getMilliseconds());
    // And the calendar date in local time should be the dayDate.
    expect(resultDate.getFullYear()).toBe(2026);
    expect(resultDate.getMonth()).toBe(4); // May (0-indexed)
    expect(resultDate.getDate()).toBe(15);
  });
});
