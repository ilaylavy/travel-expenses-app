import { newId } from './id';

describe('newId', () => {
  it('should return a string of length 36', () => {
    const id = newId();
    expect(id).toHaveLength(36);
  });

  it('should return a valid UUID v4', () => {
    const id = newId();
    // UUID v4 regex: 8-4-4-4-12 hex digits, with a '4' at the 13th position
    // and an '8', '9', 'a', or 'b' at the 17th position.
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidV4Regex);
  });

  it('should generate unique IDs', () => {
    const ids = new Set();
    const NUM_IDS = 10000;

    for (let i = 0; i < NUM_IDS; i++) {
      ids.add(newId());
    }

    // If the set size is equal to NUM_IDS, all generated IDs were unique
    expect(ids.size).toBe(NUM_IDS);
  });

  it('should contain hyphens at correct indices', () => {
    const id = newId();
    expect(id.charAt(8)).toBe('-');
    expect(id.charAt(13)).toBe('-');
    expect(id.charAt(18)).toBe('-');
    expect(id.charAt(23)).toBe('-');
  });
});
