import { KV_KEYS, type KeyValueStore } from '../storage/key-value-store';
import { AiSettings, decodeAiSettings, encodeAiSettings } from './ai-settings';

/** Persistence for `AiSettings`: one JSON row of the encrypted store. */
export interface AiSettingsStore {
  /** The persisted settings; the defaults when none or unreadable. Never throws. */
  read(): Promise<AiSettings>;
  /**
   * Whether the person ever saved a choice. `false` only for a NEW install (nothing stored); an
   * unreadable store counts as "yes" so a default is never applied over a choice that exists.
   */
  hasStored(): Promise<boolean>;
  /** Throws when the value could not be kept (for example the store is locked). */
  write(settings: AiSettings): Promise<void>;
  clear(): Promise<void>;
}

export class KvAiSettingsStore implements AiSettingsStore {
  readonly #kv: KeyValueStore;

  constructor(kv: KeyValueStore) {
    this.#kv = kv;
  }

  async read(): Promise<AiSettings> {
    try {
      return decodeAiSettings(await this.#kv.read(KV_KEYS.aiSettings));
    } catch {
      // Locked or unreadable: the no-AI default, never a crash.
      return AiSettings.defaults;
    }
  }

  async hasStored(): Promise<boolean> {
    try {
      return (await this.#kv.read(KV_KEYS.aiSettings)) !== null;
    } catch {
      return true;
    }
  }

  write(settings: AiSettings): Promise<void> {
    return this.#kv.write(KV_KEYS.aiSettings, encodeAiSettings(settings));
  }

  clear(): Promise<void> {
    return this.#kv.delete(KV_KEYS.aiSettings);
  }

  toString(): string {
    return 'KvAiSettingsStore()';
  }
}

export class InMemoryAiSettingsStore implements AiSettingsStore {
  #settings: AiSettings;
  #stored: boolean;

  /** `initial` given = a choice was already stored; none = a new install. */
  constructor(initial?: AiSettings) {
    this.#settings = initial ?? AiSettings.defaults;
    this.#stored = initial !== undefined;
  }

  async read(): Promise<AiSettings> {
    return this.#settings;
  }

  async hasStored(): Promise<boolean> {
    return this.#stored;
  }

  async write(settings: AiSettings): Promise<void> {
    this.#settings = settings;
    this.#stored = true;
  }

  async clear(): Promise<void> {
    this.#settings = AiSettings.defaults;
    this.#stored = false;
  }

  toString(): string {
    return 'InMemoryAiSettingsStore()';
  }
}
