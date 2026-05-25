const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function parseIsoDate(iso: string): Date | null {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDay(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function formatDayWithYear(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function formatDateRange(
  startIso: string,
  endIso: string | null,
  ongoingLabel = 'Ongoing',
): string {
  if (!endIso) return `${formatDayWithYear(startIso)} · ${ongoingLabel}`;
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return `${startIso} – ${endIso}`;
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${formatDayWithYear(startIso)} – ${formatDayWithYear(endIso)}`;
  }
  return `${formatDay(startIso)} – ${formatDayWithYear(endIso)}`;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return parseIsoDate(value) !== null;
}

export function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// formatReadableDate is intentionally identical to formatDayWithYear; both
// names are kept during the structural reorg to avoid touching call sites.
// A later phase can pick one.
export function formatReadableDate(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function formatReadableDateRange(startIso: string, endIso: string): string {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return `${startIso} → ${endIso}`;
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
  if (sameMonth) {
    return `${MONTH_SHORT[start.getUTCMonth()]} ${start.getUTCDate()} → ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `${MONTH_SHORT[start.getUTCMonth()]} ${start.getUTCDate()} → ${MONTH_SHORT[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  return `${formatReadableDate(startIso)} → ${formatReadableDate(endIso)}`;
}

// Combine a target day (YYYY-MM-DD) with the *time-of-day* portion of a
// reference timestamp, returning an ISO string anchored at the target day's
// local midnight. Used when uploading photos/voice clips while viewing a
// specific day: the user expects the entry to land on the day they're
// looking at, but if the source has a usable time-of-day (EXIF taken
// timestamp), we keep that part so morning shots stay in the morning.
//
// referenceTime null/undefined → midnight of dayDate.
export function combineDateWithTimeOfDay(
  dayDate: string,
  referenceTime: string | null | undefined,
): string {
  // dayDate is YYYY-MM-DD. We build a local-timezone Date so the resulting
  // ISO string reflects the user's wall-clock time of day.
  const [y, m, d] = dayDate.split('-').map((v) => Number.parseInt(v, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return new Date().toISOString();
  }
  if (!referenceTime) {
    return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
  }
  const ref = new Date(referenceTime);
  if (Number.isNaN(ref.getTime())) {
    return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
  }
  return new Date(
    y,
    m - 1,
    d,
    ref.getHours(),
    ref.getMinutes(),
    ref.getSeconds(),
    ref.getMilliseconds(),
  ).toISOString();
}

export function countDaysInRange(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return 1;
  const ms = end.getTime() - start.getTime();
  const days = Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
  return days < 1 ? 1 : days;
}
