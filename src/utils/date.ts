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

export function countDaysInRange(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return 1;
  const ms = end.getTime() - start.getTime();
  const days = Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
  return days < 1 ? 1 : days;
}
