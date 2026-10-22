// The passphrase -> key step of the vault envelope, kept apart from sealing and opening so the
// relay (phase S2) can derive a key-wrapping key the same way and seal with a random vault key.
//
//   passphrase --Argon2id(salt, m, t, p, 32 B)--> masterKey
//   masterKey  --HKDF-SHA256(salt empty, info "anc/vault/backup-file")--> AES-256-GCM key
//
// Argon2id is memory-hard and WebCrypto does not have it, so it runs in a pinned wasm build inside
// a worker (worker-kdf.ts); everything after it is plain WebCrypto. The AES key is NON-extractable
// and the master key bytes are zeroed as soon as it is imported.

import { BACKUP_KDF_INFO } from './constants';
import { passphraseBytes } from '../../storage/passphrase';
import { wipe } from '../../storage/bytes';

/** What the Argon2 step is asked to do. All of it comes from a parsed (bounded) envelope. */
export interface VaultKdfRequest {
  /** NFC + UTF-8 of the passphrase. The step may take ownership of the buffer (transfer it). */
  readonly passphrase: Uint8Array;
  readonly salt: Uint8Array;
  /** KiB. */
  readonly memoryKib: number;
  readonly passes: number;
  readonly parallelism: number;
}

/** The raw 32-byte master key. Rejects if the derivation could not run (never a wrong key). */
export type VaultKdf = (request: VaultKdfRequest) => Promise<Uint8Array>;

export const MASTER_KEY_BYTES = 32;

/** HKDF-SHA256 of the master key into a non-extractable AES-256-GCM key for the backup file. */
export async function backupKeyFromMaster(master: Uint8Array): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto is not available');
  const base = await subtle.importKey('raw', master as BufferSource, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(BACKUP_KDF_INFO),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Passphrase to the file's AES key. Wipes every intermediate buffer it owns, success or not. */
export async function deriveBackupKey(
  kdf: VaultKdf,
  passphrase: string,
  salt: Uint8Array,
  cost: { readonly m: number; readonly t: number; readonly p: number },
): Promise<CryptoKey> {
  const password = passphraseBytes(passphrase);
  let master: Uint8Array | null = null;
  try {
    master = await kdf({
      passphrase: password,
      salt,
      memoryKib: cost.m,
      passes: cost.t,
      parallelism: cost.p,
    });
    if (master.length !== MASTER_KEY_BYTES) throw new Error('unexpected key length');
    return await backupKeyFromMaster(master);
  } finally {
    // A KDF that took the buffer over (transferred it to a worker) leaves a detached, empty view,
    // which cannot be written to: nothing is left here to wipe.
    if (password.length > 0) wipe(password);
    if (master !== null) wipe(master);
  }
}
