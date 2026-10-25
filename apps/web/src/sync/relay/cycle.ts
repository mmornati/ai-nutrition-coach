// One round of backing up: pull what the relay has that this device has not seen, merge it in,
// push what the relay has not got, with a compare-and-swap. A push NEVER overwrites blindly:
//
//   1. GET /vault with `If-None-Match: "<last version seen>"`. 304: nothing new. A newer version is
//      opened (the associated data binds vault id and version), merged into the local store with
//      the same pure merge the stores use, and remembered as the new last version seen.
//   2. If the device has changes the relay has not acknowledged (or the merge left it with more than
//      the relay's copy), the snapshot is sealed as version + 1 and sent with `If-Match: "<version>"`.
//   3. 412 means another device pushed first: back to 1, bounded.
//
// Refusals that must never be "retried until it works" end the cycle as `stopped` with a reason: an
// older copy than this device has seen (rollback), a newer app's data, a revoked token, a vault too
// large for the server. Everything else that fails is `retry`.
//
// A cycle is also what a pull is (on unlock, on focus): with nothing to send and nothing new, step 1
// is a conditional read that comes back 304, and the cycle ends `upToDate` without a write of any
// kind. What the cycle reports to the ledger (`onHeld`) is exactly what the relay is known to hold:
// the snapshot it fetched or the snapshot it sealed and had acknowledged. A 304 never widens it (the
// in-memory dirty flag may be falsely clean). When the ledger is unknown the pull is unconditional,
// so the fetched copy establishes it, and a device that differs from it is marked as having changes.

import { canonicalizeSnapshot, type VaultSnapshot, type VaultStore } from '@anc/core';
import type { KeyValueStore } from '../../storage/key-value-store';
import type { RelayClient, RelayError } from './client';
import { writeLastSeen } from './connection';
import { openSnapshot, sealSnapshot, type RandomSource } from './crypto';
import type { QueueCheckpoint } from './dirty-queue';

/** What the cycle needs to know about the connection, and keeps up to date. */
export interface CycleConnection {
  readonly token: string;
  readonly vaultId: string;
  lastSeenVersion: number;
}

export type RetryReason = 'offline' | 'unavailable' | 'rateLimited' | 'conflict';
export type StopReason =
  | 'needsUpdate'
  | 'rolledBack'
  | 'signedOut'
  | 'tooLarge'
  | 'damaged'
  | 'clockAhead'
  | 'storeProblem';

export type CycleResult =
  /** Nothing to send, nothing new to take. */
  | { readonly kind: 'upToDate' }
  /** The relay acknowledged this version. */
  | { readonly kind: 'pushed'; readonly version: number }
  | { readonly kind: 'retry'; readonly reason: RetryReason; readonly retryAfterSeconds?: number }
  | { readonly kind: 'stopped'; readonly reason: StopReason }
  /** The store is locked: the session is going away, nothing is wrong. */
  | { readonly kind: 'locked' };

export interface CycleQueue {
  readonly generation: number;
  readonly dirty: boolean;
  acknowledge(generation: number): void;
  /** Marks the device as having something to send (a write the observer did not see). */
  markDirty(): void;
  checkpoint(): QueueCheckpoint;
  rewind(checkpoint: QueueCheckpoint): void;
}

export interface CycleDeps {
  readonly connection: CycleConnection;
  readonly vaultKey: CryptoKey;
  readonly client: RelayClient;
  readonly vault: VaultStore;
  readonly kv: KeyValueStore;
  readonly queue: CycleQueue;
  /** The largest ciphertext the relay accepts. */
  readonly maxVaultBytes: number;
  readonly now: () => number;
  readonly random?: RandomSource;
  /**
   * Whether `connection` is still the one this device is connected with. A cycle that outlives a
   * disconnect (or a reconnect) must not write its version or its acknowledgement over the new one.
   */
  readonly isCurrent?: () => boolean;
  /** Pull-merge-push rounds before giving up on a vault that keeps changing under us. */
  readonly maxRounds?: number;
  /**
   * The relay is known to hold (at least) this snapshot's records in this state: called with a
   * fetched copy (before it is applied) and with a snapshot the relay acknowledged. Never with what
   * the device merely holds. Only while `isCurrent`.
   */
  readonly onHeld?: (snapshot: VaultSnapshot) => void;
  /** Whether the ledger knows what the relay holds. When it does not, the pull is unconditional. */
  readonly ledgerKnown?: () => boolean;
  /** A pulled copy changed what this device holds: the screens should read it again. */
  readonly onApplied?: () => void;
}

const retry = (reason: RetryReason, retryAfterSeconds?: number): CycleResult => ({
  kind: 'retry',
  reason,
  ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
});
const stopped = (reason: StopReason): CycleResult => ({ kind: 'stopped', reason });

function fromClientError(error: RelayError, retryAfterSeconds?: number): CycleResult {
  switch (error) {
    case 'offline':
      return retry('offline');
    case 'rateLimited':
      return retry('rateLimited', retryAfterSeconds);
    case 'unauthorized':
      return stopped('signedOut');
    case 'newerFormat':
      return stopped('needsUpdate');
    case 'tooLarge':
      return stopped('tooLarge');
    case 'conflict':
      return retry('conflict');
    default:
      return retry('unavailable');
  }
}

/** Equal as content: the canonical form does not depend on row order or on how it was read. */
const same = (a: VaultSnapshot, b: VaultSnapshot): boolean =>
  JSON.stringify(canonicalizeSnapshot(a)) === JSON.stringify(canonicalizeSnapshot(b));

