// The wire format of the sync relay (docs/encrypted-sync-plan.md §3.5, ADR 0007 "Phase S2"), shared
// by the relay (apps/relay) and the app so the two cannot drift. Pure: shapes, strict parsers for
// untrusted JSON on BOTH sides, the handle rules and the ETag spelling. No network, no crypto.
//
// What the relay is ever sent, and all of it is opaque to it:
//   handle      the person's chosen name for the vault (not an email)
//   salt        16 random bytes: the Argon2id salt of the passphrase
//   authKey     32 bytes derived from the passphrase (HKDF "anc/vault/auth"): proves the passphrase
//               without revealing it; the relay stores only a keyed hash of it
//   wrappedKey  the random vault key encrypted under the passphrase-derived KEK (AES-256-GCM)
//   envelope    the sealed snapshot (relay variant of the vault envelope)
// Nothing else is accepted: every parser checks an exact field set.

import {
  BACKUP_KDF,
  decodeBase64Url,
  ENVELOPE_LIMITS,
  parseRelayEnvelope,
  type EnvelopeKdf,
  type RelayEnvelope,
  type RelayEnvelopeProblem,
} from './envelope';

export const SYNC_CONFIG_PATH = '/sync/config.json';
export const SYNC_API_BASE = '/sync/v1';

/** The Argon2id cost every vault uses; the relay advertises exactly this for every handle. */
export const SYNC_KDF: EnvelopeKdf = BACKUP_KDF;

export const SYNC_FIELD_BYTES = Object.freeze({
  salt: 16,
  authKey: 32,
  /** 12-byte nonce + 32-byte key + 16-byte tag. */
  wrappedKey: 60,
  /** Device token: 32 random bytes. */
  token: 32,
});

export const SYNC_SIGNUP_MODES = ['open', 'invite', 'closed'] as const;
export type SyncSignupMode = (typeof SYNC_SIGNUP_MODES)[number];

/** The most one signup, login or salt request may weigh: they carry no snapshot. */
export const SYNC_SMALL_BODY_BYTES = 2048;
export const SYNC_DEFAULT_MAX_VAULT_MB = 20;
/** The relay cannot be asked to hold more than an envelope may carry. */
export const SYNC_MAX_VAULT_MB_CEILING = Math.floor(
  ENVELOPE_LIMITS.maxCiphertextBytes / (1024 * 1024),
);

/** Largest request body that can carry a ciphertext of `maxVaultBytes`, base64url and JSON included. */
export const syncBodyCap = (maxVaultBytes: number): number =>
  Math.ceil((maxVaultBytes * 4) / 3) + SYNC_SMALL_BODY_BYTES;

// ---------------------------------------------------------------------------------------------
// Handles

/** 3 to 32 characters of a-z 0-9 . _ -, starting with a letter or digit. */
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/**
 * The handle as the app and the relay both spell it: trimmed and lower-cased. `null` when it is
 * not a handle. The relay applies the same rule to what it receives and rejects (rather than
 * fixes) anything that is not already in this form.
 */
export function normalizeHandle(input: string): string | null {
  const handle = input.trim().toLowerCase();
  return HANDLE_PATTERN.test(handle) ? handle : null;
}

// ---------------------------------------------------------------------------------------------
// Small helpers

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const hasExactKeys = (value: Json, keys: readonly string[]): boolean => {
  const have = Object.keys(value);
  return have.length === keys.length && keys.every((k) => Object.hasOwn(value, k));
};
const hasOnlyKeys = (
  value: Json,
  required: readonly string[],
  optional: readonly string[],
): boolean =>
  required.every((k) => Object.hasOwn(value, k)) &&
  Object.keys(value).every((k) => required.includes(k) || optional.includes(k));

/** A canonical base64url string of exactly `bytes` bytes, or null. */
export function fixedBase64Url(value: unknown, bytes: number): string | null {
  if (typeof value !== 'string' || value.length !== Math.ceil((bytes * 4) / 3)) return null;
  const decoded = decodeBase64Url(value);
  return decoded !== null && decoded.length === bytes ? value : null;
}

