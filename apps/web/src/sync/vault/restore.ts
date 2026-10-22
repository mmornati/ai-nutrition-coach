// Restoring a backup: open it completely FIRST, write only afterwards. Two entry points share the
// opener: into the store that is already unlocked (a merge: nothing already here is removed), and
// on the create-passphrase screen, where the backup's passphrase becomes the device's and the store
// is created only after the file has opened and validated, so a wrong passphrase or a bad file
// leaves the device exactly as it was (no store, no header).

import {
  MAX_DRIFT_MS,
  snapshotBeyond,
  type LocalDataEraser,
  type VaultFailureReason,
  type VaultSnapshot,
  type VaultStore,
} from '@anc/core';
import { validateNewPassphrase, type PassphraseIssue } from '../../storage/passphrase';
import type { UnlockOutcome } from '../../storage/store-controller';
import type { BackupService } from './backup';
import { openBackupFile, type OpenFailure } from './open-file';

/** Applying the opened snapshot to the store was refused or failed (typed, nothing written). */
export type RestoreIntoStoreResult =
  | { readonly kind: 'restored' }
  | { readonly kind: 'failed'; readonly failure: OpenFailure }
  | { readonly kind: 'notApplied'; readonly reason: VaultFailureReason };

/** Open the file, then merge it into the unlocked store. */
export async function restoreIntoStore(deps: {
  readonly service: BackupService;
  readonly vault: VaultStore;
  readonly file: Blob;
  readonly passphrase: string;
}): Promise<RestoreIntoStoreResult> {
  const opened = await openBackupFile(deps.service, deps.file, deps.passphrase);
  if (opened.kind === 'failed') return opened;
  const applied = await deps.vault.applySnapshot(opened.snapshot);
  return applied.kind === 'vault'
    ? { kind: 'restored' }
    : { kind: 'notApplied', reason: applied.reason };
}

export type RestoreNewStoreResult =
  | { readonly kind: 'restored' }
  /** The backup's passphrase would not pass the strength floor for this device's passphrase. */
  | { readonly kind: 'passphraseRejected'; readonly issue: PassphraseIssue }
  | { readonly kind: 'failed'; readonly failure: OpenFailure }
  /** The backup carries a time further ahead than this device's clock may be believed. */
  | { readonly kind: 'clockAhead' }
  /** The store could not be created; the controller's reason, as on the plain create path. */
  | { readonly kind: 'createFailed'; readonly outcome: UnlockOutcome }
  /** The store was created but the data could not be written into it; the empty store was removed again. */
  | { readonly kind: 'storeProblem' }
  /**
   * As `storeProblem`, but removing the empty store failed too (or only partly worked): an empty
   * store with the backup's passphrase is still on the device. Said honestly, never "nothing changed".
   */
  | { readonly kind: 'storeProblemNotRemoved' };

export interface RestoreNewStoreDeps {
  readonly service: BackupService;
  readonly file: Blob;
  readonly passphrase: string;
  readonly createStore: (passphrase: string) => Promise<UnlockOutcome>;
  readonly vault: VaultStore;
  /** Removes the store just created, if the data cannot be written into it. */
  readonly eraser: LocalDataEraser;
  readonly now: () => number;
}

export async function restoreIntoNewStore(
  deps: RestoreNewStoreDeps,
): Promise<RestoreNewStoreResult> {
  // Cheapest refusal first: the passphrase is about to become this device's.
  const issue = validateNewPassphrase(deps.passphrase);
  if (issue !== null) return { kind: 'passphraseRejected', issue };

  const opened = await openBackupFile(deps.service, deps.file, deps.passphrase);
  if (opened.kind === 'failed') return opened;
  const snapshot: VaultSnapshot = opened.snapshot;
  // Checked before the store exists, so the common refusal of an apply leaves nothing behind.
  if (snapshotBeyond(snapshot, deps.now() + MAX_DRIFT_MS)) return { kind: 'clockAhead' };

  const created = await deps.createStore(deps.passphrase);
  if (created.kind !== 'unlocked') return { kind: 'createFailed', outcome: created };

  const applied = await deps.vault.applySnapshot(snapshot);
  if (applied.kind === 'vault') return { kind: 'restored' };
  // Do not leave the person in an empty app that looks like a successful restore.
  const erased = await deps.eraser.eraseAll().catch(() => null);
  return erased?.kind === 'eraseLocalDataSuccess'
    ? { kind: 'storeProblem' }
    : { kind: 'storeProblemNotRemoved' };
}
