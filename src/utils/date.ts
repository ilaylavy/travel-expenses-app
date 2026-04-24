const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function parseIsoDate(iso: string): Date | null {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDay(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function formatDayWithYear(iso: string): string {
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
