// When a journal photo is imported from a gallery, its EXIF date might be
// outside the parent trip's [start_date, end_date] range. Clamp the date
// portion to the nearest boundary while preserving the time-of-day so the
// item still slots into the timeline at the right moment of day.

export interface ClampResult {
  occurredAt: string;
  clamped: boolean;
}

export function clampOccurredAtToTrip(args: {
  occurredAt: string;          // ISO-8601
  tripStartDate: string;       // YYYY-MM-DD
  tripEndDate: string | null;  // YYYY-MM-DD or null (ongoing trip)
}): ClampResult {
  const original = new Date(args.occurredAt);
  if (Number.isNaN(original.getTime())) {
    return { occurredAt: args.occurredAt, clamped: false };
  }

  const startBoundary = new Date(`${args.tripStartDate}T00:00:00Z`);
  if (original.getTime() < startBoundary.getTime()) {
    return { occurredAt: shiftToDate(original, args.tripStartDate), clamped: true };
  }
  if (args.tripEndDate) {
    const endBoundary = new Date(`${args.tripEndDate}T23:59:59.999Z`);
    if (original.getTime() > endBoundary.getTime()) {
      return { occurredAt: shiftToDate(original, args.tripEndDate), clamped: true };
    }
  }
  return { occurredAt: args.occurredAt, clamped: false };
}

function shiftToDate(original: Date, newDateISO: string): string {
  // Preserve UTC time-of-day on the new date.
  const hours = original.getUTCHours();
  const minutes = original.getUTCMinutes();
  const seconds = original.getUTCSeconds();
  const ms = original.getUTCMilliseconds();
  const shifted = new Date(`${newDateISO}T00:00:00Z`);
  shifted.setUTCHours(hours, minutes, seconds, ms);
  return shifted.toISOString();
}
