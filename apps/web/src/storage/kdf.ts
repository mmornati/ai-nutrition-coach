// Passphrase -> key derivation for the web store.
//
// The store is keyed from a user passphrase, so the KDF is the only thing standing between an
// offline attacker (who can copy the browser's origin storage) and the data: its cost is the
// whole defence against guessing.
//
//   - PBKDF2-HMAC-SHA256, the only password KDF WebCrypto ships. 600,000 iterations (OWASP's
//     2023+ floor for this construction), 32-byte output, random 16-byte per-store salt.
//   - It runs through `crypto.subtle.deriveBits`: native code, off the JS loop, so the UI does
//     not freeze. The derivation happens inside the store worker, so the key never exists on the
//     main thread.
//   - `crypto.subtle` is undefined outside a secure context (plain HTTP); that is reported as
//     "unavailable", never as a wrong passphrase.

import { wipe } from './bytes';
import { StoreUnavailableError } from './errors';

export const KDF_PBKDF2_SHA256 = 'pbkdf2-hmac-sha256';

/** Iteration count used for NEW stores. */
export const KDF_ITERATIONS = 600_000;

/** Lowest iteration count a stored header may carry. A header below it is refused. */
export const KDF_MIN_ITERATIONS = 600_000;

/**
 * Highest iteration count a stored header may carry. A tampered header asking for billions of
 * iterations would freeze the worker (a denial of service on unlock); one above it is refused.
 */
export const KDF_MAX_ITERATIONS = 10_000_000;

/** Per-store random salt length in bytes. */
export const STORE_SALT_BYTES = 16;

/** Derived key length in bytes (a 256-bit sqlite3mc ChaCha20 key). */
export const SESSION_KEY_BYTES = 32;

export interface KdfParams {
  readonly name: string;
  readonly iterations: number;
}

export const DEFAULT_KDF_PARAMS: KdfParams = Object.freeze({
  name: KDF_PBKDF2_SHA256,
  iterations: KDF_ITERATIONS,
});

/** Derives the store key. Takes UTF-8 BYTES so the caller can wipe its buffer afterwards. */
export type DeriveKey = (
  passphrase: Uint8Array,
  salt: Uint8Array,
  params: KdfParams,
) => Promise<Uint8Array>;

export const deriveKeyWithWebCrypto: DeriveKey = async (passphrase, salt, params) => {
  if (params.name !== KDF_PBKDF2_SHA256) throw new StoreUnavailableError('storage');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new StoreUnavailableError('insecureContext');
  // Copies: WebCrypto wants plain ArrayBuffer-backed views, and the caller wipes its own.
  const copy = new Uint8Array(passphrase);
  let keyMaterial: CryptoKey;
  try {
    keyMaterial = await subtle.importKey('raw', copy, 'PBKDF2', false, ['deriveBits']);
  } finally {
    wipe(copy);
  }
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations: params.iterations },
    keyMaterial,
    SESSION_KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
};

/** True when WebCrypto's SubtleCrypto exists (a secure context). */
export function isSecureCryptoAvailable(): boolean {
  return typeof globalThis.crypto?.subtle === 'object';
}
