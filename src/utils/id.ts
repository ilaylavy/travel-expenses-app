// RFC4122 v4 UUID generator that works in React Native.
// Using expo-crypto to generate cryptographically secure UUIDs instead of insecure Math.random.
import * as Crypto from 'expo-crypto';

export function newId(): string {
  return Crypto.randomUUID();
}
