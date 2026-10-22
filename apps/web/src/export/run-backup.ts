import { systemClock, type Clock, type VaultStore } from '@anc/core';
import { BACKUP_EXTENSION, BACKUP_MIME_TYPE, type BackupService } from '../sync/vault';
import type { ExportDestination } from './export-destination';
import type { ExportHistory } from './export-history';

export type RunBackupResult =
  | { readonly kind: 'saved'; readonly filename: string }
  | { readonly kind: 'cancelled' }
  | {
      readonly kind: 'failed';
      /** `storeClosed`: locked; `readFailed`: the store could not be read; `tooLarge`; `sealFailed`; `deliveryFailed`. */
      readonly reason: 'storeClosed' | 'readFailed' | 'tooLarge' | 'sealFailed' | 'deliveryFailed';
    };

/** `ai-nutrition-coach-YYYY-MM-DD.ancvault`, the local date. */
export function backupFilename(at: number): string {
  const d = new Date(at);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `ai-nutrition-coach-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${BACKUP_EXTENSION}`;
}

/**
 * Read the whole store -> seal with the backup passphrase -> deliver -> remember the date. A backup
 * counts as an export for the reminder: the date is recorded best effort and only after a real
 * delivery (a dismissed share sheet records nothing). The passphrase is used once and not kept.
 */
export function createRunBackup(deps: {
  readonly vault: VaultStore;
  readonly service: BackupService;
  readonly destination: ExportDestination;
  readonly history: ExportHistory;
  readonly clock?: Clock;
}): (passphrase: string) => Promise<RunBackupResult> {
  const clock = deps.clock ?? systemClock;
  return async (passphrase) => {
    const read = await deps.vault.readSnapshot();
    if (read.kind === 'vaultFailed') {
      return { kind: 'failed', reason: read.reason === 'locked' ? 'storeClosed' : 'readFailed' };
    }
    const sealed = await deps.service.seal(read.value, passphrase).catch(() => null);
    if (sealed === null || sealed.kind === 'unavailable') {
      return { kind: 'failed', reason: 'sealFailed' };
    }
    if (sealed.kind === 'tooLarge') return { kind: 'failed', reason: 'tooLarge' };
    const now = clock();
    const filename = backupFilename(now);
    let outcome;
    try {
      outcome = await deps.destination.write({
        filename,
        mimeType: BACKUP_MIME_TYPE,
        bytes: sealed.bytes,
      });
    } catch {
      return { kind: 'failed', reason: 'deliveryFailed' };
    }
    if (outcome === 'cancelled') return { kind: 'cancelled' };
    await deps.history.record(now);
    return { kind: 'saved', filename };
  };
}
