import type { AiSettingsController } from './ai-settings-controller';
import type { InstanceAiView } from './instance-config';
import { photoUploadHost } from './rung-registry';

/**
 * The settings-side inputs of `runPhotoFlow` (src/capture), the ONE photo-consent orchestrator:
 * where the photo would go, whether every photo asks, whether the host was already agreed to, and
 * how to remember a per-host yes. All read from the live settings at call time. The one-shot
 * permit is `PhotoUploadPermit`; the guard that holds even if another path reaches the rung is
 * `ConsentGatedAiRung`. There is no second orchestrator here.
 */
export function photoFlowConsentDeps(
  controller: Pick<AiSettingsController, 'getSnapshot' | 'grantPhotoConsent'>,
  /** What this server offers; needed for the instance rung (its host is this page's). */
  instance?: () => InstanceAiView,
): {
  readonly uploadHost: () => string | null;
  readonly askBeforeEveryPhoto: () => boolean;
  readonly hasHostConsent: (host: string) => boolean;
  readonly grantHostConsent: (host: string) => Promise<void>;
} {
  return {
    uploadHost: () => photoUploadHost(controller.getSnapshot(), instance?.()),
    askBeforeEveryPhoto: () => controller.getSnapshot().askBeforeEveryPhoto,
    hasHostConsent: (host) => controller.getSnapshot().hasConsentFor(host),
    grantHostConsent: (host) => controller.grantPhotoConsent(host),
  };
}
