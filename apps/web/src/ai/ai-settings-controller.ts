import type { AiRungConfig, Unsubscribe } from '@anc/core';
import { AsyncMutex } from '../storage/async-mutex';
import type { AiSettings } from './ai-settings';
import type { AiSettingsStore } from './ai-settings-store';

/**
 * The runtime home of the AI preferences: the single mutable source the rung, the BYOK transport
 * and the consent check all read, so a write changes the very next photo with no restart.
 *
 * A write is PERSISTED FIRST and only then published to subscribers, so the screen never claims a
 * setting it failed to keep. Every change is a read-modify-write over a store without
 * transactions, so it runs inside the storage `AsyncMutex`: two concurrent changes (a consent
 * grant racing a model edit) cannot lose each other's update. The shape is a
 * `useSyncExternalStore` source (`getSnapshot` + `subscribe`).
 */
export class AiSettingsController {
  readonly #store: AiSettingsStore;
  readonly #mutex = new AsyncMutex();
  readonly #listeners = new Set<() => void>();
  #state: AiSettings;

  constructor(args: { readonly store: AiSettingsStore; readonly initial: AiSettings }) {
    this.#store = args.store;
    this.#state = args.initial;
  }

  /** Reads the persisted settings (tolerantly) and builds the controller. */
  static async load(store: AiSettingsStore): Promise<AiSettingsController> {
    return new AiSettingsController({ store, initial: await store.read() });
  }

  getSnapshot = (): AiSettings => this.#state;

  subscribe = (listener: () => void): Unsubscribe => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Re-reads the store (after an unlock) and publishes the result. */
  reload(): Promise<void> {
    return this.#mutex.synchronized(async () => {
      this.#publish(await this.#store.read());
    });
  }

  /**
   * Applies `change` to the CURRENT settings, persists the result, then publishes it. Rejects
   * (and leaves the published state untouched) when persisting fails.
   */
  update(change: (current: AiSettings) => AiSettings): Promise<void> {
    return this.#mutex.synchronized(async () => {
      const next = change(this.#state);
      if (next.equals(this.#state)) return;
      await this.#store.write(next);
      this.#publish(next);
    });
  }

  #publish(next: AiSettings): void {
    this.#state = next;
    for (const l of [...this.#listeners]) l();
  }

  /** Switches the active rung (takes effect on the next photo). */
  setRung(rung: AiRungConfig): Promise<void> {
    return this.update((s) => s.copyWith({ rung }));
  }

  /**
   * Saves the BYOK endpoint and model as validated by the caller. `keyHost`, when given, records
   * the host the stored key was entered for (`''` clears it); pass it only with a key write.
   */
  setByokTarget(args: {
    readonly endpointUrl: string;
    readonly model: string;
    readonly keyHost?: string;
  }): Promise<void> {
    return this.update((s) =>
      s.copyWith({
        byokEndpointUrl: args.endpointUrl.trim(),
        byokModel: args.model.trim(),
        ...(args.keyHost === undefined ? {} : { byokKeyHost: args.keyHost.toLowerCase() }),
      }),
    );
  }

  /** The speech-to-text model for "Describe a meal" by voice; empty means the default. */
  setByokTranscriptionModel(model: string): Promise<void> {
    return this.update((s) => s.copyWith({ byokTranscriptionModel: model.trim() }));
  }

  /** Remembers that the person agreed to send photos to `host`. */
  grantPhotoConsent(host: string): Promise<void> {
    return this.update((s) =>
      s.copyWith({ photoConsentHosts: [...s.photoConsentHosts, host.toLowerCase()] }),
    );
  }

  /** Forgets the agreement for `host`; the next photo asks again. */
  revokePhotoConsent(host: string): Promise<void> {
    const gone = host.toLowerCase();
    return this.update((s) =>
      s.copyWith({ photoConsentHosts: [...s.photoConsentHosts].filter((h) => h !== gone) }),
    );
  }

  /** `true` = each photo needs its own yes; `false` = the per-host agreement applies. */
  setAskBeforeEveryPhoto(value: boolean): Promise<void> {
    return this.update((s) => s.copyWith({ askBeforeEveryPhoto: value }));
  }
}
