/**
 * The one next step the person accepted from the coach (`KV_KEYS.coachStep`, a small JSON object
 * validated by the core), kept in the ENCRYPTED key/value table with the other preferences, so it
 * syncs with the vault, goes into the JSON export and is erased with everything else. At most ONE
 * is active. Read once when the session is built, then synchronously readable (`current`) and
 * observable (`subscribe`). An unreadable store reads as "no step"; a write that fails changes
 * nothing and throws, so the screen can say so.
 *
 * It is never a score: nothing here counts days, runs or completions. "Done with this" and "Drop
 * it" both just remove it.
 */
import { parseStep, serializeStep, type CoachStep, type EpochMs, type StepOffer } from '@anc/core';
import { KV_KEYS, type KeyValueStore } from '../storage/key-value-store';

export class StepPref {
  private step: CoachStep | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly kv: KeyValueStore) {}

  /** Read the stored step (call once when the session is built). Never throws. */
  async load(): Promise<void> {
    try {
      this.apply(await this.read());
    } catch {
      this.apply(null);
    }
  }

  /** Read again after a pulled copy; a failed read keeps what is shown. */
  async refresh(): Promise<void> {
    try {
      this.apply(await this.read());
    } catch {
      // Keep the current step.
    }
  }

  /** The stored step, read fresh (for the export). */
  async read(): Promise<CoachStep | null> {
    return parseStep(await this.kv.read(KV_KEYS.coachStep));
  }

  current = (): CoachStep | null => this.step;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Accepts a step. Returns `false` (and keeps the active one) when there is already one: change it
   * first. Persists, then publishes. Throws when it could not be kept.
   */
  async accept(offer: StepOffer, at: EpochMs): Promise<boolean> {
    if (this.step !== null) return false;
    const next: CoachStep = {
      id: offer.id,
      at,
      ...(offer.food !== undefined ? { food: offer.food } : {}),
    };
    await this.kv.write(KV_KEYS.coachStep, serializeStep(next));
    this.apply(next);
    return true;
  }

  /** Keeps the step for another week: the review looks at the days from now on. */
  async renew(at: EpochMs): Promise<void> {
    const step = this.step;
    if (step === null) return;
    const next: CoachStep = { ...step, at };
    await this.kv.write(KV_KEYS.coachStep, serializeStep(next));
    this.apply(next);
  }

  /** "Done with this", "Drop it" and "Change it" all end here. Throws when it could not be done. */
  async clear(): Promise<void> {
    await this.kv.delete(KV_KEYS.coachStep);
    this.apply(null);
  }

  private apply(next: CoachStep | null): void {
    if (JSON.stringify(next) === JSON.stringify(this.step)) return;
    this.step = next;
    for (const listener of [...this.listeners]) listener();
  }

  toString(): string {
    return 'StepPref()';
  }
}
