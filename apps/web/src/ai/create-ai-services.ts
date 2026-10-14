import type { AiRung } from '@anc/core';
import type { KeyValueStore } from '../storage/key-value-store';
import { AiSettingsController } from './ai-settings-controller';
import { KvAiSettingsStore } from './ai-settings-store';
import { KvByokKeyStore, type ByokKeyStore } from './byok-key-store';
import { OpenAiCompatibleByokProvider } from './openai-compatible-provider';
import { PhotoUploadPermit } from './photo-upload-permit';
import { createLiveAiRung } from './rung-registry';
import type { ClassifyFoodGroup, FetchLike, PhotoDigest, PhotoSanitizer } from './types';
import { YourAi } from './your-ai';

/** Everything the AI screens and the capture flow share for one unlocked session. */
export interface AiServices {
  readonly settings: AiSettingsController;
  readonly keyStore: ByokKeyStore;
  readonly permit: PhotoUploadPermit;
  /** The rung the photo path holds; it follows the settings on every call. */
  readonly rung: AiRung;
  readonly yourAi: YourAi;
}

export interface CreateAiServicesOptions {
  /** The encrypted store's key/value facts. Build this AFTER the unlock; rebuild on every lock. */
  readonly kv: KeyValueStore;
  /** Phase 5's photo sanitiser (metadata removal + real MIME type). */
  readonly sanitizePhoto: PhotoSanitizer;
  /** Phase 5's food-group classifier, the fallback for a model food with no valid group. */
  readonly classifyFoodGroup: ClassifyFoodGroup;
  /** Phase 5's SHA-256 photo digest, which binds a one-shot permit to one photo. */
  readonly photoDigest: PhotoDigest;
  readonly fetch?: FetchLike;
}

/** Wires the settings, key store, permit, live rung and Your AI actions over the encrypted `kv`. */
export async function createAiServices(options: CreateAiServicesOptions): Promise<AiServices> {
  const settings = await AiSettingsController.load(new KvAiSettingsStore(options.kv));
  const keyStore = new KvByokKeyStore(options.kv);
  const permit = new PhotoUploadPermit(options.photoDigest);
  const provider = (args: { endpointUrl: string; model: string }): OpenAiCompatibleByokProvider =>
    new OpenAiCompatibleByokProvider({
      ...args,
      sanitizePhoto: options.sanitizePhoto,
      classifyFoodGroup: options.classifyFoodGroup,
      fetch: options.fetch,
    });
  return {
    settings,
    keyStore,
    permit,
    rung: createLiveAiRung({
      getSettings: settings.getSnapshot,
      keyStore,
      permit,
      createProvider: provider,
    }),
    yourAi: new YourAi({ settings, keyStore, createTester: provider }),
  };
}
