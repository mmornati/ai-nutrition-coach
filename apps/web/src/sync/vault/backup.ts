// The encrypted backup: a whole vault snapshot sealed into one file, and the way back.
//
//   seal:  snapshot -> canonical JSON -> UTF-8 -> gzip -> AES-256-GCM (key from the passphrase,
//          header bound as associated data) -> envelope JSON -> bytes of a `.ancvault` file
//   open:  bytes -> (size cap) -> JSON -> strict envelope parser (KDF bounds!) -> Argon2id ->
//          AES-GCM -> gunzip (output cap) -> JSON -> strict snapshot parser
//
// Every step can refuse, every refusal is a typed outcome and NOTHING is written anywhere: the
// caller gets a validated snapshot or a reason, never a partial one. The outcomes keep apart what
// the code can honestly tell apart and no more: GCM cannot say whether the passphrase was wrong or
// the file was damaged, so there is one outcome for both.
//
// File vs relay (phase S2): a file's `vaultId` is 16 fresh random bytes and its `version` is 1.
// The relay gives them their meaning (which vault, and the compare-and-swap counter); the format
// is the same, so the same opener reads both once it is handed the right key.

import {
  BACKUP_KDF,
  ENVELOPE_LIMITS,
  parseVaultEnvelope,
  serializeEnvelope,
  type VaultEnvelopeProblem,
  type VaultSnapshot,
} from '@anc/core';
import { sealEnvelope, openEnvelope } from './envelope';
import { decodeSnapshot, encodeSnapshot } from './snapshot-codec';
import { deriveBackupKey, type VaultKdf } from './kdf';

export type SealBackupResult =
  | { readonly kind: 'sealed'; readonly bytes: Uint8Array }
  /** More than a backup file may hold (see ENVELOPE_LIMITS). */
  | { readonly kind: 'tooLarge' }
  /** The key derivation or the cipher could not run (no WebCrypto, no worker, no memory). */
  | { readonly kind: 'unavailable' };

export type BackupFileProblem = VaultEnvelopeProblem | 'notJson';

export type OpenBackupResult =
  | { readonly kind: 'opened'; readonly snapshot: VaultSnapshot }
  /** GCM failed: the passphrase is wrong, or the file was changed or damaged. Not told apart. */
  | { readonly kind: 'wrongPassphraseOrDamaged' }
  /** Not JSON, not an envelope, a cipher or KDF we do not read, or a KDF below the floor. */
  | { readonly kind: 'notABackup'; readonly problem: BackupFileProblem }
  | { readonly kind: 'tooLarge' }
  /** Written by a newer version of the app: update it, do not guess. */
  | { readonly kind: 'schemaTooNew' }
  /** Authentic and decrypted, but not a snapshot this app accepts. */
  | { readonly kind: 'invalidContent' }
  /** The key derivation could not run. Says nothing about the file or the passphrase. */
  | { readonly kind: 'unavailable' };

export interface BackupService {
  seal(snapshot: VaultSnapshot, passphrase: string): Promise<SealBackupResult>;
  open(file: Uint8Array, passphrase: string): Promise<OpenBackupResult>;
}

export interface BackupServiceDeps {
  readonly kdf: VaultKdf;
  /** Cryptographically secure random bytes; the platform's by default. */
  readonly random?: (length: number) => Uint8Array;
}

const platformRandom = (length: number): Uint8Array =>
  globalThis.crypto.getRandomValues(new Uint8Array(length));

export function createBackupService(deps: BackupServiceDeps): BackupService {
  const random = deps.random ?? platformRandom;
  return {
    async seal(snapshot, passphrase) {
      const encoded = await encodeSnapshot(snapshot);
      if (encoded.kind !== 'encoded') return encoded;
      const compressed = encoded.bytes;
      const salt = random(ENVELOPE_LIMITS.saltBytes);
      try {
        const key = await deriveBackupKey(deps.kdf, passphrase, salt, BACKUP_KDF);
        const envelope = await sealEnvelope({
          key,
          vaultId: random(ENVELOPE_LIMITS.vaultIdBytes),
          version: 1,
          kdf: BACKUP_KDF,
          salt,
          nonce: random(ENVELOPE_LIMITS.nonceBytes),
          plaintext: compressed,
        });
        const bytes = new TextEncoder().encode(serializeEnvelope(envelope));
        return bytes.length > ENVELOPE_LIMITS.maxFileBytes
          ? { kind: 'tooLarge' }
          : { kind: 'sealed', bytes };
      } catch {
        return { kind: 'unavailable' };
      }
    },

    async open(file, passphrase) {
      if (file.length > ENVELOPE_LIMITS.maxFileBytes) return { kind: 'tooLarge' };
      let json: unknown;
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(file);
        // Nothing is authenticated yet: look at the shape before building any object from it.
        if (!looksLikeEnvelopeText(text)) return { kind: 'notABackup', problem: 'notJson' };
        json = JSON.parse(text);
      } catch {
        return { kind: 'notABackup', problem: 'notJson' };
      }
      // The KDF cost is checked here, before anything is derived.
      const parsed = parseVaultEnvelope(json);
      if (parsed.kind === 'vaultEnvelopeInvalid') {
        if (parsed.problem === 'newerFormat') return { kind: 'schemaTooNew' };
        if (parsed.problem === 'tooLarge') return { kind: 'tooLarge' };
        return { kind: 'notABackup', problem: parsed.problem };
      }
      const { envelope, salt } = parsed.parsed;
      let key: CryptoKey;
      try {
        key = await deriveBackupKey(deps.kdf, passphrase, salt, envelope.kdf);
      } catch {
        return { kind: 'unavailable' };
      }
      const opened = await openEnvelope(key, parsed.parsed);
      if (opened.kind === 'authenticationFailed') return { kind: 'wrongPassphraseOrDamaged' };

      // From here the file is authentic: whatever is wrong with it is in its content. A snapshot
      // from a newer app is named as such before the strict parser could call it malformed.
      const decoded = await decodeSnapshot(opened.plaintext);
      return decoded.kind === 'decoded'
        ? { kind: 'opened', snapshot: decoded.snapshot }
        : { kind: decoded.kind };
    },
  };
}

/** An envelope has two objects (itself and `kdf`) and no array: this leaves room, not much. */
const MAX_OPENERS = 4;
const MAX_DEPTH = 2;

/**
 * A cheap look at unauthenticated text before `JSON.parse`: it must start with `{`, nest at most
 * two deep, and open at most a few objects or arrays (strings are skipped, so a brace inside one
 * does not count). A file of millions of `[` or a deeply nested document is refused without ever
 * being parsed.
 */
export function looksLikeEnvelopeText(text: string): boolean {
  if (text.charCodeAt(0) !== 0x7b) return false;
  let depth = 0;
  let openers = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 0x5c) i++;
      else if (c === 0x22) inString = false;
    } else if (c === 0x22) inString = true;
    else if (c === 0x7b || c === 0x5b) {
      if (++depth > MAX_DEPTH || ++openers > MAX_OPENERS) return false;
    } else if (c === 0x7d || c === 0x5d) depth--;
  }
  return true;
}
