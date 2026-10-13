import { newId } from './id';

import { randomUUID } from 'crypto';

// Mock expo-crypto as it is a native module that won't run natively in jest by default
jest.mock('expo-crypto', () => {
  return {
    // using node crypto for the test to still generate valid random v4 uuids
    randomUUID,
  };
});

describe('newId', () => {
  it('should generate a valid UUIDv4 string', () => {
    const id = newId();
    // UUIDv4 regex pattern
    const uuidv4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidv4Pattern);
  });

  it('should generate unique IDs', () => {
    const id1 = newId();
    const id2 = newId();
    expect(id1).not.toBe(id2);
  });
});
