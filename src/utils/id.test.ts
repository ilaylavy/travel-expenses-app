import { newId } from './id';
import * as crypto from 'crypto';

jest.mock('expo-crypto', () => {
  return {
    randomUUID: () => crypto.randomUUID(),
  };
});

describe('newId', () => {
  it('generates a valid v4 UUID', () => {
    const id = newId();
    // Standard UUIDv4 regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('generates unique UUIDs', () => {
    const id1 = newId();
    const id2 = newId();
    expect(id1).not.toBe(id2);
  });
});
