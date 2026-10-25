// Case A: a new device restores from the relay on the first-run screen (plan §3.6). The copy is
// opened and validated completely FIRST (`openServerCopy`); only then is the local store created,
// with the same passphrase (one passphrase for the person; it must pass the strength floor), the
// snapshot applied and the connection stored. Nothing exists locally, so nothing can be lost; a
// failure at any step leaves no store behind, as the S1 restore-into-new-store path does.

import {
  encodeBase64Url,
  MAX_DRIFT_MS,
  snapshotBeyond,
  type LocalDataEraser,
  type VaultStore,
} from '@anc/core';
import type { KeyValueStore } from '../../storage/key-value-store';
import { validateNewPassphrase, type PassphraseIssue } from '../../storage/passphrase';
import type { UnlockOutcome } from '../../storage/store-controller';
import { writeConnection, type RelayConnection } from './connection';
import { writeHeld } from './ledger';
import type { OpenedServerCopy } from './server-copy';

export type RestoreFromServerResult =
  | { readonly kind: 'restored'; readonly connection: RelayConnection }
  /** The passphrase would not pass the strength floor for this device's passphrase. */
  | { readonly kind: 'passphraseRejected'; readonly issue: PassphraseIssue }
  | { readonly kind: 'clockAhead' }
  | { readonly kind: 'createFailed'; readonly outcome: UnlockOutcome }
  | { readonly kind: 'storeProblem' }
  | { readonly kind: 'storeProblemNotRemoved' };

/**
 * The checks that can be made before anything is erased or created: the passphrase must pass the
 * strength floor (it becomes this device's passphrase) and the copy must not be dated further ahead
 * than this clock allows. `null`: restoring can go ahead. "Start fresh" runs this BEFORE it erases,
 * so a copy that cannot be restored never leaves the device empty.
 */
export function checkServerRestore(
  copy: OpenedServerCopy,
  passphrase: string,
  now: number,
): Extract<RestoreFromServerResult, { kind: 'passphraseRejected' | 'clockAhead' }> | null {
  const issue = validateNewPassphrase(passphrase);
  if (issue !== null) return { kind: 'passphraseRejected', issue };
  if (snapshotBeyond(copy.snapshot, now + MAX_DRIFT_MS)) return { kind: 'clockAhead' };
  return null;
}

export async function restoreServerCopyIntoNewStore(deps: {
  readonly copy: OpenedServerCopy;
  readonly passphrase: string;
  readonly createStore: (passphrase: string) => Promise<UnlockOutcome>;
  readonly vault: VaultStore;
  readonly kv: KeyValueStore;
  readonly eraser: LocalDataEraser;
  readonly now: () => number;
}): Promise<RestoreFromServerResult> {
  const { copy } = deps;
  const refused = checkServerRestore(copy, deps.passphrase, deps.now());
  if (refused !== null) return refused;

  const created = await deps.createStore(deps.passphrase);
  if (created.kind !== 'unlocked') return { kind: 'createFailed', outcome: created };

  const connection: RelayConnection = {
    handle: copy.handle,
    token: copy.token,
    vaultKey: encodeBase64Url(copy.vaultKey),
    vaultId: copy.vaultId,
    lastSeenVersion: copy.version,
  };
  let landed = false;
  try {
    const applied = await deps.vault.applySnapshot(copy.snapshot);
    if (applied.kind === 'vault') {
      // What was just downloaded is what the server has: nothing to push.
      await writeConnection(deps.kv, connection, false);
      await writeHeld(deps.kv, copy.snapshot);
      landed = true;
    }
  } catch {
    landed = false;
  }
  if (landed) return { kind: 'restored', connection };
  // Do not leave the person in an empty app that looks like a successful restore.
  const erased = await deps.eraser.eraseAll().catch(() => null);
  return erased?.kind === 'eraseLocalDataSuccess'
    ? { kind: 'storeProblem' }
    : { kind: 'storeProblemNotRemoved' };
}
