import * as crypto from 'expo-crypto';

// Secure RFC4122 v4 UUID generator that works in React Native without polyfills.
export function newId(): string {
  return crypto.randomUUID();
}
