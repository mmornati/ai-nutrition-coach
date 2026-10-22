// The vault envelope: the one encrypted container a snapshot travels in, whether it is a backup
// file (phase S1) or, later, the body the relay stores (S2). This module is the pure half: the
// shape, the strict parser for untrusted input and the associated data. No WebCrypto, no DOM, so
// the relay can share it; sealing and opening live in apps/web/src/sync/vault.
//
//   { v: 1, vaultId, version, alg: "A256GCM",
//     kdf: { name: "argon2id", v: 19, m, t, p }, salt, nonce, ct }
//
// - `ct` is AES-256-GCM over the gzip of the canonical snapshot JSON (the tag is its last 16 bytes).
// - The associated data is every field EXCEPT `ct`, serialised with sorted keys (`envelopeAadText`).
//   Any edit of the header (another vault's id, an older `version`, a weaker KDF, another salt or
//   nonce) therefore fails authentication; nothing in the header is trusted on its own.
// - For a backup FILE, `vaultId` is 16 fresh random bytes per file and `version` is 1. They have
//   their relay meaning in S2 (which vault, and the compare-and-swap counter); the file simply
//   fixes them so the two formats are one.
// - Binary fields are base64url without padding, in canonical form (re-encoding the decoded bytes
//   gives the input back), so one byte string has one spelling.
//
// The parser never throws and never carries a value of the input in its answer: a problem code and
// a content-free path.

export const ENVELOPE_VERSION = 1;
export const ENVELOPE_ALG = 'A256GCM';
export const KDF_NAME = 'argon2id';
/** Argon2 version 0x13. */
export const KDF_VERSION = 19;

export interface EnvelopeKdf {
  readonly name: typeof KDF_NAME;
  readonly v: typeof KDF_VERSION;
  /** Memory in KiB. */
  readonly m: number;
  /** Passes. */
  readonly t: number;
  /** Lanes. */
  readonly p: number;
}

/** Every field the associated data covers: all of them but the ciphertext. */
export interface VaultEnvelopeHeader {
  readonly v: typeof ENVELOPE_VERSION;
  /** Base64url of 16 bytes. */
  readonly vaultId: string;
  /** A positive safe integer. */
  readonly version: number;
  readonly alg: typeof ENVELOPE_ALG;
  readonly kdf: EnvelopeKdf;
  /** Base64url of 16 bytes: the KDF salt. */
  readonly salt: string;
  /** Base64url of 12 bytes: the AES-GCM nonce. */
  readonly nonce: string;
}

export interface VaultEnvelope extends VaultEnvelopeHeader {
  /** Base64url of the ciphertext followed by the 16-byte tag. */
  readonly ct: string;
}

/**
 * The most an envelope may ask of the reader and hold. The cost bounds are both ways: below the
 * floor is a downgrade (an attacker who can edit a file would otherwise make the passphrase cheap
 * to guess, and a file made by a weaker build must not be believed), above the ceiling is a
 * denial of service (a file that asks for gigabytes of memory).
 */
export const ENVELOPE_LIMITS = Object.freeze({
  vaultIdBytes: 16,
  saltBytes: 16,
  nonceBytes: 12,
  tagBytes: 16,
  /** KiB: 64 MiB is what this app uses; below is refused. */
  minMemory: 65_536,
  /** KiB: 256 MiB. */
  maxMemory: 262_144,
  minPasses: 3,
  maxPasses: 10,
  parallelism: 1,
  /** The whole file, JSON text included. Checked before the file is read into memory. */
  maxFileBytes: 32 * 1024 * 1024,
  /** The ciphertext (tag included) once decoded. */
  maxCiphertextBytes: 24 * 1024 * 1024,
  /** The gzip output: a hostile file cannot inflate beyond this. */
  maxPlaintextBytes: 96 * 1024 * 1024,
});

/** The parameters this build seals with. */
export const BACKUP_KDF: EnvelopeKdf = Object.freeze({
  name: KDF_NAME,
  v: KDF_VERSION,
  m: ENVELOPE_LIMITS.minMemory,
  t: ENVELOPE_LIMITS.minPasses,
  p: ENVELOPE_LIMITS.parallelism,
});

