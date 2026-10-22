// Test support for the vault envelope. Test-only: nothing in the app imports this, so it is never
// in a bundle. A fast stand-in for Argon2id (the real one is 64 MiB and seconds of work), so tests
// that are not about the KDF itself run in milliseconds.

import { createBackupService, type BackupService } from './backup';
import type { VaultKdf } from './kdf';

/** A deterministic 32-byte "master key" from every input the real KDF takes. */
export const fastKdf: VaultKdf = async ({ passphrase, salt, memoryKib, passes, parallelism }) => {
  const params = new TextEncoder().encode(`|${memoryKib}|${passes}|${parallelism}|`);
  const input = new Uint8Array(passphrase.length + salt.length + params.length);
  input.set(passphrase, 0);
  input.set(salt, passphrase.length);
  input.set(params, passphrase.length + salt.length);
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', input));
};

/** A key that ignores every input, to isolate what ELSE makes an open fail (the header, the data). */
export const constantKdf: VaultKdf = () => Promise.resolve(new Uint8Array(32).fill(7));

export const fastBackupService = (): BackupService => createBackupService({ kdf: fastKdf });
