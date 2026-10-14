import { aiRungConfigEquals, type AiRungConfig } from '@anc/core';
import { normaliseRungConfig, parseRungKind } from './rungs';

/**
 * The person's AI preferences: which rung is active, where the BYOK endpoint is, which model,
 * which host the stored key was entered for and which hosts they have agreed to send photos to.
 * None of it is a secret (the key lives in the key store), but it says which third parties they
 * trust, so it lives in the encrypted store and is never printed: `toString` and `toJSON` give
 * the rung and counts only.
 */
export interface AiSettingsInit {
  readonly rung?: AiRungConfig;
  /** As typed (validated on save and again at use). */
  readonly byokEndpointUrl?: string;
  readonly byokModel?: string;
  /**
   * The host the STORED key was entered for (lower-case; empty when unknown). The key is only
   * ever sent to that host, so editing the endpoint can never ship it to a server it was not
   * given to. Host only: not scheme, port or path.
   */
  readonly byokKeyHost?: string;
  /** Lower-cased hosts the person agreed to send photos to. */
  readonly photoConsentHosts?: Iterable<string>;
  /** Default ON: every photo needs its own yes. Off: the per-host agreement applies. */
  readonly askBeforeEveryPhoto?: boolean;
}

export class AiSettings {
  readonly rung: AiRungConfig;
  readonly byokEndpointUrl: string;
  readonly byokModel: string;
  readonly byokKeyHost: string;
  readonly photoConsentHosts: ReadonlySet<string>;
  readonly askBeforeEveryPhoto: boolean;

  constructor(init: AiSettingsInit = {}) {
    this.rung = init.rung ?? { kind: 'noOp' };
    this.byokEndpointUrl = init.byokEndpointUrl ?? '';
    this.byokModel = init.byokModel ?? '';
    this.byokKeyHost = (init.byokKeyHost ?? '').toLowerCase();
    this.photoConsentHosts = new Set(
      [...(init.photoConsentHosts ?? [])].map((h) => h.toLowerCase()),
    );
    this.askBeforeEveryPhoto = init.askBeforeEveryPhoto ?? true;
    Object.freeze(this);
  }

  static readonly defaults = new AiSettings();

  copyWith(patch: AiSettingsInit): AiSettings {
    return new AiSettings({
      rung: patch.rung ?? this.rung,
      byokEndpointUrl: patch.byokEndpointUrl ?? this.byokEndpointUrl,
      byokModel: patch.byokModel ?? this.byokModel,
      byokKeyHost: patch.byokKeyHost ?? this.byokKeyHost,
      photoConsentHosts: patch.photoConsentHosts ?? this.photoConsentHosts,
      askBeforeEveryPhoto: patch.askBeforeEveryPhoto ?? this.askBeforeEveryPhoto,
    });
  }

  hasConsentFor(host: string): boolean {
    return this.photoConsentHosts.has(host.toLowerCase());
  }

  equals(other: AiSettings): boolean {
    if (other.photoConsentHosts.size !== this.photoConsentHosts.size) return false;
    for (const h of this.photoConsentHosts) if (!other.photoConsentHosts.has(h)) return false;
    return (
      aiRungConfigEquals(this.rung, other.rung) &&
      other.byokEndpointUrl === this.byokEndpointUrl &&
      other.byokModel === this.byokModel &&
      other.byokKeyHost === this.byokKeyHost &&
      other.askBeforeEveryPhoto === this.askBeforeEveryPhoto
    );
  }

  /** The endpoint is deliberately not printed: it can carry a private hostname. */
  toString(): string {
    return (
      `AiSettings(rung: ${this.rung.kind}, ` +
      `endpoint: ${this.byokEndpointUrl === '' ? 'unset' : 'set'}, ` +
      `consentedHosts: ${this.photoConsentHosts.size}, ` +
      `askEveryPhoto: ${this.askBeforeEveryPhoto})`
    );
  }

  /** `JSON.stringify(settings)` in a log line stays redacted; persistence uses `encodeAiSettings`. */
  toJSON(): string {
    return this.toString();
  }
}

/** Bounds applied when decoding a blob someone could have hand-edited. */
const MAX_CONSENT_HOSTS = 64;
const MAX_HOST_LENGTH = 255;
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_MODEL_LENGTH = 200;

export function encodeAiSettings(settings: AiSettings): string {
  return JSON.stringify({
    v: 1,
    kind: settings.rung.kind,
    previous: settings.rung.previousRung?.previousKind ?? null,
    endpoint: settings.byokEndpointUrl,
    model: settings.byokModel,
    keyHost: settings.byokKeyHost,
    consents: [...settings.photoConsentHosts].sort(),
    askEveryPhoto: settings.askBeforeEveryPhoto,
  });
}

/**
 * Decodes a persisted blob. Anything unusable yields the defaults (or the usable parts of it);
 * this never throws. An unavailable rung is normalised to No AI.
 */
export function decodeAiSettings(raw: string | null | undefined): AiSettings {
  if (raw === null || raw === undefined || raw === '') return AiSettings.defaults;
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return AiSettings.defaults;
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    return AiSettings.defaults;
  }
  const blob = decoded as Record<string, unknown>;

  const kind = parseRungKind(blob.kind) ?? 'noOp';
  const previous = parseRungKind(blob.previous);
  const rung = normaliseRungConfig(
    previous === null ? { kind } : { kind, previousRung: { previousKind: previous } },
  );

  const consents = new Set<string>();
  if (Array.isArray(blob.consents)) {
    for (const h of blob.consents.slice(0, MAX_CONSENT_HOSTS)) {
      if (typeof h === 'string' && h !== '' && h.length <= MAX_HOST_LENGTH) {
        consents.add(h.toLowerCase());
      }
    }
  }
  const { endpoint, model, keyHost, askEveryPhoto } = blob;
  return new AiSettings({
    rung,
    byokEndpointUrl:
      typeof endpoint === 'string' && endpoint.length <= MAX_ENDPOINT_LENGTH ? endpoint : '',
    byokModel: typeof model === 'string' && model.length <= MAX_MODEL_LENGTH ? model : '',
    byokKeyHost:
      typeof keyHost === 'string' && keyHost.length <= MAX_HOST_LENGTH ? keyHost.toLowerCase() : '',
    photoConsentHosts: consents,
    // Absent or unusable means the safe default: ask every time.
    askBeforeEveryPhoto: typeof askEveryPhoto === 'boolean' ? askEveryPhoto : true,
  });
}
