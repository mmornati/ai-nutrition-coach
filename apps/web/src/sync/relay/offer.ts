import type { Unsubscribe } from '@anc/core';
import { parseSyncConfig, SYNC_CONFIG_PATH, SYNC_NOT_OFFERED, type SyncOffer } from '@anc/core';
import { cappedFetch, type FetchLike } from '../../net/capped-fetch';

/**
 * Whether this server offers to keep an encrypted copy (`GET /sync/config.json`). The file is
 * untrusted input (any server can answer that path, a captive portal included), so it is read
 * strictly by `parseSyncConfig`: anything that is not exactly the shape is "not offered", and then
 * the app shows nothing about sync, exactly as before. Read like `/ai/config.json`: a few hundred
 * bytes at most, bounded waits, and a failed read is "not offered", never an error.
 */
const MAX_CONFIG_BYTES = 1024;
const CONFIG_TIMEOUT_MS = 3000;

export interface SyncOfferSourceOptions {
  readonly fetch?: FetchLike | undefined;
  readonly signal?: AbortSignal | undefined;
}

export class SyncOfferSource {
  readonly #fetch: FetchLike | undefined;
  readonly #signal: AbortSignal | undefined;
  readonly #listeners = new Set<() => void>();
  #offer: SyncOffer = SYNC_NOT_OFFERED;
  #loaded = false;
  #inflight: Promise<void> | null = null;

  constructor(options: SyncOfferSourceOptions = {}) {
    this.#fetch = options.fetch;
    this.#signal = options.signal;
  }

  getSnapshot = (): SyncOffer => this.#offer;

  get loaded(): boolean {
    return this.#loaded;
  }

  subscribe = (listener: () => void): Unsubscribe => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Reads `/sync/config.json` (concurrent calls share one request). Never rejects. */
  refresh(): Promise<void> {
    this.#inflight ??= this.#read().finally(() => {
      this.#inflight = null;
    });
    return this.#inflight;
  }

  async #read(): Promise<void> {
    let next: SyncOffer = SYNC_NOT_OFFERED;
    try {
      const r = await cappedFetch(SYNC_CONFIG_PATH, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        maxBytes: MAX_CONFIG_BYTES,
        headersTimeoutMs: CONFIG_TIMEOUT_MS,
        bodyTimeoutMs: CONFIG_TIMEOUT_MS,
        ...(this.#fetch ? { fetchImpl: this.#fetch } : {}),
        ...(this.#signal ? { signal: this.#signal } : {}),
      });
      if (r.kind === 'response' && r.status === 200 && r.body.byteLength > 0) {
        next = parseSyncConfig(JSON.parse(new TextDecoder().decode(r.body)));
      }
    } catch {
      next = SYNC_NOT_OFFERED;
    }
    this.#loaded = true;
    if (this.#signal?.aborted === true) return;
    const same =
      next.offered === this.#offer.offered &&
      (!next.offered ||
        (this.#offer.offered &&
          next.signup === this.#offer.signup &&
          next.maxVaultMb === this.#offer.maxVaultMb));
    this.#offer = next;
    if (!same) for (const listener of [...this.#listeners]) listener();
  }

  toString(): string {
    return 'SyncOfferSource()';
  }
}

let shared: SyncOfferSource | null = null;

/** The one offer source the first-run screen and the session share (read once per page load). */
export function browserSyncOffer(): SyncOfferSource {
  shared ??= new SyncOfferSource();
  return shared;
}
