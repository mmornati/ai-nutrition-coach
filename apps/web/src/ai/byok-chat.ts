import { strings } from '../i18n';
import type { ByokKeyStore } from './byok-key-store';
import type {
  ByokChatProvider,
  ChatMessage,
  ChatOptions,
  ChatOutcome,
  ChatResult,
  TextCompletionPort,
} from './types';

/**
 * Text completions through the person's OWN key (the BYOK rung), the same OpenAI-compatible
 * transport the photo path uses, with the same endpoint, model and host-bound key. The key is read
 * for the call and handed to the transport; it never appears in a result, an error or `toString`.
 * A missing key is a calm failure before any request. It asks no consent: the caller's text is the
 * caller's to explain (the coaching gate, `CoachingAi`).
 */
export class ByokChat implements TextCompletionPort {
  readonly #keyStore: ByokKeyStore;
  readonly #provider: ByokChatProvider;

  constructor(args: { keyStore: ByokKeyStore; provider: ByokChatProvider }) {
    this.#keyStore = args.keyStore;
    this.#provider = args.provider;
  }

  async completeChat(
    messages: readonly ChatMessage[],
    options: ChatOptions = {},
  ): Promise<ChatResult> {
    const t = strings().ai.failure;
    let apiKey: string | null;
    try {
      apiKey = (await this.#keyStore.hasKey()) ? await this.#keyStore.read() : null;
    } catch {
      apiKey = null;
    }
    if (apiKey === null || apiKey === '') return { kind: 'failure', message: t.keyMissing };

    let outcome: ChatOutcome;
    try {
      outcome = await this.#provider.completeChat({
        messages,
        apiKey,
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
        return { kind: 'failure', message: t.keyRejected };
      case 'failure':
        return { kind: 'failure', message: outcome.message };
    }
  }

  toString(): string {
    return 'ByokChat()';
  }
}
