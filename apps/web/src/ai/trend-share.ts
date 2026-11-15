/**
 * "Share my weight trend with the coach" (Settings, Your AI): a separate, explicit switch, OFF by
 * default, kept as a device-only key/value row (`ai.shareWeightTrend` = `on`). It is read at every
 * coaching call, on top of the per-destination coaching consent, so turning coaching off, or
 * changing where it goes, never leaves it on: the session switches it off whenever the coaching
 * consent is not in force, and turning coaching back on does not turn it back on.
 */
import { KV_KEYS, type KeyValueStore } from '../storage/key-value-store';

export class TrendSharePref {
  private on = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly kv: KeyValueStore) {}

  /** Read the stored switch (call once when the session is built). Anything unreadable is off. */
  async load(): Promise<void> {
    try {
      this.apply((await this.kv.read(KV_KEYS.aiShareWeightTrend)) === 'on');
    } catch {
      this.apply(false);
    }
  }

  enabled = (): boolean => this.on;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Persists first, then publishes: the switch never claims what was not kept. Throws on failure. */
  async set(next: boolean): Promise<void> {
    if (next) await this.kv.write(KV_KEYS.aiShareWeightTrend, 'on');
    else await this.kv.delete(KV_KEYS.aiShareWeightTrend);
    this.apply(next);
  }

  /** Fails closed: forgotten in memory first, then the row is deleted (a failed delete is reported). */
  async turnOff(): Promise<void> {
    this.apply(false);
    await this.kv.delete(KV_KEYS.aiShareWeightTrend);
  }

  private apply(next: boolean): void {
    if (next === this.on) return;
    this.on = next;
    for (const listener of [...this.listeners]) listener();
  }

  toString(): string {
    return `TrendSharePref(${this.on ? 'on' : 'off'})`;
  }
}
