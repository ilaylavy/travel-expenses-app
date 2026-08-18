import { newId } from './id';

describe('newId', () => {
  it('generates a string of exactly 36 characters', () => {
    const id = newId();
    expect(typeof id).toBe('string');
    expect(id.length).toBe(36);
  });

  it('matches the UUID v4 format', () => {
    const id = newId();
    // Standard UUID v4 regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('generates unique IDs', () => {
    const iterations = 10000;
    const generatedIds = new Set<string>();

    for (let i = 0; i < iterations; i++) {
      generatedIds.add(newId());
    }

    // If size matches iterations, all generated IDs were unique
    expect(generatedIds.size).toBe(iterations);
  });
});
