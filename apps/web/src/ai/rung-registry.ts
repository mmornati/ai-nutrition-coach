import type { AiRung, RecognitionResult } from '@anc/core';
import type { AiSettings } from './ai-settings';
import { validateByokEndpoint } from './byok-endpoint';
import { ByokAiRung } from './byok-ai-rung';
import { HostBoundByokKeyStore, type ByokKeyStore } from './byok-key-store';
import { ConsentGatedAiRung } from './consent-gated-ai-rung';
import { NoopAiRung, UnavailableAiRung } from './noop-ai-rung';
import type { PhotoUploadPermit } from './photo-upload-permit';
import type { ByokProvider } from './types';

/**
 * The host an upload would go to under `settings`, or `null` when nothing would leave the
 * device: No AI, an unavailable rung, or a BYOK endpoint that does not validate (and so is never
 * called). This is the host the consent dialog names and the consent list is keyed by.
 */
export function photoUploadHost(settings: AiSettings): string | null {
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
      // The stored key is only released for the host it was entered for.
      const byok = new ByokAiRung({
        keyStore: new HostBoundByokKeyStore({
          inner: deps.keyStore,
          boundHost: settings.byokKeyHost,
          endpointHost: host ?? '',
        }),
        provider: deps.createProvider({
          endpointUrl: settings.byokEndpointUrl,
          model: settings.byokModel,
        }),
      });
      if (host === null) return byok; // endpoint invalid: no key is released, nothing is sent
      return new ConsentGatedAiRung({
        inner: byok,
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

/**
 * The rung the photo path holds for the whole session: it picks the adapter from the CURRENT
 * settings on every call, so switching rung in Your AI takes effect on the next photo with no
 * restart.
 */
export function createLiveAiRung(deps: AiRungDeps): AiRung {
  return {
    recognize: (photoBytes: Uint8Array): Promise<RecognitionResult> =>
      buildAiRung(deps.getSettings(), deps).recognize(photoBytes),
  };
}
