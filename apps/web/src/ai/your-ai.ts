import { createRecordByokChange, type AiRungConfig, type AiRungKind } from '@anc/core';
import { AsyncMutex } from '../storage/async-mutex';
import type { AiSettingsController } from './ai-settings-controller';
import { validateByokEndpoint, type ByokEndpointProblem } from './byok-endpoint';
import { byokKeyEndingHint, keyHasInvalidCharacters, type ByokKeyStore } from './byok-key-store';
import type { ByokConnectionResult, ByokConnectionTester } from './openai-compatible-provider';
import { normaliseRungConfig } from './rungs';

/** Outcome of `YourAi.saveByok`. The screen maps each to calm keyed copy. */
export type SaveByokResult =
  | { readonly kind: 'saved' }
  | { readonly kind: 'endpointInvalid'; readonly problem: ByokEndpointProblem }
  | { readonly kind: 'modelMissing' }
  /** The pasted key contains whitespace or control characters. */
  | { readonly kind: 'keyInvalid' }
  /** Endpoint and model were saved, but there is no key (typed or stored): the rung stays. */
  | { readonly kind: 'keyMissing' }
  /** A key is saved for another host. It is NOT sent to the new host; nothing was changed. */
  | { readonly kind: 'keyForOtherHost'; readonly savedFor: string }
  | { readonly kind: 'storageFailed' };

export interface KeyStatus {
  readonly hasKey: boolean;
  /** The last four characters, only for keys of 12+ characters. Never more. */
  readonly keyEnding: string | null;
}

export type ConnectionTesterFactory = (args: {
  endpointUrl: string;
  model: string;
}) => ByokConnectionTester;

/**
 * The Your AI actions: the single sanctioned path to set, replace and remove the BYOK key, and
 * to test the connection. No result, error or `toString` here carries the key.
 */
export class YourAi {
  readonly #settings: AiSettingsController;
  readonly #keyStore: ByokKeyStore;
  readonly #createTester: ConnectionTesterFactory;
  readonly #flow = new AsyncMutex();

  constructor(args: {
    readonly settings: AiSettingsController;
    readonly keyStore: ByokKeyStore;
    readonly createTester: ConnectionTesterFactory;
  }) {
    this.#settings = args.settings;
    this.#keyStore = args.keyStore;
    this.#createTester = args.createTester;
  }

  /** Whether a key is saved and its safe ending. The key is read into a local and dropped. */
  async keyStatus(): Promise<KeyStatus> {
    try {
      const key = await this.#keyStore.read();
      const hasKey = key !== null && key !== '';
      return { hasKey, keyEnding: hasKey ? byokKeyEndingHint(key) : null };
    } catch {
      return { hasKey: false, keyEnding: null };
    }
  }

  /** Chooses No AI. The saved key (if any) is kept; only the rung changes. */
  selectNoAi(): Promise<void> {
    return this.#settings.setRung({ kind: 'noOp' });
  }

  /**
   * Validates and saves endpoint + model, stores `newKey` when one was typed (bound to the
   * endpoint's host), and makes "my own key" the active rung when a key exists. The key is
   * written first and the binding second: if the second write fails the binding stays unset,
   * which reads as "key unusable" (fail closed), never as "usable anywhere".
   */
  saveByok(args: {
    readonly endpointUrl: string;
    readonly model: string;
    readonly newKey?: string;
  }): Promise<SaveByokResult> {
    return this.#flow.synchronized(async (): Promise<SaveByokResult> => {
      const endpoint = validateByokEndpoint(args.endpointUrl);
      if (endpoint.kind === 'invalid')
        return { kind: 'endpointInvalid', problem: endpoint.problem };
      if (args.model.trim() === '') return { kind: 'modelMissing' };
      const typedKey = args.newKey?.trim() ?? '';
      if (typedKey !== '' && keyHasInvalidCharacters(typedKey)) return { kind: 'keyInvalid' };

      const host = endpoint.host;
      try {
        const current = this.#settings.getSnapshot().rung;
        const previousKind: AiRungKind =
          current.kind === 'byok' ? (current.previousRung?.previousKind ?? 'noOp') : current.kind;

        if (typedKey !== '') {
          await this.#recordByokChange().enterByok({ apiKey: typedKey, previousKind });
          await this.#settings.setByokTarget({
            endpointUrl: args.endpointUrl,
            model: args.model,
            keyHost: host,
          });
        } else if (await this.#keyStore.hasKey()) {
          const savedFor = this.#settings.getSnapshot().byokKeyHost;
          if (savedFor !== host) {
            // Editing the endpoint must never redirect an existing key to a server it was not
            // given to: refuse until it is pasted again.
            return { kind: 'keyForOtherHost', savedFor };
          }
          await this.#settings.setByokTarget({ endpointUrl: args.endpointUrl, model: args.model });
          await this.#settings.setRung(
            normaliseRungConfig({ kind: 'byok', previousRung: { previousKind } }),
          );
        } else {
          await this.#settings.setByokTarget({ endpointUrl: args.endpointUrl, model: args.model });
          return { kind: 'keyMissing' };
        }
      } catch {
        return { kind: 'storageFailed' };
      }
      return { kind: 'saved' };
    });
  }

  /** Removes the key and flips the rung back to the exact previous choice (not always No AI). */
  removeByok(): Promise<void> {
    return this.#flow.synchronized(async () => {
      await this.#recordByokChange().removeByok();
      await this.#settings.update((s) => s.copyWith({ byokKeyHost: '' }));
    });
  }

  /**
   * "Test connection" with what is on the form. `typedKey` wins over the saved key; with neither
   * the result is `notConfigured`. The saved key is used only for the host it was entered for.
   * Nothing is persisted by a test.
   */
  async testConnection(args: {
    readonly endpointUrl: string;
    readonly model: string;
    readonly typedKey?: string;
  }): Promise<ByokConnectionResult> {
    let key = args.typedKey?.trim() ?? '';
    if (key === '') {
      let stored: string;
      try {
        stored = (await this.#keyStore.read()) ?? '';
      } catch {
        stored = '';
      }
      if (stored !== '') {
        const endpoint = validateByokEndpoint(args.endpointUrl);
        if (
          endpoint.kind === 'valid' &&
          endpoint.host !== this.#settings.getSnapshot().byokKeyHost
        ) {
          return { kind: 'keyForOtherHost' };
        }
        key = stored;
      }
    }
    return this.#createTester({
      endpointUrl: args.endpointUrl.trim(),
      model: args.model.trim(),
    }).testConnection({ apiKey: key });
  }

  #recordByokChange(): ReturnType<typeof createRecordByokChange> {
    const settings = this.#settings;
    return createRecordByokChange({
      keyStore: this.#keyStore,
      configStore: {
        read: async (): Promise<AiRungConfig> => settings.getSnapshot().rung,
        write: (config: AiRungConfig) => settings.setRung(normaliseRungConfig(config)),
      },
    });
  }

  toString(): string {
    return 'YourAi()';
  }
}
