/**
 * The optional profile (`KV_KEYS.profile`, JSON), kept in the ENCRYPTED key/value table with the
 * other preferences, so it goes with "Erase all local data" and into the JSON export. No profile
 * is the absence of the row. Read once when the session is built, then synchronously readable
 * (`current`) and observable (`subscribe`); the daily guide (`targets`, `guide`) is derived from it
 * and from the latest weigh-in, and stable between changes. An unreadable or malformed row reads
 * as no profile; a write that fails changes nothing and throws, so the screen can say so.
 *
 * The person's dated body measurements (docs/adr/0008) live in their own synced table behind the
 * `MeasurementStore`; this holds the latest of each kind so the guide follows a new weight at once.
 */
import {
  dailyGuideFor,
  sanitizeProfile,
  type BodyMeasurement,
  type DailyGuide,
  type DailyTargets,
  type EpochMs,
  type MeasurementKind,
  type MeasurementStore,
  type Profile,
} from '@anc/core';
import { KV_KEYS, type KeyValueStore } from '../storage/key-value-store';

export class ProfilePref {
  private profile: Profile | undefined;
  private body: readonly BodyMeasurement[] = [];
  private derived: DailyGuide = dailyGuideFor();
  private unreadable = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly kv: KeyValueStore,
    private readonly measurements?: MeasurementStore,
  ) {}

  /** Read the stored profile (call once when the session is built). Never throws. */
  async load(): Promise<void> {
    try {
      this.apply(await this.read(), await this.readBody());
      this.unreadable = false;
    } catch {
      this.unreadable = true;
      this.apply(undefined, []);
    }
  }

  /** All dated measurements, newest day first; an unreadable list reads as none. */
  private async readBody(): Promise<readonly BodyMeasurement[]> {
    if (this.measurements === undefined) return [];
    const listed = await this.measurements.list();
    return listed.kind === 'measurement' ? listed.value : this.body;
  }

  /**
   * Read the stored profile again (a pulled copy may have changed it). A failed read keeps what is
   * shown: blanking it would let the next one-field edit save over the real profile.
   */
  async refresh(): Promise<void> {
    try {
      this.apply(await this.read(), await this.readBody());
      this.unreadable = false;
    } catch {
      this.unreadable = true;
    }
  }

  /** False when the last read failed: what `current` says is then a guess, not to be saved over. */
  trusted = (): boolean => !this.unreadable;

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
  targets = (): DailyTargets => this.derived.targets;

  /** The guide with how it was worked out (`explanation`) and any calm notice. */
  guide = (): DailyGuide => this.derived;

  /** Whether the person's own figures drive the guide (not the EU reference intakes). */
  personal = (): boolean => this.derived.personal;

  /** Every dated measurement, newest day first. */
  measurementList = (): readonly BodyMeasurement[] => this.body;

  /** The most recent measurement of a kind, if any. */
  latest = (kind: MeasurementKind): BodyMeasurement | undefined =>
    this.body.find((m) => m.kind === kind);

  /** Record (or replace the day's) measurement, then re-read; throws when it could not be kept. */
  async record(kind: MeasurementKind, value: number, at: EpochMs, day?: string): Promise<void> {
    if (this.measurements === undefined) throw new Error('no measurement store');
    const result = await this.measurements.record({
      kind,
      value,
      measuredAtUtc: at,
      ...(day === undefined ? {} : { day }),
    });
    if (result.kind !== 'measurement') throw new Error(`measurement ${result.reason}`);
    this.apply(this.profile, await this.readBody());
  }

  /**
   * Move a measurement to another day with a new value: the new day's entry is written first, then
   * the original day's is removed, so a failure leaves the original in place (never neither).
   */
  async moveMeasurement(
    kind: MeasurementKind,
    fromDay: string,
    value: number,
    at: EpochMs,
    toDay: string,
  ): Promise<void> {
    await this.record(kind, value, at, toDay);
    if (fromDay !== toDay) await this.removeMeasurement(kind, fromDay);
  }

  /** Remove one day's measurement of a kind; throws when it could not be done. */
  async removeMeasurement(kind: MeasurementKind, day: string): Promise<void> {
    if (this.measurements === undefined) throw new Error('no measurement store');
    const result = await this.measurements.remove(kind, day);
    if (result.kind !== 'measurement') throw new Error(`measurement ${result.reason}`);
    this.apply(this.profile, await this.readBody());
  }

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
    this.apply(clean, this.body);
  }

  /** Clears the profile answers only (height included); the dated measurements stay. */
  clear(): Promise<void> {
    return this.set(undefined);
  }

  /**
   * Removes EVERY dated measurement, each leaving a tombstone that syncs to the other devices. It
   * reads the list from the store itself, not from the cached one, so a row another device just
   * pulled in and this screen has not shown yet goes too. Throws when one could not be removed.
   */
  async removeAllMeasurements(): Promise<void> {
    if (this.measurements === undefined) throw new Error('no measurement store');
    const listed = await this.measurements.list();
    if (listed.kind !== 'measurement') throw new Error(`measurement ${listed.reason}`);
    try {
      for (const m of listed.value) {
        const result = await this.measurements.remove(m.kind, m.day);
        if (result.kind !== 'measurement') throw new Error(`measurement ${result.reason}`);
      }
    } finally {
      this.apply(this.profile, await this.readBody());
    }
  }

  private apply(next: Profile | undefined, body: readonly BodyMeasurement[]): void {
    if (
      JSON.stringify(next) === JSON.stringify(this.profile) &&
      JSON.stringify(body) === JSON.stringify(this.body)
    ) {
      return;
    }
    this.profile = next;
    this.body = body;
    this.derived = dailyGuideFor(next, this.latest('weight')?.value);
    for (const listener of [...this.listeners]) listener();
  }

  toString(): string {
    return 'ProfilePref()';
  }
}
