/**
 * The optional profile (`KV_KEYS.profile`, JSON), kept in the ENCRYPTED key/value table with the
 * other preferences, so it goes with "Erase all local data" and into the JSON export. No profile
 * is the absence of the row. Read once when the session is built, then synchronously readable
 * (`current`) and observable (`subscribe`); the daily guide (`targets`) is derived from it and
 * stable between changes. An unreadable or malformed row reads as no profile; a write that fails
 * changes nothing and throws, so the screen can say so.
 */
import { dailyTargetsFor, sanitizeProfile, type DailyTargets, type Profile } from '@anc/core';
import { KV_KEYS, type KeyValueStore } from '../storage/key-value-store';

export class ProfilePref {
  private profile: Profile | undefined;
  private derived: DailyTargets = dailyTargetsFor();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly kv: KeyValueStore) {}

  /** Read the stored profile (call once when the session is built). Never throws. */
  async load(): Promise<void> {
    try {
      this.apply(await this.read());
    } catch {
      this.apply(undefined);
    }
  }

  /** The stored profile, read fresh (for the export). */
  async read(): Promise<Profile | undefined> {
    const raw = await this.kv.read(KV_KEYS.profile);
    if (raw === null) return undefined;
    try {
      return sanitizeProfile(JSON.parse(raw));
    } catch {
      return undefined;
    }
  }

  current = (): Profile | undefined => this.profile;

  /** The daily guide for the current profile (the EU reference intakes without one). */
  targets = (): DailyTargets => this.derived;

  /** Whether a profile drives the guide (sex, age band and activity are all set). */
  personal = (): boolean => this.derived !== dailyTargetsFor();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Persist, then apply. An empty profile clears. Throws (and changes nothing) on a failed write. */
  async set(next: Profile | undefined): Promise<void> {
    const clean = sanitizeProfile(next);
    if (clean === undefined) await this.kv.delete(KV_KEYS.profile);
    else await this.kv.write(KV_KEYS.profile, JSON.stringify(clean));
    this.apply(clean);
  }

  clear(): Promise<void> {
    return this.set(undefined);
  }

  private apply(next: Profile | undefined): void {
    if (JSON.stringify(next) === JSON.stringify(this.profile)) return;
    this.profile = next;
    this.derived = dailyTargetsFor(next);
    for (const listener of [...this.listeners]) listener();
  }

  toString(): string {
    return 'ProfilePref()';
  }
}
