// Fixed-window counters for the rate limits. In memory on purpose: a restart forgives everyone,
// which is the right failure for a limiter, and there is nothing to persist about a client.
//
// One limiter per kind of limit (the relay makes several), each with its own bounded table, and
// each entry remembers ITS OWN window: a flood of one kind can neither push out another kind's
// counters nor have them pruned by a call that uses a shorter window.
//
// When a table is full of live entries, the policy decides: `evictOldest` forgives the oldest
// (fine for a limit that only protects capacity), `refuse` turns away keys it has no room for
// (for a limit that guards guessing: forgetting a counter there would hand the guesser a fresh
// allowance, so a flood of other keys must never reset it).

interface Window {
  readonly start: number;
  readonly windowMs: number;
  count: number;
}

export interface LimitDecision {
  readonly allowed: boolean;
  /** Whole seconds until the window ends (0 when allowed). */
  readonly retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  readonly maxKeys?: number;
  /** What to do for a new key when the table is full of live entries. Default `evictOldest`. */
  readonly whenFull?: 'evictOldest' | 'refuse';
}

const DEFAULT_MAX_KEYS = 20_000;
/** A full table that had nothing to drop is not scanned again for this long. */
const RESCAN_MS = 1000;

export class RateLimiter {
  readonly #windows = new Map<string, Window>();
  readonly #maxKeys: number;
  readonly #whenFull: 'evictOldest' | 'refuse';
  #scanAfter = 0;

  constructor(options: RateLimiterOptions = {}) {
    this.#maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
    this.#whenFull = options.whenFull ?? 'evictOldest';
  }

  /**
   * Counts one hit on `key` and says whether it is within `limit` per `windowMs`. A refused hit is
   * counted too, so a client that keeps hammering stays refused until it stops.
   */
  hit(key: string, limit: number, windowMs: number, now: number): LimitDecision {
    let window = this.#windows.get(key);
    if (window === undefined || now - window.start >= windowMs) {
      if (window === undefined && !this.#makeRoom(now)) return this.#fullDecision(now);
      window = { start: now, windowMs, count: 0 };
      this.#windows.delete(key);
      this.#windows.set(key, window);
    }
    window.count += 1;
    return this.#decide(window, limit, now);
  }

  /** Says what the NEXT hit on `key` would be told, without counting anything. */
  peek(key: string, limit: number, now: number): LimitDecision {
    const window = this.#windows.get(key);
    if (window === undefined || now - window.start >= window.windowMs) {
      // Nothing counted for this key; but if there is no room to count it, do not wave it through.
      if (window === undefined && this.#full(now)) return this.#fullDecision(now);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    return this.#decide(window, limit, now, 1);
  }

  #decide(window: Window, limit: number, now: number, extra = 0): LimitDecision {
    if (window.count + extra <= limit) return { allowed: true, retryAfterSeconds: 0 };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((window.start + window.windowMs - now) / 1000)),
    };
  }

  /** Under `refuse`, a key there is no room for is turned away; the wait is the soonest expiry. */
  #fullDecision(now: number): LimitDecision {
    let soonest = Infinity;
    for (const window of this.#windows.values()) {
      soonest = Math.min(soonest, window.start + window.windowMs);
    }
    const wait = Number.isFinite(soonest) ? Math.ceil((soonest - now) / 1000) : 1;
    return { allowed: false, retryAfterSeconds: Math.max(1, wait) };
  }

  #full(now: number): boolean {
    return this.#whenFull === 'refuse' && this.#windows.size >= this.#maxKeys && !this.#prune(now);
  }

  /** Drops what has expired. Reports whether there is room for one more key afterwards. */
  #prune(now: number): boolean {
    if (this.#windows.size < this.#maxKeys) return true;
    if (now >= this.#scanAfter) {
      for (const [key, window] of this.#windows) {
        if (now - window.start >= window.windowMs) this.#windows.delete(key);
      }
      if (this.#windows.size >= this.#maxKeys) this.#scanAfter = now + RESCAN_MS;
    }
    return this.#windows.size < this.#maxKeys;
  }

  /** Room for a new key? Expired entries go first; then the policy decides. */
  #makeRoom(now: number): boolean {
    if (this.#prune(now)) return true;
    if (this.#whenFull === 'refuse') return false;
    // Still full (a flood inside one window): drop the oldest quarter, insertion order.
    let drop = this.#windows.size - Math.floor((this.#maxKeys * 3) / 4);
    for (const key of this.#windows.keys()) {
      if (drop-- <= 0) break;
      this.#windows.delete(key);
    }
    return true;
  }

  /** Takes back one counted hit (a reservation that turned out not to be a failure). */
  refund(key: string, now: number): void {
    const window = this.#windows.get(key);
    if (window === undefined || now - window.start >= window.windowMs || window.count === 0) return;
    window.count -= 1;
  }

  /** How many hits the live window of `key` holds (0 when it has none). Counts nothing. */
  count(key: string, now: number): number {
    const window = this.#windows.get(key);
    return window === undefined || now - window.start >= window.windowMs ? 0 : window.count;
  }

  get size(): number {
    return this.#windows.size;
  }
}

/**
 * A fixed-size array of failure counters, indexed by a secret-keyed hash of the handle (see
 * `ServerKeys.guessSlot`). It is the relay's global cap on guessing one handle, and it is built so
 * that no flood of other requests can reset or evade a counter, and so that a handle that exists
 * and one that does not cannot be told apart through it:
 * - Every handle, known or not, falls in a slot the same way; the table never grows, never evicts
 *   and never refuses a key, so there is no "full" state to provoke.
 * - A counter only ever leaves its window by time passing (fixed window from the first failure),
 *   so junk handles can only ADD to a slot they happen to share, never reset it. The price is a
 *   rare collision: another handle that hashes to the same slot shares its count (a flood can only
 *   make a real handle's counter reach its cap sooner, which costs the flooder as many failed
 *   logins as attacking that handle directly would).
 * - The slot of a handle is unguessable without the server secret, so an attacker cannot aim a
 *   flood of junk handles at a chosen slot.
 */
export class GuessBudget {
  readonly #counts: Uint16Array;
  readonly #starts: Float64Array;

  constructor(slots: number) {
    this.#counts = new Uint16Array(slots);
    this.#starts = new Float64Array(slots);
  }

  /** Counts one failure in `slot` unless it already holds `limit` in its live window. */
  reserve(slot: number, limit: number, windowMs: number, now: number): LimitDecision {
    const start = this.#starts[slot] ?? 0;
    if (now - start >= windowMs) {
      this.#starts[slot] = now;
      this.#counts[slot] = 0;
    }
    const count = this.#counts[slot] ?? 0;
    if (count >= limit) {
      const end = (this.#starts[slot] ?? now) + windowMs;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((end - now) / 1000)) };
    }
    this.#counts[slot] = count + 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Gives back a reservation (the login turned out to be correct). */
  refund(slot: number, windowMs: number, now: number): void {
    const start = this.#starts[slot] ?? 0;
    const count = this.#counts[slot] ?? 0;
    if (now - start < windowMs && count > 0) this.#counts[slot] = count - 1;
  }

  /** Failures held in the live window of `slot`. */
  count(slot: number, windowMs: number, now: number): number {
    return now - (this.#starts[slot] ?? 0) >= windowMs ? 0 : (this.#counts[slot] ?? 0);
  }
}