// ---------------------------------------------------------------------------------------------
// base64url (RFC 4648 section 5), no padding, canonical

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REVERSE: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries([...ALPHABET].map((c, i) => [c, i])),
);

export function encodeBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]!;
  }
  return out;
}

/**
 * The bytes of a canonical base64url string, or `null`: a character outside the alphabet
 * (padding, `+`, `/`, whitespace included), an impossible length, or non-zero trailing bits.
 */
export function decodeBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let at = 0;
  for (const ch of text) {
    const value = REVERSE[ch];
    if (value === undefined) return null;
    acc = (acc << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (acc >> bits) & 0xff;
      acc &= (1 << bits) - 1;
    }
  }
  // Canonical: the unused trailing bits are zero, so re-encoding gives the same text.
  if (acc !== 0) return null;
  return at === out.length ? out : null;
}

// ---------------------------------------------------------------------------------------------
// Associated data

/**
 * The text the AEAD authenticates (UTF-8 encode it; it is ASCII): every header field, keys sorted
 * at every level, no whitespace. The same text on every device and in the relay.
 */
export function envelopeAadText(header: VaultEnvelopeHeader): string {
  const { kdf } = header;
  return JSON.stringify({
    alg: header.alg,
    kdf: { m: kdf.m, name: kdf.name, p: kdf.p, t: kdf.t, v: kdf.v },
    nonce: header.nonce,
    salt: header.salt,
    v: header.v,
    vaultId: header.vaultId,
    version: header.version,
  });
}

/** The envelope as the text of a backup file: the documented field order, one JSON object. */
export function serializeEnvelope(envelope: VaultEnvelope): string {
  const { kdf } = envelope;
  return JSON.stringify({
    v: envelope.v,
    vaultId: envelope.vaultId,
    version: envelope.version,
    alg: envelope.alg,
    kdf: { name: kdf.name, v: kdf.v, m: kdf.m, t: kdf.t, p: kdf.p },
    salt: envelope.salt,
    nonce: envelope.nonce,
    ct: envelope.ct,
  });
}

// ---------------------------------------------------------------------------------------------
// The strict parser (untrusted input: a backup file, a server response)

export type VaultEnvelopeProblem =
  | 'notAnObject'
  /** `v` is a whole number above the one this build reads: written by a newer app. */
  | 'newerFormat'
  | 'malformed'
  | 'unsupportedAlgorithm'
  /** The KDF costs less than the floor. */
  | 'kdfDowngrade'
  /** The KDF costs more than the ceiling. */
  | 'kdfTooCostly'
  | 'tooLarge';

/** The header and the decoded bytes the cipher needs. */
export interface ParsedVaultEnvelope {
  readonly envelope: VaultEnvelope;
  readonly salt: Uint8Array;
  readonly nonce: Uint8Array;
  /** Ciphertext with the tag at the end. */
  readonly ciphertext: Uint8Array;
}

export type VaultEnvelopeParseResult =
  | { readonly kind: 'vaultEnvelopeParsed'; readonly parsed: ParsedVaultEnvelope }
  | {
      readonly kind: 'vaultEnvelopeInvalid';
      readonly problem: VaultEnvelopeProblem;
      /** Content-free, such as `$.kdf.m`. */
      readonly path: string;
    };

const invalid = (problem: VaultEnvelopeProblem, path: string): VaultEnvelopeParseResult => ({
  kind: 'vaultEnvelopeInvalid',
  problem,
  path,
});

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Exactly these keys, no more, no fewer. */
const hasExactKeys = (value: Json, keys: readonly string[]): boolean => {
  const have = Object.keys(value);
  return have.length === keys.length && keys.every((k) => Object.hasOwn(value, k));
};

const isWhole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** The exact field sets of an envelope and of its `kdf`. The associated data must cover all but `ct`. */
export const ENVELOPE_KEYS: readonly string[] = [
  'v',
  'vaultId',
  'version',
  'alg',
  'kdf',
  'salt',
  'nonce',
  'ct',
];
export const KDF_KEYS: readonly string[] = ['name', 'v', 'm', 't', 'p'];

