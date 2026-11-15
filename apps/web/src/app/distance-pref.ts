/**
 * "Show the distance to my daily guide" (docs/adr/0008): whether the plain text line with the
 * distance to the energy guide is drawn under the energy bar. OFF by default, per person: kept in
 * the ENCRYPTED key/value table (`KV_KEYS.uiShowDistanceToGuide`), synced with the vault like the
 * numbers switch, and gone with "Erase all local data". Only the on state is stored; OFF is the
 * absence of the row.
 *
 * Same shape as `NumbersPref`: read once when the session is built, synchronously readable
 * (`current`) and observable (`subscribe`). An unreadable store reads as OFF (the default); a
 * write that fails changes nothing and throws, so the switch can say so. The line is also never
 * drawn while numbers are off (the screens combine the two).
 */
import { KV_KEYS, type KeyValueStore } from '../storage/key-value-store';

const ON = 'on';

export class DistancePref {
  private shown = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly kv: KeyValueStore) {}

  /** Read the stored answer (call once when the session is built). Never throws. */
  async load(): Promise<void> {
    try {
      this.apply((await this.kv.read(KV_KEYS.uiShowDistanceToGuide)) === ON);
    } catch {
      this.apply(false);
    }
  }

  /** Read the stored answer again; a failed read keeps what is shown. */
  async refresh(): Promise<void> {
    try {
      this.apply((await this.kv.read(KV_KEYS.uiShowDistanceToGuide)) === ON);
    } catch {
      // Keep the current answer.
    }
  }

  /** Whether the distance line is wanted right now. */
  current = (): boolean => this.shown;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Persist, then apply. Throws (and changes nothing) when the store cannot keep it. */
  async set(show: boolean): Promise<void> {
    if (show) await this.kv.write(KV_KEYS.uiShowDistanceToGuide, ON);
    else await this.kv.delete(KV_KEYS.uiShowDistanceToGuide);
    this.apply(show);
  }

  private apply(show: boolean): void {
    if (show === this.shown) return;
    this.shown = show;
    for (const listener of [...this.listeners]) listener();
  }

  toString(): string {
    return 'DistancePref()';
  }
}