const isWhole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

// ---------------------------------------------------------------------------------------------
// ETag / If-Match: the version, quoted

export const etagOf = (version: number): string => `"${version}"`;

/** The version an ETag / If-Match / If-None-Match value names (`"7"`), or null. A weak tag or a list is not ours. */
export function versionOfEtag(header: string | null | undefined): number | null {
  if (typeof header !== 'string') return null;
  const match = /^"(0|[1-9][0-9]{0,15})"$/.exec(header.trim());
  if (match === null) return null;
  const version = Number(match[1]);
  return Number.isSafeInteger(version) ? version : null;
}

// ---------------------------------------------------------------------------------------------
// Errors the relay answers with (a code, never a message with content)

export type SyncErrorCode =
  /** No vault matches this handle and authKey. One answer for "no such handle" and "wrong passphrase". */
  | 'noMatch'
  | 'rateLimited'
  | 'handleTaken'
  | 'signupClosed'
  | 'inviteInvalid'
  | 'serverFull'
  | 'unauthorized'
  | 'invalidRequest'
  | 'tooLarge'
  | 'unsupportedMediaType'
  | 'preconditionRequired'
  /** `If-Match` named a version that is not the current one: pull, merge, retry. */
  | 'versionConflict'
  | 'notFound'
  | 'methodNotAllowed'
  | 'unavailable';

export interface SyncErrorBody {
  readonly error: SyncErrorCode;
  /** Only with `versionConflict`: the version the vault is at now. */
  readonly version?: number;
}

// ---------------------------------------------------------------------------------------------
// /sync/config.json

/** What the relay tells the app before any login: is sync offered, and under what terms. */
export interface SyncConfigBody {
  readonly enabled: true;
  readonly v: 1;
  readonly identity: 'handle';
  readonly signup: SyncSignupMode;
  readonly maxVaultMb: number;
}

export type SyncOffer =
  | { readonly offered: false }
  | { readonly offered: true; readonly signup: SyncSignupMode; readonly maxVaultMb: number };

export const SYNC_NOT_OFFERED: SyncOffer = Object.freeze({ offered: false });

/**
 * Reads `/sync/config.json` strictly, like `/ai/config.json`: anything that is not exactly this
 * shape is "not offered" and the app shows nothing about sync. A server that offers a newer
 * protocol (`v` above 1) or another identity mode is, for this app, not offering anything it can use.
 */
export function parseSyncConfig(value: unknown): SyncOffer {
  if (!isRecord(value)) return SYNC_NOT_OFFERED;
  if (value['enabled'] !== true || value['v'] !== 1 || value['identity'] !== 'handle') {
    return SYNC_NOT_OFFERED;
  }
  const signup = value['signup'];
  if (!SYNC_SIGNUP_MODES.includes(signup as SyncSignupMode)) return SYNC_NOT_OFFERED;
  const mb = value['maxVaultMb'];
  if (!isWhole(mb) || mb < 1 || mb > SYNC_MAX_VAULT_MB_CEILING) return SYNC_NOT_OFFERED;
  return { offered: true, signup: signup as SyncSignupMode, maxVaultMb: mb };
}

// ---------------------------------------------------------------------------------------------
// Requests (parsed by the relay; built by the app)

export interface SaltRequest {
  readonly handle: string;
}
export interface LoginRequest {
  readonly handle: string;
  readonly authKey: string;
}
export interface SignupRequest {
  readonly handle: string;
  readonly salt: string;
  readonly authKey: string;
  readonly wrappedKey: string;
  readonly envelope: RelayEnvelope;
  readonly invite?: string;
}
export interface PutVaultRequest {
  readonly envelope: RelayEnvelope;
}

export type RequestParse<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'tooLarge' };

