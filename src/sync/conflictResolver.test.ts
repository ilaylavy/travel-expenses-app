// Tests run under Jest, which doesn't honor TS moduleSuffixes — and
// shouldApplyRemote only exists on the native variant anyway, so the
// import is explicit.
import { shouldApplyRemote } from './conflictResolver.native';

describe('shouldApplyRemote', () => {
  it('applies when no local row exists', () => {
    expect(shouldApplyRemote(null, '2026-05-09T12:00:00Z')).toBe(true);
    expect(shouldApplyRemote(null, null)).toBe(true);
  });

  it('skips when remote is missing an updated_at and a local row exists', () => {
    expect(shouldApplyRemote('2026-05-09T12:00:00Z', null)).toBe(false);
  });

  it('applies when remote is strictly newer than local', () => {
    expect(
      shouldApplyRemote('2026-05-09T12:00:00Z', '2026-05-09T12:00:01Z'),
    ).toBe(true);
  });

  it('skips when remote is older or equal', () => {
    expect(
      shouldApplyRemote('2026-05-09T12:00:01Z', '2026-05-09T12:00:00Z'),
    ).toBe(false);
    expect(
      shouldApplyRemote('2026-05-09T12:00:00Z', '2026-05-09T12:00:00Z'),
    ).toBe(false);
  });

  it('compares ISO strings lexicographically (works across boundaries)', () => {
    expect(
      shouldApplyRemote('2026-05-09T23:59:59Z', '2026-05-10T00:00:00Z'),
    ).toBe(true);
    expect(
      shouldApplyRemote('2025-12-31T23:59:59Z', '2026-01-01T00:00:00Z'),
    ).toBe(true);
  });
});
