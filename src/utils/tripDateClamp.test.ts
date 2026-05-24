import { clampOccurredAtToTrip } from './tripDateClamp';

describe('clampOccurredAtToTrip', () => {
  it('returns occurredAt unchanged when within range', () => {
    expect(
      clampOccurredAtToTrip({
        occurredAt: '2026-05-15T10:00:00Z',
        tripStartDate: '2026-05-10',
        tripEndDate: '2026-05-20',
      }),
    ).toEqual({ occurredAt: '2026-05-15T10:00:00Z', clamped: false });
  });

  it('clamps to start when too early', () => {
    expect(
      clampOccurredAtToTrip({
        occurredAt: '2026-05-01T08:00:00Z',
        tripStartDate: '2026-05-10',
        tripEndDate: '2026-05-20',
      }),
    ).toEqual({ occurredAt: '2026-05-10T08:00:00.000Z', clamped: true });
  });

  it('clamps to end when too late', () => {
    expect(
      clampOccurredAtToTrip({
        occurredAt: '2026-06-01T20:00:00Z',
        tripStartDate: '2026-05-10',
        tripEndDate: '2026-05-20',
      }),
    ).toEqual({ occurredAt: '2026-05-20T20:00:00.000Z', clamped: true });
  });

  it('does not clamp upper bound when trip is ongoing (no end date)', () => {
    expect(
      clampOccurredAtToTrip({
        occurredAt: '2099-01-01T00:00:00Z',
        tripStartDate: '2026-05-10',
        tripEndDate: null,
      }),
    ).toEqual({ occurredAt: '2099-01-01T00:00:00Z', clamped: false });
  });

  it('passes through an invalid date string unchanged', () => {
    expect(
      clampOccurredAtToTrip({
        occurredAt: 'not-a-date',
        tripStartDate: '2026-05-10',
        tripEndDate: '2026-05-20',
      }),
    ).toEqual({ occurredAt: 'not-a-date', clamped: false });
  });
});