const INVALID: { readonly kind: 'invalid' } = { kind: 'invalid' };
const ok = <T>(value: T): RequestParse<T> => ({ kind: 'ok', value });

export const INVITE_PATTERN = /^[A-Za-z0-9._~-]{4,64}$/;

function handleOf(value: unknown): string | null {
  return typeof value === 'string' && HANDLE_PATTERN.test(value) ? value : null;
}

export function parseSaltRequest(input: unknown): RequestParse<SaltRequest> {
  if (!isRecord(input) || !hasExactKeys(input, ['handle'])) return INVALID;
  const handle = handleOf(input['handle']);
  return handle === null ? INVALID : ok({ handle });
}

export function parseLoginRequest(input: unknown): RequestParse<LoginRequest> {
  if (!isRecord(input) || !hasExactKeys(input, ['handle', 'authKey'])) return INVALID;
  const handle = handleOf(input['handle']);
  const authKey = fixedBase64Url(input['authKey'], SYNC_FIELD_BYTES.authKey);
  return handle === null || authKey === null ? INVALID : ok({ handle, authKey });
}

function envelopeOf(value: unknown, maxCiphertextBytes: number): RequestParse<RelayEnvelope> {
  const parsed = parseRelayEnvelope(value, maxCiphertextBytes);
  if (parsed.kind === 'relayEnvelopeParsed') return ok(parsed.parsed.envelope);
  return parsed.problem === 'tooLarge' ? { kind: 'tooLarge' } : INVALID;
}

export function parseSignupRequest(
  input: unknown,
  maxCiphertextBytes: number,
): RequestParse<SignupRequest> {
  if (!isRecord(input)) return INVALID;
  if (!hasOnlyKeys(input, ['handle', 'salt', 'authKey', 'wrappedKey', 'envelope'], ['invite'])) {
    return INVALID;
  }
  const handle = handleOf(input['handle']);
  const salt = fixedBase64Url(input['salt'], SYNC_FIELD_BYTES.salt);
  const authKey = fixedBase64Url(input['authKey'], SYNC_FIELD_BYTES.authKey);
  const wrappedKey = fixedBase64Url(input['wrappedKey'], SYNC_FIELD_BYTES.wrappedKey);
  if (handle === null || salt === null || authKey === null || wrappedKey === null) return INVALID;
  const invite = input['invite'];
  if (invite !== undefined && (typeof invite !== 'string' || !INVITE_PATTERN.test(invite))) {
    return INVALID;
  }
  const envelope = envelopeOf(input['envelope'], maxCiphertextBytes);
  if (envelope.kind !== 'ok') return envelope;
  // A new vault starts at version 1.
  if (envelope.value.version !== 1) return INVALID;
  return ok({
    handle,
    salt,
    authKey,
    wrappedKey,
    envelope: envelope.value,
    ...(invite === undefined ? {} : { invite }),
  });
}

export function parsePutVaultRequest(
  input: unknown,
  maxCiphertextBytes: number,
): RequestParse<PutVaultRequest> {
  if (!isRecord(input) || !hasExactKeys(input, ['envelope'])) return INVALID;
  const envelope = envelopeOf(input['envelope'], maxCiphertextBytes);
  return envelope.kind === 'ok' ? ok({ envelope: envelope.value }) : envelope;
}

// ---------------------------------------------------------------------------------------------
// Responses (parsed by the app: the relay is untrusted)

export interface SaltResponse {
  readonly salt: string;
  readonly kdf: EnvelopeKdf;
}
export interface SessionResponse {
  readonly token: string;
  readonly vaultId: string;
  readonly wrappedKey: string;
  readonly version: number;
}
export interface VaultResponse {
  readonly vaultId: string;
  readonly version: number;
  readonly envelope: RelayEnvelope;
}

