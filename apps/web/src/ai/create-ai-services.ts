import type { AiRung } from '@anc/core';
import type { KeyValueStore } from '../storage/key-value-store';
import { AiSettingsController } from './ai-settings-controller';
import { KvAiSettingsStore } from './ai-settings-store';
import { KvByokKeyStore, type ByokKeyStore } from './byok-key-store';
import { OpenAiCompatibleByokProvider } from './openai-compatible-provider';
import { PhotoUploadPermit } from './photo-upload-permit';
import { InstanceAiSource } from './instance-config';
import { CoachingAi } from './coaching-ai';
import { CoachingConsent } from './coaching-consent';
import { createLiveAiRung, createLiveChat } from './rung-registry';
import type { FetchLike } from '../net/capped-fetch';
import type { ClassifyFoodGroup, PhotoDigest, PhotoSanitizer, TextCompletionPort } from './types';
import { YourAi } from './your-ai';

/** Everything the AI screens and the capture flow share for one unlocked session. */
export interface AiServices {
  readonly settings: AiSettingsController;
  readonly keyStore: ByokKeyStore;
  readonly permit: PhotoUploadPermit;
  /** The rung the photo path holds; it follows the settings on every call. */
  readonly rung: AiRung;
  /** What this server offers (the instance-wide key); read from `/ai/config.json`. */
  readonly instance: InstanceAiSource;
  /**
   * Text completions through the instance rung (the seam a later coach reuses). `unavailable`
   * unless the person's rung is "provided by this server" and this server offers AI.
   */
  readonly chat: TextCompletionPort;
  readonly yourAi: YourAi;
  /**
   * The gate and transport of the AI coach (notes, Ask the coach, the weekly summary): text
   * completions through the person's rung (this server's AI or their own key), refused unless they
   * agreed to coaching for that destination. Separate from the photo consent.
   */
  readonly coaching: CoachingAi;
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
  /** Aborts every request the AI services make (the session ended). */
  readonly signal?: AbortSignal;
  /** This page's origin (the instance proxy is same-origin). Injectable for tests. */
  readonly origin?: () => string;
}

/** Wires the settings, key store, permit, live rung and Your AI actions over the encrypted `kv`. */
export async function createAiServices(options: CreateAiServicesOptions): Promise<AiServices> {
  const store = new KvAiSettingsStore(options.kv);
  const settings = await AiSettingsController.load(store);
  const keyStore = new KvByokKeyStore(options.kv);
  const permit = new PhotoUploadPermit(options.photoDigest);
  const provider = (args: { endpointUrl: string; model: string }): OpenAiCompatibleByokProvider =>
    new OpenAiCompatibleByokProvider({
      ...args,
      sanitizePhoto: options.sanitizePhoto,
      classifyFoodGroup: options.classifyFoodGroup,
      fetch: options.fetch,
      signal: options.signal,
    });
  // The key-less transport for the same-origin proxy: no Authorization header leaves the browser.
  const instanceProvider = (args: {
    endpointUrl: string;
    model: string;
  }): OpenAiCompatibleByokProvider =>
    new OpenAiCompatibleByokProvider({
      ...args,
      sendKey: false,
      sanitizePhoto: options.sanitizePhoto,
      classifyFoodGroup: options.classifyFoodGroup,
      fetch: options.fetch,
      signal: options.signal,
    });
  const instance = new InstanceAiSource({
    fetch: options.fetch,
    signal: options.signal,
    origin: options.origin,
  });
  const rungDeps = {
    getSettings: settings.getSnapshot,
    keyStore,
    permit,
    createProvider: provider,
    instance: instance.getSnapshot,
    createInstanceProvider: instanceProvider,
    refreshInstance: () => instance.refresh(),
  };

  // A NEW install defaults to the AI this server offers (no key to find, nothing to set up); a
  // person who already chose anything (even No AI) keeps their choice. Not awaited: a slow server
  // never holds the unlock, and the offer is read again whenever it matters.
  const freshInstall = !(await store.hasStored());
  void instance.refresh().then(async () => {
    if (!freshInstall || !instance.getSnapshot().config.enabled) return;
    if (options.signal?.aborted === true) return;
    try {
      if (await store.hasStored()) return;
      await settings.setRung({ kind: 'instance' });
    } catch {
      // Could not save: they stay on No AI, and can choose the offer in Your AI.
    }
  });

  const chat = createLiveChat(rungDeps);
  const consent = new CoachingConsent(options.kv);
  await consent.load();
  const coaching = new CoachingAi({ settings, instance, consent, chat });

  return {
    settings,
    keyStore,
    permit,
    rung: createLiveAiRung(rungDeps),
    instance,
    chat,
    coaching,
    yourAi: new YourAi({ settings, keyStore, createTester: provider, instance }),
  };
}
