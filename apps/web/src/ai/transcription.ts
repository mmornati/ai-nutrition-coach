/**
 * Voice to text for "Describe a meal": one short recording POSTed as multipart to a
 * Whisper-compatible `<endpoint>/audio/transcriptions`, the transcript read back as plain text.
 *
 * What leaves the device is pinned (and tested): a multipart body of exactly `model`, `language`
 * (the app language, `en` or `fr`) and `file` (the recording, named `voice.<ext>`); the headers are
 * only `Authorization` (your own key) or nothing at all (this server's proxy holds the key). Nothing
 * else: no date, id, name, history. The recording is held in memory by the caller only until this
 * request returns; it is never stored. TRANSCRIPTION ONLY: the reply is a text string. No speaker
 * is identified, no voice is fingerprinted (docs/adults-only.md).
 *
 * Two destinations, one transport:
 *  - your own key: your endpoint's `/audio/transcriptions`, the key host-bound exactly like the chat
 *    (it is sent only to the host it was entered for), the model from Your AI (default `whisper-1`);
 *  - this server's AI: `/ai/v1/audio/transcriptions` on THIS origin with no key, the model the
 *    server advertises in `/ai/config.json` (the proxy refuses any other).
 * Some providers have no such endpoint: a 404 means "not offered here" and the caller hides voice
 * for that destination until the settings change. Never throws; every outcome is a calm kind.
 */
import type { Locale } from '../i18n/locale';
import { cappedFetch, type FetchLike } from '../net/capped-fetch';
import { DEFAULT_TRANSCRIPTION_MODEL, type AiSettings } from './ai-settings';
import { validateByokEndpoint } from './byok-endpoint';
import { HostBoundByokKeyStore, type ByokKeyStore } from './byok-key-store';
import type { InstanceAiView } from './instance-config';
import { instanceConsentKey } from './instance-config';

/** The longest transcript kept (characters): the description box takes 500. */
export const MAX_TRANSCRIPT_LENGTH = 500;
/** The proxy takes at most this many bytes (about 30 s of Opus or AAC is far below it). */
export const MAX_AUDIO_BYTES = 1024 * 1024;

export type TranscribeOutcome =
  | { readonly kind: 'text'; readonly text: string }
  /** The service answered but heard no words. */
  | { readonly kind: 'empty' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'keyRejected' }
  /** 404 / 405 / 501: this destination has no transcription. */
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'tooLarge' }
  /** Nothing is set up to transcribe with (no destination, no model, no key). */
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failure' };

/** Whether voice can be offered right now, and the key that identifies its destination. */
export type VoiceAvailability =
  { readonly kind: 'off' } | { readonly kind: 'on'; readonly destinationKey: string };

export interface Transcriber {
  /** Read at call time: follows the settings and the server's offer. */
  availability(): VoiceAvailability;
  transcribe(args: {
    readonly audio: Blob;
    readonly locale: Locale;
    readonly signal?: AbortSignal;
  }): Promise<TranscribeOutcome>;
}

/** A file name the proxy accepts and a provider can read the format from. */
export function recordingFilename(mime: string): string {
  const type = mime.toLowerCase();
  if (type.includes('mp4') || type.includes('aac') || type.includes('m4a')) return 'voice.m4a';
  if (type.includes('ogg')) return 'voice.ogg';
  if (type.includes('wav')) return 'voice.wav';
  if (type.includes('mpeg') || type.includes('mp3')) return 'voice.mp3';
  return 'voice.webm';
}

interface PostArgs {
  readonly url: string;
  /** `null` for this server's proxy (no Authorization header at all). */
  readonly apiKey: string | null;
  readonly model: string;
  readonly audio: Blob;
  readonly locale: Locale;
  readonly fetch: FetchLike | undefined;
  readonly signal: AbortSignal | undefined;
}

