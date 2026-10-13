/** Fills a fresh byte array of the given length with random bytes. */
export type RandomBytes = (length: number) => Uint8Array;

interface SecureCrypto {
  getRandomValues(array: Uint8Array): Uint8Array;
  randomUUID(): string;
}

function secureCrypto(): SecureCrypto {
  const c = (globalThis as { crypto?: Partial<SecureCrypto> }).crypto;
  if (c?.getRandomValues === undefined || c.randomUUID === undefined) {
    // Never fall back to Math.random(): sync op ids need a cryptographically secure source.
    throw new Error('No secure random source available (globalThis.crypto is missing).');
  }
  return c as SecureCrypto;
}

/** The default source: the platform CSPRNG. */
export const secureRandomBytes: RandomBytes = (length) =>
  secureCrypto().getRandomValues(new Uint8Array(length));

/**
 * RFC 4122 version-4 UUID. Without an argument it is `crypto.randomUUID()`; an injected
 * `RandomBytes` (deterministic in tests) is formatted by hand with the version and variant bits.
 */
export function generateUuidV4(random?: RandomBytes): string {
  if (random === undefined) return secureCrypto().randomUUID();
  const bytes = Uint8Array.from(random(16));
  if (bytes.length !== 16) throw new RangeError('RandomBytes must return 16 bytes');
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/** Generates ids for sync ops; injectable so tests can pin them. */
export type IdGenerator = () => string;