/**
 * Strictly reads an envelope. The order of the checks is the order of the risk: shape, then format
 * version (so a newer app's file is named as such), then the cheap fixed fields, then the KDF
 * bounds (before anything can be derived), then the sizes of the binary fields. Nothing here
 * touches a key.
 */
export function parseVaultEnvelope(input: unknown): VaultEnvelopeParseResult {
  if (!isRecord(input)) return invalid('notAnObject', '$');
  const version = input['v'];
  if (isWhole(version) && version > ENVELOPE_VERSION) return invalid('newerFormat', '$.v');
  if (!hasExactKeys(input, ENVELOPE_KEYS)) return invalid('malformed', '$');
  if (version !== ENVELOPE_VERSION) return invalid('malformed', '$.v');

  const recordVersion = input['version'];
  if (!isWhole(recordVersion) || recordVersion < 1) return invalid('malformed', '$.version');
  if (input['alg'] !== ENVELOPE_ALG) return invalid('unsupportedAlgorithm', '$.alg');

  const kdf = input['kdf'];
  if (!isRecord(kdf) || !hasExactKeys(kdf, KDF_KEYS)) return invalid('malformed', '$.kdf');
  if (kdf['name'] !== KDF_NAME) return invalid('unsupportedAlgorithm', '$.kdf.name');
  if (kdf['v'] !== KDF_VERSION) return invalid('unsupportedAlgorithm', '$.kdf.v');
  const { m, t, p } = kdf;
  if (!isWhole(m)) return invalid('malformed', '$.kdf.m');
  if (!isWhole(t)) return invalid('malformed', '$.kdf.t');
  if (p !== ENVELOPE_LIMITS.parallelism) return invalid('malformed', '$.kdf.p');
  if (m < ENVELOPE_LIMITS.minMemory) return invalid('kdfDowngrade', '$.kdf.m');
  if (t < ENVELOPE_LIMITS.minPasses) return invalid('kdfDowngrade', '$.kdf.t');
  if (m > ENVELOPE_LIMITS.maxMemory) return invalid('kdfTooCostly', '$.kdf.m');
  if (t > ENVELOPE_LIMITS.maxPasses) return invalid('kdfTooCostly', '$.kdf.t');

  const binary = (key: string, bytes: number): Uint8Array | null => {
    const text = input[key];
    // An upper bound on the text before it is decoded: the exact length for a fixed field.
    if (typeof text !== 'string' || text.length !== Math.ceil((bytes * 4) / 3)) return null;
    const decoded = decodeBase64Url(text);
    return decoded !== null && decoded.length === bytes ? decoded : null;
  };
  const vaultId = binary('vaultId', ENVELOPE_LIMITS.vaultIdBytes);
  if (vaultId === null) return invalid('malformed', '$.vaultId');
  const salt = binary('salt', ENVELOPE_LIMITS.saltBytes);
  if (salt === null) return invalid('malformed', '$.salt');
  const nonce = binary('nonce', ENVELOPE_LIMITS.nonceBytes);
  if (nonce === null) return invalid('malformed', '$.nonce');

  const ct = input['ct'];
  if (typeof ct !== 'string') return invalid('malformed', '$.ct');
  // The bound is on the text, before a buffer is made for it.
  if (ct.length > Math.ceil((ENVELOPE_LIMITS.maxCiphertextBytes * 4) / 3)) {
    return invalid('tooLarge', '$.ct');
  }
  const ciphertext = decodeBase64Url(ct);
  if (ciphertext === null || ciphertext.length < ENVELOPE_LIMITS.tagBytes) {
    return invalid('malformed', '$.ct');
  }
  if (ciphertext.length > ENVELOPE_LIMITS.maxCiphertextBytes) return invalid('tooLarge', '$.ct');

  return {
    kind: 'vaultEnvelopeParsed',
    parsed: {
      envelope: {
        v: ENVELOPE_VERSION,
        vaultId: input['vaultId'] as string,
        version: recordVersion,
        alg: ENVELOPE_ALG,
        kdf: { name: KDF_NAME, v: KDF_VERSION, m, t, p: ENVELOPE_LIMITS.parallelism },
        salt: input['salt'] as string,
        nonce: input['nonce'] as string,
        ct,
      },
      salt,
      nonce,
      ciphertext,
    },
  };
}