/** One transcription request through the shared capped fetch. Never throws. */
export async function postTranscription(args: PostArgs): Promise<TranscribeOutcome> {
  if (args.audio.size === 0) return { kind: 'empty' };
  if (args.audio.size > MAX_AUDIO_BYTES) return { kind: 'tooLarge' };
  const form = new FormData();
  form.append('model', args.model);
  form.append('language', args.locale);
  form.append('file', args.audio, recordingFilename(args.audio.type));
  const r = await cappedFetch(args.url, {
    method: 'POST',
    // No Content-Type: the browser writes multipart/form-data with its boundary.
    headers: args.apiKey === null ? {} : { Authorization: `Bearer ${args.apiKey.trim()}` },
    body: form,
    ...(args.fetch ? { fetchImpl: args.fetch } : {}),
    ...(args.signal ? { signal: args.signal } : {}),
  });
  if (r.kind === 'failure') return { kind: 'failure' };
  const { status } = r;
  if (status === 401 || status === 403) return { kind: 'keyRejected' };
  if (status === 429) return { kind: 'busy' };
  if (status === 404 || status === 405 || status === 501) return { kind: 'unsupported' };
  if (status === 413) return { kind: 'tooLarge' };
  if (status < 200 || status >= 300) return { kind: 'failure' };
  let text: unknown;
  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(r.body));
    text =
      typeof json === 'object' && json !== null ? (json as Record<string, unknown>)['text'] : null;
  } catch {
    return { kind: 'failure' };
  }
  if (typeof text !== 'string') return { kind: 'failure' };
  const cleaned = Array.from(
    text
      .replace(/\p{Cc}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .slice(0, MAX_TRANSCRIPT_LENGTH)
    .join('')
    .trim();
  return cleaned === '' ? { kind: 'empty' } : { kind: 'text', text: cleaned };
}

export interface LiveTranscriberDeps {
  readonly getSettings: () => AiSettings;
  readonly keyStore: ByokKeyStore;
  readonly instance: () => InstanceAiView;
  readonly fetch?: FetchLike | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** The destination voice would go to under the current settings, or `null`. */
function target(deps: LiveTranscriberDeps): {
  readonly key: string;
  readonly url: string;
  readonly model: string;
  /** For your own key: the host the key must be bound to. */
  readonly byokHost: string | null;
} | null {
  const settings = deps.getSettings();
  if (settings.rung.kind === 'instance') {
    const view = deps.instance();
    if (!view.config.enabled || view.host === '') return null;
    const model = view.config.transcriptionModel;
    if (model === undefined) return null;
    const endpoint = validateByokEndpoint(view.endpointUrl);
    if (endpoint.kind !== 'valid') return null;
    return {
      key: `${instanceConsentKey(endpoint.host, view.config)}|${model}`,
      url: new URL('audio/transcriptions', endpoint.base).href,
      model,
      byokHost: null,
    };
  }
  if (settings.rung.kind === 'byok') {
    if (settings.byokModel.trim() === '') return null;
    const endpoint = validateByokEndpoint(settings.byokEndpointUrl);
    if (endpoint.kind !== 'valid') return null;
    const model = settings.byokTranscriptionModel.trim() || DEFAULT_TRANSCRIPTION_MODEL;
    return {
      key: `${endpoint.host}|${model}`,
      url: new URL('audio/transcriptions', endpoint.base).href,
      model,
      byokHost: endpoint.host,
    };
  }
  return null;
}

/** The transcriber for the person's CURRENT rung (it follows the settings on every call). */
export function createLiveTranscriber(deps: LiveTranscriberDeps): Transcriber {
  return {
    availability: () => {
      const t = target(deps);
      return t === null ? { kind: 'off' } : { kind: 'on', destinationKey: t.key };
    },
    transcribe: async ({ audio, locale, signal }): Promise<TranscribeOutcome> => {
      const t = target(deps);
      if (t === null) return { kind: 'unavailable' };
      let apiKey: string | null = null;
      if (t.byokHost !== null) {
        try {
          const keys = new HostBoundByokKeyStore({
            inner: deps.keyStore,
            boundHost: deps.getSettings().byokKeyHost,
            endpointHost: t.byokHost,
          });
          apiKey = (await keys.hasKey()) ? await keys.read() : null;
        } catch {
          apiKey = null;
        }
        if (apiKey === null || apiKey === '') return { kind: 'keyRejected' };
      }
      try {
        return await postTranscription({
          url: t.url,
          apiKey,
          model: t.model,
          audio,
          locale,
          fetch: deps.fetch,
          signal: signal ?? deps.signal,
        });
      } catch {
        return { kind: 'failure' };
      }
    },
  };
}
