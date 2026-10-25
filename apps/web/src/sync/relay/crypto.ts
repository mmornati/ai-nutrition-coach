// The keys of a relay vault (docs/encrypted-sync-plan.md §3.2):
//
//   passphrase --Argon2id(salt, SYNC_KDF)--> masterKey (32 B, never leaves this module)
//   masterKey --HKDF-SHA256(info "anc/vault/auth")--> authKey   32 B, sent to the relay to log in
//   masterKey --HKDF-SHA256(info "anc/vault/kek") --> KEK       AES-256-GCM key, never sent
//   random 32 B --------------------------------------> vaultKey seals the snapshots
//   wrappedKey = nonce(12) || AES-256-GCM(KEK, vaultKey, aad "anc/vault/wrap/v1|<vaultId>")
//
// The vault key is random, so changing the passphrase later only re-wraps it. The relay holds the
// salt, `wrappedKey` and a keyed hash of `authKey`; with those it can try passphrases offline, and
// each try costs a 64 MiB Argon2id run. The KEK is non-extractable; the master key bytes are wiped
// as soon as both HKDF outputs exist.

import {
  decodeBase64Url,
  encodeBase64Url,
  ENVELOPE_LIMITS,
  parseRelayEnvelope,
  SYNC_FIELD_BYTES,
  SYNC_KDF,
  VAULT_AUTH_INFO,
  VAULT_KEK_INFO,
  wrapAadText,
  type RelayEnvelope,
  type VaultSnapshot,
} from '@anc/core';
import { wipe } from '../../storage/bytes';
import { passphraseBytes } from '../../storage/passphrase';
import { MASTER_KEY_BYTES, type VaultKdf } from '../vault/kdf';
import { openRelayEnvelope, sealRelayEnvelope } from '../vault/envelope';
import { decodeSnapshot, encodeSnapshot, type DecodeSnapshotResult } from '../vault/snapshot-codec';

const subtle = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('WebCrypto is not available');
  return s;
};

export type RandomSource = (length: number) => Uint8Array;
export const platformRandom: RandomSource = (length) =>
  globalThis.crypto.getRandomValues(new Uint8Array(length));

export interface PassphraseKeys {
  /** 32 bytes, base64url on the wire. */
  readonly authKey: Uint8Array;
  readonly kek: CryptoKey;
}

/** Passphrase and salt to the two keys. Rejects if the KDF could not run (never a wrong key). */
export async function derivePassphraseKeys(
  kdf: VaultKdf,
  passphrase: string,
  salt: Uint8Array,
): Promise<PassphraseKeys> {
  const password = passphraseBytes(passphrase);
  let master: Uint8Array | null = null;
  try {
    master = await kdf({
      passphrase: password,
      salt,
      memoryKib: SYNC_KDF.m,
      passes: SYNC_KDF.t,
      parallelism: SYNC_KDF.p,
    });
    if (master.length !== MASTER_KEY_BYTES) throw new Error('unexpected key length');
    const base = await subtle().importKey('raw', master as BufferSource, 'HKDF', false, [
      'deriveBits',
      'deriveKey',
    ]);
    const hkdf = (info: string) => ({
      name: 'HKDF' as const,
      hash: 'SHA-256' as const,
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info),
    });
    const authBits = await subtle().deriveBits(hkdf(VAULT_AUTH_INFO), base, 256);
    const kek = await subtle().deriveKey(
      hkdf(VAULT_KEK_INFO),
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    return { authKey: new Uint8Array(authBits), kek };
  } finally {
    if (password.length > 0) wipe(password);
    if (master !== null) wipe(master);
  }
}

/** A fresh random vault key (32 bytes). The caller wipes it once imported and stored. */
export const newVaultKeyBytes = (random: RandomSource = platformRandom): Uint8Array =>
  random(SYNC_FIELD_BYTES.token);

