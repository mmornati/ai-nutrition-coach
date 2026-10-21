import type { AiRung, RecognitionResult } from '@anc/core';
import type { AiSettings } from './ai-settings';
import { validateByokEndpoint } from './byok-endpoint';
import { ByokAiRung } from './byok-ai-rung';
import { HostBoundByokKeyStore, type ByokKeyStore } from './byok-key-store';
import { ConsentGatedAiRung } from './consent-gated-ai-rung';
import { strings } from '../i18n';
import { instanceConsentKey, type InstanceAiView } from './instance-config';
import { InstanceAiRung, type InstanceProvider } from './instance-ai-rung';
import { NoopAiRung, NotConfiguredAiRung, UnavailableAiRung } from './noop-ai-rung';
import type { PhotoUploadPermit } from './photo-upload-permit';
import type {
  ByokProvider,
  ChatMessage,
  ChatOptions,
  ChatResult,
  TextCompletionPort,
} from './types';

/**
 * The host an upload would go to under `settings`, or `null` when nothing would leave the
 * device: No AI, an unavailable rung, a BYOK endpoint that does not validate (and so is never
 * called), or the instance rung while this server does not offer AI. This is the host the consent
 * dialog names and the consent list is keyed by. For the instance rung it is a key made of THIS page's
 * own host (the same origin), the provider label and the model (`instanceConsentKey`): the photo goes
 * to this server first and on to the provider it names, and a changed provider asks again.
 */
export function photoUploadHost(settings: AiSettings, instance?: InstanceAiView): string | null {
  if (settings.rung.kind === 'instance') {
    if (instance === undefined || !instance.config.enabled || instance.host === '') return null;
    const endpoint = validateByokEndpoint(instance.endpointUrl);
    return endpoint.kind === 'valid' ? instanceConsentKey(endpoint.host, instance.config) : null;
  }
  if (settings.rung.kind !== 'byok') return null;
  const endpoint = validateByokEndpoint(settings.byokEndpointUrl);
  return endpoint.kind === 'valid' ? endpoint.host : null;
}

export interface AiRungDeps {
  /** Read at call time, so a change in Your AI reaches the next photo. */
  readonly getSettings: () => AiSettings;
  readonly keyStore: ByokKeyStore;
  readonly permit: PhotoUploadPermit;
  /** Builds the transport for the saved endpoint and model. */
  readonly createProvider: (args: { endpointUrl: string; model: string }) => ByokProvider;
  /** What this server offers (the instance rung). Absent: the instance rung is unavailable. */
  readonly instance?: () => InstanceAiView;
  /** Builds the key-less transport for the same-origin proxy. */
  readonly createInstanceProvider?: (args: {
    endpointUrl: string;
    model: string;
  }) => InstanceProvider;
  /** Reads the offer again (it may have been off when the session started). */
  readonly refreshInstance?: () => Promise<void>;
}

/** The instance rung for the CURRENT offer, or the reason there is none. */
function buildInstanceRung(
  deps: AiRungDeps,
): { readonly rung: InstanceAiRung; readonly view: InstanceAiView } | null {
  const view = deps.instance?.();
  if (view === undefined || !view.config.enabled || deps.createInstanceProvider === undefined) {
    return null;
  }
  return {
    view,
    rung: new InstanceAiRung({
      provider: deps.createInstanceProvider({
        endpointUrl: view.endpointUrl,
        model: view.config.model,
      }),
    }),
  };
}

/**
 * The adapter for the settings' rung. A persisted unavailable rung was normalised to No AI on
 * load, and the registry maps `hostedQuota` and `local` to a stub that makes no request anyway.
 */
export function buildAiRung(settings: AiSettings, deps: AiRungDeps): AiRung {
  switch (settings.rung.kind) {
    case 'noOp':
      return new NoopAiRung();
    case 'byok': {
      const host = photoUploadHost(settings);
      if (host === null) {
        // Endpoint unset or invalid: nothing can be sent, no key is read. Say "not configured".
        const notSet = settings.byokEndpointUrl.trim() === '' || settings.byokModel.trim() === '';
        return new NotConfiguredAiRung(() => {
          const t = strings().ai.failure;
          return notSet ? t.endpointNotSet : t.endpointInvalid;
        });
      }
      // The stored key is only released for the host it was entered for.
      const byok = new ByokAiRung({
        keyStore: new HostBoundByokKeyStore({
          inner: deps.keyStore,
          boundHost: settings.byokKeyHost,
          endpointHost: host,
        }),
        provider: deps.createProvider({
          endpointUrl: settings.byokEndpointUrl,
          model: settings.byokModel,
        }),
      });
      return new ConsentGatedAiRung({
        inner: byok,
        hasConsent: () => deps.getSettings().hasConsentFor(host),
        askEveryPhoto: () => deps.getSettings().askBeforeEveryPhoto,
        permit: deps.permit,
        host,
      });
    }
    case 'instance': {
      const built = buildInstanceRung(deps);
      const host = built === null ? null : photoUploadHost(settings, built.view);
      if (built === null || host === null) {
        // This server does not (or no longer) offer AI: nothing can be sent. Say so.
        return new NotConfiguredAiRung(() => strings().ai.failure.instanceUnavailable);
      }
      return new ConsentGatedAiRung({
        inner: built.rung,
        hasConsent: () => deps.getSettings().hasConsentFor(host),
        askEveryPhoto: () => deps.getSettings().askBeforeEveryPhoto,
        permit: deps.permit,
        host,
      });
    }
    case 'hostedQuota':
    case 'local':
      return new UnavailableAiRung();
  }
}

/** The offer may have been off (or unreadable) at unlock: read it once more before giving up. */
async function settleInstance(deps: AiRungDeps): Promise<void> {
  if (deps.getSettings().rung.kind !== 'instance') return;
  if (deps.instance?.().config.enabled === true) return;
  try {
    await deps.refreshInstance?.();
  } catch {
    // A failed read is "not offered".
  }
}

/**
 * The rung the photo path holds for the whole session: it picks the adapter from the CURRENT
 * settings on every call, so switching rung in Your AI takes effect on the next photo with no
 * restart.
 */
export function createLiveAiRung(deps: AiRungDeps): AiRung {
  return {
    recognize: async (photoBytes: Uint8Array): Promise<RecognitionResult> => {
      await settleInstance(deps);
      return buildAiRung(deps.getSettings(), deps).recognize(photoBytes);
    },
  };
}

/**
 * The text-completion seam (a later LLM coach reuses it): one chat completion through the instance
 * rung, i.e. through the same-origin proxy, with no key in the browser. It follows the settings on
 * every call. It answers `unavailable` unless the person's rung is "provided by this server" and
 * this server offers AI; it never touches the BYOK key or endpoint. It asks no consent: the
 * caller's text is the caller's to explain.
 */
export function createLiveChat(deps: AiRungDeps): TextCompletionPort {
  return {
    completeChat: async (
      messages: readonly ChatMessage[],
      options?: ChatOptions,
    ): Promise<ChatResult> => {
      if (deps.getSettings().rung.kind !== 'instance') return { kind: 'unavailable' };
      await settleInstance(deps);
      const built = buildInstanceRung(deps);
      return built === null ? { kind: 'unavailable' } : built.rung.completeChat(messages, options);
    },
  };
}
