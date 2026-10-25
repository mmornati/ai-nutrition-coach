// The production backup service: Argon2id in a worker, WebCrypto for the rest. Built on first use
// so nothing is created until a backup is asked for.

import { createBackupService, type BackupService } from './backup';
import type { VaultKdf } from './kdf';
import { createWorkerKdf } from './worker-kdf';

let sharedKdf: VaultKdf | null = null;
let shared: BackupService | null = null;

/** Argon2id in a fresh worker per derivation: the one the backup and the relay vault share. */
export function browserKdf(): VaultKdf {
  sharedKdf ??= createWorkerKdf();
  return sharedKdf;
}

export function browserBackupService(): BackupService {
  shared ??= createBackupService({ kdf: browserKdf() });
  return shared;
}
