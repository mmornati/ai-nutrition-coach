import type { Unsubscribe } from '@anc/core';
import type { AiSettings } from './ai-settings';
import { validateByokEndpoint } from './byok-endpoint';
import type { CoachingConsent } from './coaching-consent';
import { instanceConsentKey, type InstanceAiView } from './instance-config';
import type { ChatMessage, ChatOptions, ChatResult, TextCompletionPort } from './types';

/** Where meal data would go: the host the consent names, and a short label when the server has one. */
export interface CoachingDestination {
  readonly kind: 'instance' | 'byok';
  /** Lower-case host (for this server's AI, this page's own host). */
  readonly host: string;
  /** The provider label this server shows for its AI (instance only), else `null`. */
  readonly label: string | null;
  /**
   * What the consent is recorded against: the host for your own key, and for this server's AI the
   * host, provider label and model together, so the yes lapses if the operator changes either.
   */
  readonly consentKey: string;
}

/**
 * What the coaching features may do right now:
 *  - `noAi`: no usable AI (No AI, or an endpoint that is not set, or this server offers none);
 *  - `needsConsent`: there is somewhere to send to, but the person has not said yes for it;
 *  - `ready`: both. Only then is anything sent.
 */
export type CoachingStatus =
  | { readonly kind: 'noAi' }
  | { readonly kind: 'needsConsent'; readonly destination: CoachingDestination }
  | { readonly kind: 'ready'; readonly destination: CoachingDestination };

/** A text completion, or a refusal because the person has not agreed. */
export type CoachingResult = ChatResult | { readonly kind: 'consentRequired' };

/** The destination under `settings` (and this server's offer), or `null` when nothing would be sent. */
export function coachingDestination(
  settings: AiSettings,
  instance: InstanceAiView,
): CoachingDestination | null {
  if (settings.rung.kind === 'instance') {
    if (!instance.config.enabled || instance.host === '') return null;
    return {
      kind: 'instance',
      host: instance.host,
      label: instance.config.label,
      consentKey: instanceConsentKey(instance.host, instance.config),
    };
  }
  if (settings.rung.kind === 'byok') {
    if (settings.byokModel.trim() === '') return null;
    const endpoint = validateByokEndpoint(settings.byokEndpointUrl);
    return endpoint.kind === 'valid'
      ? { kind: 'byok', host: endpoint.host, label: null, consentKey: endpoint.host }
      : null;
  }
  return null;
}

/**
 * The gate in front of every coaching call (coach notes, Ask the coach, the weekly summary): no
 * call is made unless the person's rung can chat AND they agreed to coaching for that very
 * destination. The agreement is read at call time, so a revoke takes effect on the next call. It
 * is a `useSyncExternalStore` source.
 */
export class CoachingAi {
  readonly #settings: { getSnapshot(): AiSettings; subscribe(l: () => void): Unsubscribe };
  readonly #instance: { getSnapshot(): InstanceAiView; subscribe(l: () => void): Unsubscribe };
  readonly #consent: CoachingConsent;
  readonly #chat: TextCompletionPort;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribers: Unsubscribe[] = [];
  #cached: CoachingStatus = { kind: 'noAi' };
  #cachedKey = 'noAi';

  constructor(args: {
    readonly settings: { getSnapshot(): AiSettings; subscribe(l: () => void): Unsubscribe };
    readonly instance: { getSnapshot(): InstanceAiView; subscribe(l: () => void): Unsubscribe };
    readonly consent: CoachingConsent;
    readonly chat: TextCompletionPort;
  }) {
    this.#settings = args.settings;
    this.#instance = args.instance;
    this.#consent = args.consent;
    this.#chat = args.chat;
    this.#refresh();
    const changed = (): void => {
      if (this.#refresh()) for (const l of [...this.#listeners]) l();
    };
    this.#unsubscribers.push(
      args.settings.subscribe(changed),
      args.instance.subscribe(changed),
      args.consent.subscribe(changed),
    );
  }

  #compute(): CoachingStatus {
    const destination = coachingDestination(
      this.#settings.getSnapshot(),
      this.#instance.getSnapshot(),
    );
    if (destination === null) return { kind: 'noAi' };
    return this.#consent.grantedFor(destination.consentKey)
      ? { kind: 'ready', destination }
      : { kind: 'needsConsent', destination };
  }

  /** Recomputes the cached status; true when it changed. */
  #refresh(): boolean {
    const next = this.#compute();
    const key =
      next.kind === 'noAi'
        ? 'noAi'
        : `${next.kind}|${next.destination.kind}|${next.destination.consentKey}|${next.destination.label ?? ''}`;
    // A yes given for another destination is forgotten for good, not just ignored: switching back
    // must ask again. (An unknown destination, e.g. the server's offer not read yet, clears nothing.)
    if (next.kind === 'needsConsent' && this.#consent.getSnapshot() !== null) {
      void this.#consent.revoke().catch(() => undefined);
    }
    if (key === this.#cachedKey) return false;
    this.#cached = next;
    this.#cachedKey = key;
    return true;
  }

  getSnapshot = (): CoachingStatus => this.#cached;

  subscribe = (listener: () => void): Unsubscribe => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Agrees to coaching for the CURRENT destination. `false` when there is none. Throws if not kept. */
  async grant(): Promise<boolean> {
    const status = this.#compute();
    if (status.kind === 'noAi') return false;
    await this.#consent.grant(status.destination.consentKey);
    return true;
  }

  revoke(): Promise<void> {
    return this.#consent.revoke();
  }

  /**
   * One chat completion for a coaching feature. Nothing is sent unless the person agreed for the
   * current destination (checked now, not when the screen opened). Never throws.
   */
  async complete(messages: readonly ChatMessage[], options?: ChatOptions): Promise<CoachingResult> {
    const status = this.#compute();
    if (status.kind === 'noAi') return { kind: 'unavailable' };
    if (status.kind === 'needsConsent') return { kind: 'consentRequired' };
    try {
      return await this.#chat.completeChat(messages, options);
    } catch {
      return { kind: 'failure', message: '' };
    }
  }

  dispose(): void {
    for (const u of this.#unsubscribers.splice(0)) u();
    this.#listeners.clear();
  }

  toString(): string {
    return `CoachingAi(${this.#cachedKey})`;
  }
}
