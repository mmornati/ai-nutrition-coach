import type { Unsubscribe } from '@anc/core';
import { KV_KEYS, type KeyValueStore } from '../storage/key-value-store';

/**
 * The person's agreement to let an AI see their meals so it can write coach notes and answer
 * questions. It is NOT the photo consent: photos and meal data are different things, so a yes to
 * one never counts as a yes to the other (and the photo flow never reads this).
 *
 * The agreement names the destination it was given for (the host the data goes to). It lapses when
 * the destination changes (another endpoint, another rung, another provider or model): the stored
 * agreement is then CLEARED, so going back to the old destination asks again. Until it is turned on
 * for the new destination no coaching call is made. Default OFF.
 * One row of the encrypted store; it goes with "Erase all local data".
 */
export class CoachingConsent {
  readonly #kv: KeyValueStore;
  readonly #key: string;
  readonly #listeners = new Set<() => void>();
  #host: string | null = null;

  /** `key`: the row to keep the agreement in; the "Describe a meal" consent uses its own. */
  constructor(kv: KeyValueStore, key: string = KV_KEYS.aiCoachingConsent) {
    this.#kv = kv;
    this.#key = key;
  }

  /** Reads the stored agreement. Never throws; anything unreadable is "no agreement". */
  async load(): Promise<void> {
    let host: string | null = null;
    try {
      const raw = await this.#kv.read(this.#key);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        const value =
          typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)['host']
            : undefined;
        if (typeof value === 'string' && value !== '' && value.length <= 255) {
          host = value.toLowerCase();
        }
      }
    } catch {
      host = null;
    }
    this.#set(host);
  }

  /** The host the person agreed to, or `null`. */
  getSnapshot = (): string | null => this.#host;

  subscribe = (listener: () => void): Unsubscribe => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** True when the person agreed for exactly this destination. Read at call time. */
  grantedFor(host: string): boolean {
    return this.#host !== null && this.#host === host.toLowerCase();
  }

  /** Persists first, then publishes: the switch never claims what was not kept. Throws on failure. */
  async grant(host: string): Promise<void> {
    const lower = host.toLowerCase();
    await this.#kv.write(this.#key, JSON.stringify({ host: lower }));
    this.#set(lower);
  }

  /**
   * Fails closed: the agreement is forgotten in memory FIRST (so no further call is made), then the
   * row is deleted. If the delete throws, the caller hears of it but nothing more is sent.
   */
  async revoke(): Promise<void> {
    this.#set(null);
    await this.#kv.delete(this.#key);
  }

  #set(host: string | null): void {
    if (host === this.#host) return;
    this.#host = host;
    for (const l of [...this.#listeners]) l();
  }

  toString(): string {
    return `CoachingConsent(${this.#host === null ? 'off' : 'on'})`;
  }
}
