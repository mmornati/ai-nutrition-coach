// The store header: everything needed to re-derive the key from the passphrase, stored beside the
// data. None of it is secret (the salt only has to be unique per store, the parameters are
// public) but it is integrity-relevant, so a malformed or downgraded header is refused instead of
// trusted.
//
// Format (JSON under STORE_META_KEY in localStorage, copied into IndexedDB):
//   {"v":1,"kdf":"pbkdf2-hmac-sha256","iter":600000,"pw":"nfc-utf8","salt":"<base64url>"}
//
// `pw` fixes how the passphrase becomes KDF input: Unicode NFC-normalised, then UTF-8, so the
// same visible passphrase derives the same key on every device and keyboard. A different value is
// refused.
//
// The header's existence also decides "returning user" (unlock) versus "first run" (create). It is
// written only AFTER the keyed database opened successfully.

import { STORE_FORMAT_VERSION } from './constants';
import { base64UrlDecode, base64UrlEncode } from './bytes';
import {
  KDF_MAX_ITERATIONS,
  KDF_MIN_ITERATIONS,
  KDF_PBKDF2_SHA256,
  STORE_SALT_BYTES,
  type KdfParams,
} from './kdf';

/** Passphrase encoding recorded in the header: NFC, then UTF-8. */
export const PASSPHRASE_ENCODING = 'nfc-utf8';

export interface StoreMeta {
  readonly version: number;
  readonly kdf: KdfParams;
  readonly salt: Uint8Array;
}

export function createStoreMeta(kdf: KdfParams, salt: Uint8Array): StoreMeta {
  return { version: STORE_FORMAT_VERSION, kdf, salt: new Uint8Array(salt) };
}

export function encodeStoreMeta(meta: StoreMeta): string {
  return JSON.stringify({
    v: meta.version,
    kdf: meta.kdf.name,
    iter: meta.kdf.iterations,
    pw: PASSPHRASE_ENCODING,
    salt: base64UrlEncode(meta.salt),
  });
}

export type StoreMetaRead =
  /** No header: first run (or the store was erased). */
  | { readonly kind: 'absent' }
  | { readonly kind: 'present'; readonly meta: StoreMeta }
  /** A header exists but cannot be trusted. */
  | { readonly kind: 'invalid' };

const ABSENT: StoreMetaRead = Object.freeze({ kind: 'absent' });
const INVALID: StoreMetaRead = Object.freeze({ kind: 'invalid' });

/** Parse a stored header string (from localStorage or the IndexedDB copy). */
export function parseStoreMeta(
  raw: string | null,
  minIterations: number = KDF_MIN_ITERATIONS,
): StoreMetaRead {
  if (raw === null) return ABSENT;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return INVALID;
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return INVALID;
  const o = json as Record<string, unknown>;
  const iter = o['iter'];
  const salt = o['salt'];
  if (
    o['v'] !== STORE_FORMAT_VERSION ||
    o['kdf'] !== KDF_PBKDF2_SHA256 ||
    typeof iter !== 'number' ||
    !Number.isInteger(iter) ||
    o['pw'] !== PASSPHRASE_ENCODING ||
    iter < minIterations ||
    iter > KDF_MAX_ITERATIONS ||
    typeof salt !== 'string'
  ) {
    return INVALID;
  }
  const saltBytes = base64UrlDecode(salt);
  if (saltBytes === null || saltBytes.length < STORE_SALT_BYTES) return INVALID;
  return {
    kind: 'present',
    meta: {
      version: STORE_FORMAT_VERSION,
      kdf: { name: KDF_PBKDF2_SHA256, iterations: iter },
      salt: saltBytes,
    },
  };
}
