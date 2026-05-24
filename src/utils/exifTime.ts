// EXIF DateTimeOriginal uses colons in the date portion, not dashes.
// expo-image-picker can return this as `exif.DateTimeOriginal` when
// `exif: true` is set on the picker call.

const EXIF_RE = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

export function parseExifDateTimeOriginal(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(EXIF_RE);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