/** The KDF a salt response names must be exactly the one this build uses: no downgrade, no surprise cost. */
export function parseSaltResponse(input: unknown): SaltResponse | null {
  if (!isRecord(input) || !hasExactKeys(input, ['salt', 'kdf'])) return null;
  const salt = fixedBase64Url(input['salt'], SYNC_FIELD_BYTES.salt);
  const kdf = input['kdf'];
  if (salt === null || !isRecord(kdf) || !hasExactKeys(kdf, ['name', 'v', 'm', 't', 'p'])) {
    return null;
  }
  if (
    kdf['name'] !== SYNC_KDF.name ||
    kdf['v'] !== SYNC_KDF.v ||
    kdf['m'] !== SYNC_KDF.m ||
    kdf['t'] !== SYNC_KDF.t ||
    kdf['p'] !== SYNC_KDF.p
  ) {
    return null;
  }
  return { salt, kdf: SYNC_KDF };
}

export function parseSessionResponse(input: unknown): SessionResponse | null {
  if (!isRecord(input) || !hasExactKeys(input, ['token', 'vaultId', 'wrappedKey', 'version'])) {
    return null;
  }
  const token = fixedBase64Url(input['token'], SYNC_FIELD_BYTES.token);
  const vaultId = fixedBase64Url(input['vaultId'], ENVELOPE_LIMITS.vaultIdBytes);
  const wrappedKey = fixedBase64Url(input['wrappedKey'], SYNC_FIELD_BYTES.wrappedKey);
  const version = input['version'];
  if (token === null || vaultId === null || wrappedKey === null) return null;
  if (!isWhole(version) || version < 1) return null;
  return { token, vaultId, wrappedKey, version };
}

export type VaultResponseParse =
  | { readonly kind: 'ok'; readonly value: VaultResponse }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'newerFormat' }
  | { readonly kind: 'tooLarge' };

export function parseVaultResponse(input: unknown, maxCiphertextBytes: number): VaultResponseParse {
  if (!isRecord(input) || !hasExactKeys(input, ['vaultId', 'version', 'envelope'])) {
    return { kind: 'invalid' };
  }
  const vaultId = fixedBase64Url(input['vaultId'], ENVELOPE_LIMITS.vaultIdBytes);
  const version = input['version'];
  if (vaultId === null || !isWhole(version) || version < 1) return { kind: 'invalid' };
  const parsed = parseRelayEnvelope(input['envelope'], maxCiphertextBytes);
  if (parsed.kind === 'relayEnvelopeInvalid') {
    const problem: RelayEnvelopeProblem = parsed.problem;
    if (problem === 'newerFormat') return { kind: 'newerFormat' };
    return problem === 'tooLarge' ? { kind: 'tooLarge' } : { kind: 'invalid' };
  }
  const { envelope } = parsed.parsed;
  // The record, the envelope and the answer must agree about which vault and which version.
  if (envelope.vaultId !== vaultId || envelope.version !== version) return { kind: 'invalid' };
  return { kind: 'ok', value: { vaultId, version, envelope } };
}

export function parsePutResponse(input: unknown): { readonly version: number } | null {
  if (!isRecord(input) || !hasExactKeys(input, ['version'])) return null;
  const version = input['version'];
  return isWhole(version) && version >= 1 ? { version } : null;
}

// ---------------------------------------------------------------------------------------------
// Key separation (the crypto itself is WebCrypto, in apps/web/src/sync/relay)

/** HKDF-SHA256 `info` (empty salt) for the value that proves the passphrase to the relay. */
export const VAULT_AUTH_INFO = 'anc/vault/auth';
/** HKDF-SHA256 `info` (empty salt) for the key-encryption key that wraps the vault key. */
export const VAULT_KEK_INFO = 'anc/vault/kek';
/**
 * Associated data of the vault-key wrap (AES-256-GCM under the KEK): the text, then the vault id, so
 * a wrapped key cannot be moved to another vault. Wrapped form: base64url of nonce (12) + key
 * ciphertext (32) + tag (16).
 */
export const wrapAadText = (vaultId: string): string => `anc/vault/wrap/v1|${vaultId}`;
