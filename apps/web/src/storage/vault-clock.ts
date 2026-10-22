// What a store needs to give its rows an identity and a place in time (docs/encrypted-sync-plan.md
// §3.4): a `uid` for every new row and a hybrid-logical-clock stamp for every change that a later
// merge has to order. The SQL store and the in-memory reference build the SAME clock over their own
// raw storage, so the contract suite sees one behaviour from both.
//
// The wall clock and the random source are injected, so a test can pin them; the pure parts
// (UUIDv7, the HLC) are in @anc/core.

import {
  createUuidV7Generator,
  deviceIdFromBytes,
  formatHlc,
  isDeviceId,
  MAX_DRIFT_MS,
  parseHlc,
  receiveHlc,
  secureRandomBytes,
  tickHlc,
  uuidV7Parts,
  type Hlc,
  type RandomBytes,
} from '@anc/core';

export interface VaultEnv {
  now(): number;
  randomBytes: RandomBytes;
}

export const systemVaultEnv: VaultEnv = {
  now: () => Date.now(),
  randomBytes: secureRandomBytes,
};

/**
 * The `kv` key of this device's id. Device-only: not in the sync allow-list, so it never leaves the
 * device. It is read and written RAW (no stamp), because stamping needs the device id.
 */
export const DEVICE_ID_KV_KEY = 'sync.deviceId';

/** Raw access to what the clock persists and seeds from. */
export interface VaultClockIo {
  readDeviceId(): string | null;
  writeDeviceId(id: string): void;
  /** The newest stamp anywhere in the store, or `null` for an empty one. */
  newestStamp(): string | null;
  /** The largest uid in any table, or `null` for an empty store. */
  newestUid(): string | null;
}

/** The outcome of applying a snapshot to a store (a result, never a throw, across the worker). */
export type VaultApplyOutcome =
  /** Written. */
  | 'applied'
  /** The snapshot uses a uid for something else than this store does; nothing was written. */
  | 'conflict'
  /** A stamp in the snapshot is further ahead than the drift bound; nothing was written. */
  | 'clockAhead';

export class VaultClock {
  private nextUid: (() => string) | undefined;
  private deviceId: string | null = null;
  private last: Hlc | null | undefined;

  constructor(
    private readonly env: VaultEnv,
    private readonly io: VaultClockIo,
  ) {}

  /**
   * A fresh row identity. Ids from one clock increase, and the generator starts past the newest uid
   * already stored (unless that one is implausibly far ahead), so uid order is also write order
   * for the rows made on this device, even across a restart with a wall clock that moved back.
   */
  newUid(): string {
    if (this.nextUid === undefined) {
      const newest = this.io.newestUid();
      const plausible =
        newest !== null && (uuidV7Parts(newest)?.ms ?? Infinity) <= this.wallLimitMs();
      this.nextUid = createUuidV7Generator(
        this.env.randomBytes,
        this.env.now,
        plausible ? (newest ?? undefined) : undefined,
      );
    }
    return this.nextUid();
  }

  /** The latest wall time (ms) a received stamp may carry: now plus the drift bound. */
  wallLimitMs(): number {
    return Math.floor(this.env.now()) + MAX_DRIFT_MS;
  }

  /**
   * Make sure this device has an id, persisted now. Called once when the store opens, outside any
   * transaction, so the id cannot be lost to a rolled-back first write.
   */
  ensureDevice(): void {
    this.device();
  }

  private device(): string {
    if (this.deviceId === null) {
      const stored = this.io.readDeviceId();
      if (stored !== null && isDeviceId(stored)) {
        this.deviceId = stored;
      } else {
        this.deviceId = deviceIdFromBytes(this.env.randomBytes(8));
        this.io.writeDeviceId(this.deviceId);
      }
    }
    return this.deviceId;
  }

  private lastStamp(): Hlc | null {
    // Seeded once from the store, so a restart (or a wall clock that moved back) never issues a
    // stamp older than one already written, here or received from another device.
    if (this.last === undefined) {
      const stored = parseHlc(this.io.newestStamp());
      // A stored stamp beyond the drift bound is not built on (it would drag every write into the
      // future); stamps issued from here on are still ordered after everything issued in this run.
      this.last = stored !== null && stored.wallMs <= this.wallLimitMs() ? stored : null;
    }
    return this.last;
  }

  /** A stamp for a change made now, newer than every stamp this store has seen. */
  stamp(): string {
    const next = tickHlc(this.lastStamp(), this.env.now(), this.device());
    this.last = next;
    return formatHlc(next);
  }

  /** Note a stamp that arrived from elsewhere (an applied snapshot), so later writes sort after it. */
  observe(remote: string | null): void {
    const parsed = parseHlc(remote);
    if (parsed === null) return;
    this.last = receiveHlc(this.lastStamp(), parsed, this.env.now(), this.device());
  }
}