export async function runSyncCycle(deps: CycleDeps): Promise<CycleResult> {
  const { connection, client, vault, queue } = deps;
  const rounds = deps.maxRounds ?? 4;
  const current = (): boolean => deps.isCurrent?.() ?? true;

  for (let round = 0; round < rounds; round++) {
    // ── pull ────────────────────────────────────────────────────────────────────────────────
    // When the ledger is unknown (no baseline, a connection from before it, a history too large to
    // keep) the read is unconditional: a 304 would tell nothing about what the relay holds.
    const force = deps.ledgerKnown?.() === false;
    const got = await client.getVault(
      connection.token,
      force ? undefined : connection.lastSeenVersion,
    );
    // Disconnected (or locked) while that was in flight: nothing it brought is for this device now.
    if (!current()) return { kind: 'locked' };
    if (got.kind === 'error') return fromClientError(got.error, got.retryAfterSeconds);
    let remote: VaultSnapshot | null = null;
    let before: VaultSnapshot | null = null;
    if (got.value.kind === 'vault') {
      const fetched = got.value.vault;
      // The refusal that makes a malicious or restored-from-backup relay visible: it may never
      // take this device back to a copy older than one it has already seen.
      if (fetched.vaultId !== connection.vaultId || fetched.version < connection.lastSeenVersion) {
        return stopped('rolledBack');
      }
      if (fetched.version > connection.lastSeenVersion || force) {
        const opened = await openSnapshot(
          deps.vaultKey,
          fetched.envelope,
          {
            vaultId: connection.vaultId,
            version: fetched.version,
          },
          deps.maxVaultBytes,
        );
        if (opened.kind !== 'opened') {
          if (opened.kind === 'schemaTooNew') return stopped('needsUpdate');
          if (opened.kind === 'tooLarge') return stopped('tooLarge');
          return stopped('damaged');
        }
        // Disconnected while it was being opened: nothing of it is for this device now.
        if (!current()) return { kind: 'locked' };
        // The relay holds this, whether or not this device manages to apply it.
        deps.onHeld?.(opened.snapshot);
        // What the screens show now, to tell afterwards whether the pulled copy changed it.
        if (deps.onApplied) {
          const had = await vault.readSnapshot();
          if (had.kind === 'vault') before = had.value;
        }
        if (!current()) return { kind: 'locked' };
        // A snapshot with a time far ahead of this clock is refused by the store (and by us first,
        // so nothing is half-applied).
        const beforeApply = queue.checkpoint();
        const applied = await vault.applySnapshot(opened.snapshot);
        if (applied.kind === 'vaultFailed') {
          switch (applied.reason) {
            case 'locked':
              return { kind: 'locked' };
            case 'schemaTooNew':
              return stopped('needsUpdate');
            case 'clockAhead':
              return stopped('clockAhead');
            default:
              return stopped('storeProblem');
          }
        }
        // Applying a pulled copy is not a change to send (see `rewind`).
        if (current()) queue.rewind(beforeApply);
        connection.lastSeenVersion = fetched.version;
        if (current()) await writeLastSeen(deps.kv, fetched.version).catch(() => undefined);
        remote = opened.snapshot;
      }
    }

    // ── decide ──────────────────────────────────────────────────────────────────────────────
    // Captured BEFORE the read: a write after this point is not covered by an acknowledgement.
    let generation = queue.generation;
    const read = await vault.readSnapshot();
    if (read.kind === 'vaultFailed') {
      return read.reason === 'locked' ? { kind: 'locked' } : stopped('storeProblem');
    }
    const local = read.value;
    if (before !== null && current() && !same(before, local)) deps.onApplied?.();
    const differs = remote !== null && !same(local, remote);
    if (!queue.dirty && differs && current()) {
      // The device holds something the relay does not (a write that raced the apply): remember it,
      // so a failed push is not forgotten. If nothing else wrote meanwhile, the mark is covered
      // by this very push.
      queue.markDirty();
      if (queue.generation === generation + 1) generation += 1;
    }
    if (!queue.dirty && !differs) {
      if (current()) {
        // No `onHeld` here: the in-memory flag can be falsely clean (a failed or lost write of it),
        // so what this device holds says nothing about what the relay holds. The ledger already
        // reflects the last snapshot fetched or acknowledged; an unknown one was filled by the
        // unconditional read above.
        queue.acknowledge(generation);
      }
      return { kind: 'upToDate' };
    }

    // ── push ────────────────────────────────────────────────────────────────────────────────
    const next = connection.lastSeenVersion + 1;
    const sealed = await sealSnapshot(
      deps.vaultKey,
      connection.vaultId,
      next,
      local,
      deps.maxVaultBytes,
      deps.random,
    );
    if (sealed.kind === 'tooLarge') return stopped('tooLarge');
    if (sealed.kind === 'unavailable') return retry('unavailable');
    // Disconnected, locked or erased while it was being sealed: the stale snapshot is not sent.
    if (!current()) return { kind: 'locked' };
    const put = await client.putVault(
      connection.token,
      sealed.envelope,
      connection.lastSeenVersion,
    );
    if (put.kind === 'ok') {
      connection.lastSeenVersion = put.value.version;
      if (current()) {
        await writeLastSeen(deps.kv, put.value.version).catch(() => undefined);
        queue.acknowledge(generation);
        // The acknowledgement covers exactly the snapshot that was sealed, nothing written after.
        deps.onHeld?.(local);
      }
      return { kind: 'pushed', version: put.value.version };
    }
    // Someone else pushed first: pull, merge, try again. Anything else ends the round.
    if (put.error !== 'conflict') return fromClientError(put.error, put.retryAfterSeconds);
  }
  return retry('conflict');
}
