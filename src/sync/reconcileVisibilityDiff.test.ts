import { diffExpenseIds, diffLostMemberships } from './reconcileVisibilityDiff';

describe('diffExpenseIds', () => {
  it('returns empty diff when local and server agree', () => {
    const result = diffExpenseIds(
      ['a', 'b', 'c'],
      new Set(['a', 'b', 'c']),
      new Set(),
    );
    expect(result).toEqual({ revoked: [], granted: [] });
  });

  it('flags local-only IDs as revoked', () => {
    // The reported bug: B has a row locally that the server (post-flip) no
    // longer returns. Reconciliation must surface it for soft-deletion.
    const result = diffExpenseIds(
      ['a', 'b', 'stale'],
      new Set(['a', 'b']),
      new Set(),
    );
    expect(result.revoked).toEqual(['stale']);
    expect(result.granted).toEqual([]);
  });

  it('flags server-only IDs as granted (cold-join / private→public)', () => {
    // Cold-join: B just became a member; the trip already had historical
    // expenses whose updated_at predates B's cursor for expenses. The cursor
    // pull skips them; reconciliation must pick them up.
    const result = diffExpenseIds(
      ['a'],
      new Set(['a', 'fresh1', 'fresh2']),
      new Set(),
    );
    expect(result.revoked).toEqual([]);
    expect(result.granted.sort()).toEqual(['fresh1', 'fresh2']);
  });

  it('excludes pending creates from the revoked set (in-flight write race)', () => {
    // Without this guard: user taps "save", enqueueSync runs, debounced
    // trigger fires triggerSync, pullChanges starts before pushChanges
    // finishes... server doesn't know about the new ID yet... reconciliation
    // would soft-delete the user's own brand-new expense.
    const result = diffExpenseIds(
      ['existing', 'pending'],
      new Set(['existing']),
      new Set(['pending']),
    );
    expect(result.revoked).toEqual([]);
    expect(result.granted).toEqual([]);
  });

  it('handles a mixed diff: revoked + granted + pending simultaneously', () => {
    const result = diffExpenseIds(
      ['keep', 'revoke-me', 'in-flight'],
      new Set(['keep', 'new-arrival']),
      new Set(['in-flight']),
    );
    expect(result.revoked).toEqual(['revoke-me']);
    expect(result.granted).toEqual(['new-arrival']);
  });

  it('returns empty diffs when both sides are empty', () => {
    const result = diffExpenseIds([], new Set(), new Set());
    expect(result).toEqual({ revoked: [], granted: [] });
  });
});

describe('diffLostMemberships', () => {
  it('returns memberships whose trip is no longer in the server set', () => {
    // Owner hard-deleted B's trip_members row; or B self-left. Local still
    // has the membership row (the cursor pull cannot surface a hard-delete
    // through the absence of an updated row), so we detect it by diffing.
    const lost = diffLostMemberships(
      [
        { tripId: 't1', tripName: 'Italy 2024' },
        { tripId: 't2', tripName: 'Japan 2025' },
      ],
      new Set(['t1']),
    );
    expect(lost).toEqual([{ tripId: 't2', tripName: 'Japan 2025' }]);
  });

  it('returns empty when membership unchanged', () => {
    // No false-positive trip-loss when nothing changed.
    const lost = diffLostMemberships(
      [{ tripId: 't1', tripName: 'Italy 2024' }],
      new Set(['t1']),
    );
    expect(lost).toEqual([]);
  });

  it('ignores trips the server has but local does not (cold-join)', () => {
    // Cold-join is a "gain" signal handled separately by the cursor pull
    // and the granted-IDs branch of diffExpenseIds — diffLostMemberships
    // intentionally does not report it.
    const lost = diffLostMemberships(
      [{ tripId: 't1', tripName: 'Italy 2024' }],
      new Set(['t1', 'newly-joined']),
    );
    expect(lost).toEqual([]);
  });

  it('returns empty when local is empty', () => {
    expect(diffLostMemberships([], new Set(['t1', 't2']))).toEqual([]);
  });
});
