import {
  NO_MATCH,
  recognitionFailure,
  recognizedPlate,
  type AiRung,
  type RecognitionResult,
} from '@anc/core';
import { strings } from '../i18n';
import type {
  ByokOutcome,
  ChatMessage,
  ChatOptions,
  ChatOutcome,
  ChatResult,
  TextCompletionPort,
} from './types';

/** The transport the instance rung reads through (the OpenAI-compatible provider, no key). */
export interface InstanceProvider {
  recognize(args: { photoBytes: Uint8Array; apiKey: string }): Promise<ByokOutcome>;
  completeChat(args: {
    readonly messages: readonly ChatMessage[];
    readonly maxTokens?: number;
    readonly temperature?: number;
    readonly signal?: AbortSignal;
  }): Promise<ChatOutcome>;
}

/**
 * The "provided by this server" rung. Sends the same request as BYOK to the SAME-ORIGIN proxy
 * (`/ai/v1/chat/completions`) with no Authorization header: the server adds the operator's key,
 * and nothing in the browser (this class, its transport, a log) ever holds one.
 *
 * Two jobs through one transport: `recognize` (a photo) and `completeChat` (text), so a later
 * coach reuses this rung instead of growing a second client.
 *
 * Failure wording is about THIS SERVER, calm and without a countdown: a 429 is "busy, try again in
 * a moment", a 404 means the operator switched the AI off, a refused key or a 5xx is the
 * operator's side. Do not hand it to the UI directly: the registry wraps `recognize` in the
 * consent gate (`ConsentGatedAiRung`).
 */
export class InstanceAiRung implements AiRung, TextCompletionPort {
  readonly #provider: InstanceProvider;

  constructor(args: { provider: InstanceProvider }) {
    this.#provider = args.provider;
  }

  async recognize(photoBytes: Uint8Array): Promise<RecognitionResult> {
    let outcome: ByokOutcome;
    try {
      outcome = await this.#provider.recognize({ photoBytes, apiKey: '' });
    } catch {
      return recognitionFailure('unknown', strings().ai.failure.unreachable);
    }
    switch (outcome.kind) {
      case 'recognized':
        return recognizedPlate(outcome.foods);
      case 'noMatch':
        return NO_MATCH;
      case 'keyRejected':
        return recognitionFailure('httpError', strings().ai.failure.instanceError);
      case 'quotaExhausted':
        return recognitionFailure('httpError', strings().ai.failure.instanceBusy);
      case 'failure':
        return recognitionFailure(outcome.cause, instanceFailureMessage(outcome));
    }
  }

  async completeChat(
    messages: readonly ChatMessage[],
    options: ChatOptions = {},
  ): Promise<ChatResult> {
    const t = strings().ai.failure;
    let outcome: ChatOutcome;
    try {
      outcome = await this.#provider.completeChat({
        messages,
        ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
        ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch {
      return { kind: 'failure', message: t.unreachable };
    }
    switch (outcome.kind) {
      case 'text':
        return { kind: 'text', text: outcome.text };
      case 'quotaExhausted':
        return { kind: 'busy' };
      case 'keyRejected':
        return { kind: 'failure', message: t.instanceError };
      case 'failure':
        return outcome.status === 404
          ? { kind: 'unavailable' }
          : { kind: 'failure', message: instanceFailureMessage(outcome) };
    }
  }

  toString(): string {
    return 'InstanceAiRung()';
  }
}

/** A 404 (the operator turned the AI off) and a 5xx get words about this server; the rest pass. */
function instanceFailureMessage(outcome: {
  readonly cause: string;
  readonly message: string;
  readonly status?: number | undefined;
}): string {
  const t = strings().ai.failure;
  if (outcome.status === 404) return t.instanceUnavailable;
  if (outcome.status !== undefined && outcome.status >= 500) return t.instanceError;
  return outcome.message;
}
