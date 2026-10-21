import type { Unsubscribe } from '@anc/core';
import { cappedFetch, type FetchLike } from '../net/capped-fetch';

/**
 * The instance-wide AI tier: the person who hosts this app may keep ONE AI key on the server
 * (`AI_PROXY_*` in `infra/server.env`, docs/self-host.md). nginx relays `POST /ai/v1/chat/completions`
 * to the provider with that key; the browser sends no key and never sees it. What the browser CAN
 * read is `GET /ai/config.json`: whether the proxy is on, the model it uses, whether it also turns a
 * short voice recording into text (and with which model), and a short label for the
 * provider, nothing else (no key, no upstream address).
 *
 * The file is untrusted input (any server can answer that path, a captive portal included), so it
 * is read strictly: anything that is not exactly the shape below is "not offered".
 */
export type InstanceAiConfig =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly model: string;
      readonly label: string;
      /**
       * The model this server uses to turn a short voice recording into text, when it offers that
       * (`AI_PROXY_TRANSCRIPTION=1`). The proxy accepts a recording only with exactly this model.
       */
      readonly transcriptionModel?: string;
    };

export const INSTANCE_AI_OFF: InstanceAiConfig = Object.freeze({ enabled: false });

export const INSTANCE_CONFIG_PATH = '/ai/config.json';
/** The OpenAI-compatible base of the same-origin proxy (the provider adds `/chat/completions`). */
export const INSTANCE_BASE_PATH = '/ai/v1';

/** Bounds mirror what `40-render-ai-proxy.sh` accepts. */
const MODEL_PATTERN = /^[A-Za-z0-9._:/@+-]{1,128}$/;
const LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,59}$/;
/** A few hundred bytes: anything bigger is not our file. */
const MAX_CONFIG_BYTES = 4096;
/** A slow or hanging server must not hold the unlock: the config is a nicety. */
const CONFIG_TIMEOUT_MS = 3000;

/** Reads `/ai/config.json`'s body. Never throws; anything unexpected is `{ enabled: false }`. */
export function parseInstanceAiConfig(value: unknown): InstanceAiConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return INSTANCE_AI_OFF;
  const o = value as Record<string, unknown>;
  if (o['enabled'] !== true) return INSTANCE_AI_OFF;
  const { model, label } = o;
  if (typeof model !== 'string' || !MODEL_PATTERN.test(model)) return INSTANCE_AI_OFF;
  if (typeof label !== 'string' || !LABEL_PATTERN.test(label)) return INSTANCE_AI_OFF;
  // Voice to text is a separate, optional offer: `transcription: true` AND a valid model name.
  const tx = o['transcriptionModel'];
  if (o['transcription'] === true && typeof tx === 'string' && MODEL_PATTERN.test(tx)) {
    return { enabled: true, model, label, transcriptionModel: tx };
  }
  return { enabled: true, model, label };
}

/**
 * The consent key of the instance rung: this server's host AND the provider label AND the model.
 * A person agreed to send photos to THAT combination, so when the operator changes the provider
 * or the model the old agreement no longer applies and the next photo asks again.
 */
export const INSTANCE_CONSENT_PREFIX = 'instance:';

export function instanceConsentKey(host: string, config: { label: string; model: string }): string {
  return `${INSTANCE_CONSENT_PREFIX}${host}|${config.label}|${config.model}`;
}

/** "host (label)" for a consent list; `null` when `key` is an ordinary host. */
export function describeInstanceConsent(key: string): string | null {
  if (!key.startsWith(INSTANCE_CONSENT_PREFIX)) return null;
  const [host = '', label = ''] = key.slice(INSTANCE_CONSENT_PREFIX.length).split('|');
  return `${host} — ${label}`;
}

/** What the rung registry and the screens read. `host` is this page's own host (same origin). */
export interface InstanceAiView {
  readonly config: InstanceAiConfig;
  /** Lower-case host name of this server, without port: what the consent dialog names. */
  readonly host: string;
  /** `<origin>/ai/v1`: what the OpenAI-compatible provider is pointed at. */
  readonly endpointUrl: string;
}

export interface InstanceAiSourceOptions {
  readonly fetch?: FetchLike | undefined;
  /** Aborts the request (the session ended). */
  readonly signal?: AbortSignal | undefined;
  /** This page's origin. Injectable for tests; defaults to `location.origin`. */
  readonly origin?: (() => string) | undefined;
}

/**
 * The session's view of the instance AI offer, a `useSyncExternalStore` source. Loaded once when
 * the AI services are built and again on demand (`refresh`): the offer can change when the
 * operator restarts the container, and a failed first read (offline, a slow server) must not
 * stick. A failed read is "not offered", never an error the person has to deal with.
 */
export class InstanceAiSource {
  readonly #fetch: FetchLike | undefined;
  readonly #signal: AbortSignal | undefined;
  readonly #origin: () => string;
  readonly #listeners = new Set<() => void>();
  #config: InstanceAiConfig = INSTANCE_AI_OFF;
  #loaded = false;
  #inflight: Promise<void> | null = null;
  #view: InstanceAiView;

  constructor(options: InstanceAiSourceOptions = {}) {
    this.#fetch = options.fetch;
    this.#signal = options.signal;
    this.#origin = options.origin ?? (() => globalThis.location.origin);
    this.#view = this.#makeView();
  }

  #makeView(): InstanceAiView {
    const origin = ((): string => {
      try {
        return this.#origin();
      } catch {
        return '';
      }
    })();
    const host = ((): string => {
      try {
        return new URL(origin).hostname.toLowerCase().replace(/^\[|\]$/g, '');
      } catch {
        return '';
      }
    })();
    return { config: this.#config, host, endpointUrl: `${origin}${INSTANCE_BASE_PATH}` };
  }

  getSnapshot = (): InstanceAiView => this.#view;

  /** True once a read has finished, whatever it found. */
  get loaded(): boolean {
    return this.#loaded;
  }

  subscribe = (listener: () => void): Unsubscribe => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Reads `/ai/config.json` (concurrent calls share one request). Never rejects. */
  refresh(): Promise<void> {
    this.#inflight ??= this.#read().finally(() => {
      this.#inflight = null;
    });
    return this.#inflight;
  }

  async #read(): Promise<void> {
    let next: InstanceAiConfig = INSTANCE_AI_OFF;
    try {
      const r = await cappedFetch(INSTANCE_CONFIG_PATH, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        maxBytes: MAX_CONFIG_BYTES,
        headersTimeoutMs: CONFIG_TIMEOUT_MS,
        bodyTimeoutMs: CONFIG_TIMEOUT_MS,
        ...(this.#fetch ? { fetchImpl: this.#fetch } : {}),
        ...(this.#signal ? { signal: this.#signal } : {}),
      });
      if (r.kind === 'response' && r.status === 200 && r.body.byteLength > 0) {
        next = parseInstanceAiConfig(JSON.parse(new TextDecoder().decode(r.body)));
      }
    } catch {
      next = INSTANCE_AI_OFF;
    }
    this.#loaded = true;
    if (this.#signal?.aborted === true) return;
    this.#publish(next);
  }

  #publish(next: InstanceAiConfig): void {
    const same =
      next.enabled === this.#config.enabled &&
      (!next.enabled ||
        (this.#config.enabled &&
          next.model === this.#config.model &&
          next.label === this.#config.label &&
          next.transcriptionModel === this.#config.transcriptionModel));
    this.#config = next;
    if (same) return;
    this.#view = this.#makeView();
    for (const l of [...this.#listeners]) l();
  }

  toString(): string {
    return 'InstanceAiSource()';
  }
}
