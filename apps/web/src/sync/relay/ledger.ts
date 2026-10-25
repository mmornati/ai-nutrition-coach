// What the relay is known to hold, per plate: the ground truth behind the "synced" chip (AD-6).
//
// A plate is `synced` only when a snapshot that CONTAINED it was durably acknowledged by the relay
// (a push the relay answered 200 to, read before the plate could have changed) or was fetched from
// the relay (a version this device has seen). The cycle tells the ledger exactly that and nothing
// else: `hold(snapshot)` replaces what is known with the plate uids of one snapshot. A plate written
// after the snapshot was read is not in it, so it stays `pending` until a later push covers it.
//
// A plate's own record (its time and its foods) is written once and never edited, so its uid says
// everything about its state; coach notes and the other records are separate and do not move the
// chip of the plate.
//
// It is kept in the device-only `sync.baseline` key as fixed-width tokens (a short hash of each uid,
// not the uid), so after a reload a plate the relay holds still reads `synced`, and one it does not
// still reads `pending`. Absent or unreadable means "unknown", which reads as "not yet": the chip
// never claims what it cannot show. Nothing here is ever sent anywhere.

import type { VaultSnapshot } from '@anc/core';
import type { KeyValueStore } from '../../storage/key-value-store';
import { readBaseline, writeBaseline } from './connection';
import { KV_KEYS } from '../../storage/key-value-store';

const TOKEN_LENGTH = 11;
const FORMAT = '1:';
/** Past this many plates the baseline is kept in memory only (a very large history). */
const MAX_PERSISTED = 50_000;

/** A 53-bit hash of `text` (cyrb53), as exactly 11 base-36 characters. Not a secret, not a MAC. */
export function uidToken(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(36).padStart(TOKEN_LENGTH, '0');
}

function parse(stored: string | null): ReadonlySet<string> | null {
  if (stored === null || !stored.startsWith(FORMAT)) return null;
  const body = stored.slice(FORMAT.length);
  if (body.length % TOKEN_LENGTH !== 0 || !/^[0-9a-z]*$/.test(body)) return null;
  const tokens = new Set<string>();
  for (let i = 0; i < body.length; i += TOKEN_LENGTH) tokens.add(body.slice(i, i + TOKEN_LENGTH));
  return tokens;
}

const serialise = (tokens: ReadonlySet<string>): string => FORMAT + [...tokens].sort().join('');

export class SyncLedger {
  readonly #kv: KeyValueStore;
  #held: ReadonlySet<string> | null = null;
  #persisting: Promise<void> = Promise.resolve();
  readonly #listeners = new Set<() => void>();

  constructor(kv: KeyValueStore) {
    this.#kv = kv;
  }

  /** Reads the stored baseline (call once per session). Never throws. */
  async load(): Promise<void> {
    try {
      this.#held = parse(await readBaseline(this.#kv));
    } catch {
      this.#held = null;
    }
    this.#emit();
  }

  /** Whether the ledger knows anything yet. Until it does, no plate is called synced. */
  get known(): boolean {
    return this.#held !== null;
  }

  /** Is this plate in the last snapshot the relay is known to hold? */
  holds(plateUid: string): boolean {
    return this.#held?.has(uidToken(plateUid)) ?? false;
  }

  /** The relay holds (at least) the plates of `snapshot`, in this state. */
  hold(snapshot: VaultSnapshot): void {
    const next = new Set(snapshot.plates.map((p) => uidToken(p.uid)));
    const current = this.#held;
    if (current !== null && current.size === next.size && [...next].every((t) => current.has(t))) {
      return;
    }
    this.#held = next;
    this.#persist(next);
    this.#emit();
  }

  /** This device no longer follows a vault: nothing is known. */
  forget(): void {
    this.#held = null;
    this.#persisting = this.#persisting
      .then(() => this.#kv.delete(KV_KEYS.syncBaseline))
      .catch(() => undefined);
    this.#emit();
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Resolves when the stored copy has caught up with memory (tests, and an orderly stop). */
  flush(): Promise<void> {
    return this.#persisting;
  }

  #persist(tokens: ReadonlySet<string>): void {
    // Writes are chained so the stored copy always ends where the last call left it; a failed write
    // only leaves an older (smaller or different) baseline, which errs towards "pending".
    this.#persisting = this.#persisting
      .then(() =>
        tokens.size > MAX_PERSISTED
          ? this.#kv.delete(KV_KEYS.syncBaseline)
          : writeBaseline(this.#kv, serialise(tokens)),
      )
      .catch(() => undefined);
  }

  #emit(): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener();
      } catch {
        // A throwing subscriber must not break the others.
      }
    }
  }
}

/**
 * Seeds the stored baseline with what the relay was just given or just handed over (a vault being
 * created, a copy being joined or restored), before the session that follows reads it. A failure
 * only leaves the baseline unknown, which reads as "not yet".
 */
export async function writeHeld(kv: KeyValueStore, snapshot: VaultSnapshot): Promise<void> {
  try {
    const tokens = new Set(snapshot.plates.map((p) => uidToken(p.uid)));
    if (tokens.size > MAX_PERSISTED) return;
    await writeBaseline(kv, serialise(tokens));
  } catch {
    // Unknown is safe.
  }
}
