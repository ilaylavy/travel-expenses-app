import { parseExifDateTimeOriginal } from './exifTime';

describe('parseExifDateTimeOriginal', () => {
  it('parses the standard EXIF format "YYYY:MM:DD HH:MM:SS"', () => {
    expect(parseExifDateTimeOriginal('2026:05:23 14:30:00')).toBe(
      new Date('2026-05-23T14:30:00').toISOString(),
    );
  });

  it('returns null for invalid strings', () => {
    expect(parseExifDateTimeOriginal('not a date')).toBeNull();
    expect(parseExifDateTimeOriginal('')).toBeNull();
    expect(parseExifDateTimeOriginal(null)).toBeNull();
    expect(parseExifDateTimeOriginal(undefined)).toBeNull();
  });

  it('returns null for malformed numeric values', () => {
    expect(parseExifDateTimeOriginal('2026:13:50 25:99:99')).toBeNull();
  });
});
