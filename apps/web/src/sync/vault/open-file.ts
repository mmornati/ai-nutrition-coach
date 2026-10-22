// A picked file to a validated snapshot: the size is checked before the bytes are read, then the
// service opens it. One typed answer; nothing is written anywhere.

import type { VaultSnapshot } from '@anc/core';
import type { BackupService, OpenBackupResult } from './backup';
import { readBackupFile } from './read-file';

/** Why a backup could not be opened. `unreadable`: the browser could not read the picked file. */
export type OpenFailure = Exclude<OpenBackupResult['kind'], 'opened'> | 'unreadable';

export type OpenBackupFileResult =
  | { readonly kind: 'opened'; readonly snapshot: VaultSnapshot }
  | { readonly kind: 'failed'; readonly failure: OpenFailure };

export async function openBackupFile(
  service: BackupService,
  file: Blob,
  passphrase: string,
): Promise<OpenBackupFileResult> {
  const read = await readBackupFile(file);
  if (read.kind !== 'read') return { kind: 'failed', failure: read.kind };
  let opened: OpenBackupResult;
  try {
    opened = await service.open(read.bytes, passphrase);
  } catch {
    return { kind: 'failed', failure: 'unavailable' };
  }
  return opened.kind === 'opened' ? opened : { kind: 'failed', failure: opened.kind };
}