/** The vault key as a non-extractable AES-GCM key. */
export function importVaultKey(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

const WRAP_NONCE_BYTES = 12;

/** `vaultKey` encrypted under the KEK, bound to the vault id. Base64url of nonce then ciphertext+tag. */
export async function wrapVaultKey(
  kek: CryptoKey,
  vaultId: string,
  vaultKey: Uint8Array,
  random: RandomSource = platformRandom,
): Promise<string> {
  const nonce = random(WRAP_NONCE_BYTES);
  const sealed = new Uint8Array(
    await subtle().encrypt(
      {
        name: 'AES-GCM',
        iv: nonce as BufferSource,
        additionalData: new TextEncoder().encode(wrapAadText(vaultId)) as BufferSource,
        tagLength: ENVELOPE_LIMITS.tagBytes * 8,
      },
      kek,
      vaultKey as BufferSource,
    ),
  );
  const out = new Uint8Array(nonce.length + sealed.length);
  out.set(nonce, 0);
  out.set(sealed, nonce.length);
  return encodeBase64Url(out);
}

/** The raw vault key, or `null` when the wrap does not open (damaged, or bound to another vault). */
export async function unwrapVaultKey(
  kek: CryptoKey,
  vaultId: string,
  wrapped: string,
): Promise<Uint8Array | null> {
  const bytes = decodeBase64Url(wrapped);
  if (bytes === null || bytes.length !== SYNC_FIELD_BYTES.wrappedKey) return null;
  try {
    const key = await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: bytes.subarray(0, WRAP_NONCE_BYTES) as BufferSource,
        additionalData: new TextEncoder().encode(wrapAadText(vaultId)) as BufferSource,
        tagLength: ENVELOPE_LIMITS.tagBytes * 8,
      },
      kek,
      bytes.subarray(WRAP_NONCE_BYTES) as BufferSource,
    );
    return new Uint8Array(key);
  } catch {
    return null;
  }
}

export type SealSnapshotResult =
  | { readonly kind: 'sealed'; readonly envelope: RelayEnvelope }
  | { readonly kind: 'tooLarge' }
  | { readonly kind: 'unavailable' };

/** A snapshot sealed as the relay envelope of `version` for `vaultId`. */
export async function sealSnapshot(
  key: CryptoKey,
  vaultId: string,
  version: number,
  snapshot: VaultSnapshot,
  maxCiphertextBytes: number,
  random: RandomSource = platformRandom,
): Promise<SealSnapshotResult> {
  const idBytes = decodeBase64Url(vaultId);
  if (idBytes === null) return { kind: 'unavailable' };
  const encoded = await encodeSnapshot(snapshot, maxCiphertextBytes);
  if (encoded.kind !== 'encoded') return encoded;
  try {
    const envelope = await sealRelayEnvelope({
      key,
      vaultId: idBytes,
      version,
      nonce: random(ENVELOPE_LIMITS.nonceBytes),
      plaintext: encoded.bytes,
    });
    return { kind: 'sealed', envelope };
  } catch {
    return { kind: 'unavailable' };
  }
}

export type OpenSnapshotResult =
  | { readonly kind: 'opened'; readonly snapshot: VaultSnapshot }
  /** The tag did not verify: this is not what this vault key sealed for this vault and version. */
  | { readonly kind: 'authenticationFailed' }
  | { readonly kind: 'malformed' }
  | Exclude<DecodeSnapshotResult, { kind: 'decoded' }>;

/**
 * An envelope from the relay, opened with the vault key. The envelope must name `vaultId` and
 * `version` (the associated data binds both, so a swapped or replayed envelope fails the tag).
 */
export async function openSnapshot(
  key: CryptoKey,
  envelope: unknown,
  expected: { readonly vaultId: string; readonly version: number },
  maxCiphertextBytes: number = ENVELOPE_LIMITS.maxCiphertextBytes,
): Promise<OpenSnapshotResult> {
  const parsed = parseRelayEnvelope(envelope, maxCiphertextBytes);
  if (parsed.kind === 'relayEnvelopeInvalid') {
    return parsed.problem === 'tooLarge' ? { kind: 'tooLarge' } : { kind: 'malformed' };
  }
  const { envelope: header } = parsed.parsed;
  if (header.vaultId !== expected.vaultId || header.version !== expected.version) {
    return { kind: 'authenticationFailed' };
  }
  const opened = await openRelayEnvelope(key, parsed.parsed);
  if (opened.kind === 'authenticationFailed') return opened;
  const decoded = await decodeSnapshot(opened.plaintext);
  return decoded.kind === 'decoded' ? { kind: 'opened', snapshot: decoded.snapshot } : decoded;
}
