/**
 * "Show nutrition numbers": whether nutrient values, bars and gram previews are drawn. On by
 * default. It is kept in the ENCRYPTED key/value table (`KV_KEYS.uiShowNumbers`) with the other
 * preferences, so it goes with "Erase all local data". Only the off state is stored; ON is the
 * absence of the row.
 *
 * The numbers are only ever drawn after the unlock, so unlike the language there is no plaintext
 * hint: the value is read once when the session is built and held here, synchronously readable
 * (`current`) and observable (`subscribe`) so every screen follows the switch at once. An
 * unreadable store reads as ON (the default); a write that fails changes nothing and throws, so
 * the switch can say so.
 */
import { KV_KEYS, type KeyValueStore } from '../storage/key-value-store';

const OFF = 'off';

export class NumbersPref {
  private shown = true;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly kv: KeyValueStore) {}

  /** Read the stored answer (call once when the session is built). Never throws. */
  async load(): Promise<void> {
    try {
      this.apply((await this.kv.read(KV_KEYS.uiShowNumbers)) !== OFF);
    } catch {
      this.apply(true);
    }
  }

  /** Whether numbers are shown right now. */
  current = (): boolean => this.shown;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Persist, then apply. Throws (and changes nothing) when the store cannot keep it. */
  async set(show: boolean): Promise<void> {
    if (show) await this.kv.delete(KV_KEYS.uiShowNumbers);
    else await this.kv.write(KV_KEYS.uiShowNumbers, OFF);
    this.apply(show);
  }

  private apply(show: boolean): void {
    if (show === this.shown) return;
    this.shown = show;
    for (const listener of [...this.listeners]) listener();
  }

  toString(): string {
    return 'NumbersPref()';
  }
}
