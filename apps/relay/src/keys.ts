// The relay's own secret and the keyed hashes made with it. The secret ("pepper") keeps three
// things apart and unguessable without it: the fake salt of an unknown handle, the stored proof of
// a passphrase and the stored form of a device token. `authKey` and a token are 32 random-looking
// bytes, so a keyed fast hash is enough here; the cost against passphrase guessing is Argon2id on
// the client, before `authKey` exists.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeBase64Url, SYNC_FIELD_BYTES } from '@anc/core';

export interface ServerKeys {
  /** The deterministic salt an unknown handle is given: the same on every ask, a function of the secret. */
  fakeSalt(handle: string): string;
  /** The stored form of a passphrase proof; compare with {@link sameDigest}. */
  authDigest(handle: string, authKey: Uint8Array): Buffer;
  /** The stored form of a device token. */
  tokenDigest(token: string): Buffer;
}

export function createServerKeys(secret: Uint8Array): ServerKeys {
  const mac = (label: string, ...parts: (string | Uint8Array)[]): Buffer => {
    const h = createHmac('sha256', secret).update(label).update('\0');
    for (const part of parts) h.update(part).update('\0');
    return h.digest();
  };
  return {
    fakeSalt: (handle) => encodeBase64Url(mac('salt', handle).subarray(0, SYNC_FIELD_BYTES.salt)),
    authDigest: (handle, authKey) => mac('auth', handle, authKey),
    tokenDigest: (token) => mac('token', token),
  };
}

/** Constant-time comparison of two digests. */
export function sameDigest(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export const newToken = (): string => encodeBase64Url(randomBytes(SYNC_FIELD_BYTES.token));

const SECRET_FILE = 'server.secret';

/**
 * The server secret: the environment's if given, else a file in the data directory created on the
 * first start (32 random bytes, hex, mode 0600) and kept, so fake salts and stored proofs survive a
 * restart. Losing the file would lock everyone out: it belongs in the volume backup.
 */
export function loadServerSecret(dataDir: string, fromEnv: string | undefined): Uint8Array {
  if (fromEnv !== undefined) return new TextEncoder().encode(fromEnv);
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const path = join(dataDir, SECRET_FILE);
  if (!existsSync(path)) {
    writeFileSync(path, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  }
  chmodSync(path, 0o600);
  const text = readFileSync(path, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/.test(text)) throw new Error('The server secret file is not valid.');
  return Buffer.from(text, 'hex');
}
