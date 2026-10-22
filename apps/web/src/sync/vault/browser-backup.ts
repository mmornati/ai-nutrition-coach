// The production backup service: Argon2id in a worker, WebCrypto for the rest. Built on first use
// so nothing is created until a backup is asked for.

import { createBackupService, type BackupService } from './backup';
import { createWorkerKdf } from './worker-kdf';

let shared: BackupService | null = null;

export function browserBackupService(): BackupService {
  shared ??= createBackupService({ kdf: createWorkerKdf() });
  return shared;
}
