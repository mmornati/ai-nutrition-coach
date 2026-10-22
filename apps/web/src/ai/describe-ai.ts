import { recognizedPlate, type RecognitionResult, type Unsubscribe } from '@anc/core';
import type { Locale } from '../i18n/locale';
import type { AiSettings } from './ai-settings';
import type { CoachingAi, CoachingStatus } from './coaching-ai';
import {
  buildDescribeMessages,
  DESCRIBE_MAX_TOKENS,
  DESCRIBE_TEMPERATURE,
  parseDescribedFoods,
} from './describe-meal';
import {
  buildRecipeMessages,
  parseRecipeReply,
  RECIPE_MAX_TOKENS,
  RECIPE_TEMPERATURE,
  type ReadRecipe,
} from './describe-recipe';
import type { InstanceAiView } from './instance-config';
import type { TranscribeOutcome, Transcriber } from './transcription';
import type { ClassifyFoodGroup } from './types';

/** What "Describe a meal" may do right now, and whether voice can be offered. */
export interface DescribeState {
  /** `noAi`, `needsConsent` (a destination exists, no yes yet) or `ready`. */
  readonly status: CoachingStatus;
  /** True when this destination can turn a recording into text (and has not failed to). */
  readonly voice: boolean;
}

/** A description sent and read, or the calm reason it was not. */
export type DescribeOutcome =
  | { readonly kind: 'recognized'; readonly result: RecognitionResult }
  | { readonly kind: 'noMatch' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'consentRequired' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'failure' };

/** A pasted recipe sent and read, or the calm reason it was not (any `failure` is read on the device instead). */
export type RecipeOutcome =
  | { readonly kind: 'recipe'; readonly recipe: ReadRecipe }
  | { readonly kind: 'empty' }
  | { readonly kind: 'consentRequired' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'failure' };

/** A recording sent and read, or the calm reason it was not. */
export type VoiceOutcome = TranscribeOutcome | { readonly kind: 'consentRequired' };

/**
 * The gate and transport of "Describe a meal": the text a person types (or a short voice recording)
 * goes to the AI they chose ONLY if they agreed for that very destination. The agreement is its own
 * (`ai.describeConsent`), neither the photo consent nor the coaching consent, with the same keying:
 * your own key's host, or for this server's AI the host, provider label and model together. It
 * lapses when the destination changes, is read at call time (a revoke takes effect on the next call)
 * and defaults to off.
 *
 * It reads the model's reply with the photo parser, so a description becomes the SAME recognised
 * foods list a photo does. A `useSyncExternalStore` source over {@link DescribeState}.
 */
type Gate = Pick<
  CoachingAi,
  'getSnapshot' | 'subscribe' | 'grant' | 'revoke' | 'complete' | 'dispose'
>;
type Source<T> = { getSnapshot(): T; subscribe(l: () => void): Unsubscribe };

export class DescribeAi {
  readonly #gate: Gate;
  readonly #transcriber: Transcriber;
  readonly #classify: ClassifyFoodGroup;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribers: Unsubscribe[] = [];
  /** Destinations whose voice failed with "not offered": hidden until the settings change. */
  readonly #voiceFailed = new Set<string>();
  #cached: DescribeState;
  #cachedKey = '';

  constructor(args: {
    readonly gate: Gate;
    readonly transcriber: Transcriber;
    readonly classifyFoodGroup: ClassifyFoodGroup;
    readonly settings: Source<AiSettings>;
    readonly instance: Source<InstanceAiView>;
  }) {
    this.#gate = args.gate;
    this.#transcriber = args.transcriber;
    this.#classify = args.classifyFoodGroup;
    this.#cached = this.#compute();
    this.#cachedKey = this.#keyOf(this.#cached);
    const changed = (): void => {
      if (this.#refresh()) for (const l of [...this.#listeners]) l();
    };
    this.#unsubscribers.push(
      args.gate.subscribe(changed),
      args.instance.subscribe(changed),
      args.settings.subscribe(() => {
        // "Until the settings change": any change gives voice another chance.
        this.#voiceFailed.clear();
        changed();
      }),
    );
  }

  #voiceOn(status: CoachingStatus): boolean {
    if (status.kind === 'noAi') return false;
    const v = this.#transcriber.availability();
    return v.kind === 'on' && !this.#voiceFailed.has(v.destinationKey);
  }

  #compute(): DescribeState {
    const status = this.#gate.getSnapshot();
    return { status, voice: this.#voiceOn(status) };
  }

  #keyOf(state: DescribeState): string {
    const s = state.status;
    return s.kind === 'noAi'
      ? `noAi|${state.voice}`
      : `${s.kind}|${s.destination.kind}|${s.destination.consentKey}|${s.destination.label ?? ''}|${state.voice}`;
  }

  #refresh(): boolean {
    const next = this.#compute();
    const key = this.#keyOf(next);
    if (key === this.#cachedKey) return false;
    this.#cached = next;
    this.#cachedKey = key;
    return true;
  }

  getSnapshot = (): DescribeState => this.#cached;

  subscribe = (listener: () => void): Unsubscribe => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Agrees to describing by AI for the CURRENT destination. `false` when there is none. */
  grant(): Promise<boolean> {
    return this.#gate.grant();
  }

  revoke(): Promise<void> {
    return this.#gate.revoke();
  }

  /**
   * One description through the person's AI. Nothing is sent unless they agreed for the current
   * destination (checked now). Never throws.
   */
  async describe(
    text: string,
    options: { readonly locale: Locale; readonly signal?: AbortSignal },
  ): Promise<DescribeOutcome> {
    const messages = buildDescribeMessages(text, options.locale);
    if (messages === null) return { kind: 'empty' };
    const reply = await this.#gate.complete(messages, {
      maxTokens: DESCRIBE_MAX_TOKENS,
      temperature: DESCRIBE_TEMPERATURE,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    switch (reply.kind) {
      case 'consentRequired':
      case 'unavailable':
      case 'busy':
        return { kind: reply.kind };
      case 'failure':
        return { kind: 'failure' };
      case 'text': {
        const parsed = parseDescribedFoods(reply.text, this.#classify);
        return parsed.kind === 'recognized'
          ? { kind: 'recognized', result: recognizedPlate(parsed.foods) }
          : { kind: 'noMatch' };
      }
    }
  }

  /**
   * One pasted recipe through the person's AI, on the same agreement as a description (the text they
   * paste is text they hand over for reading, and the disclosure says so). Nothing is sent unless
   * they agreed for the current destination (checked now). A reply that breaks any rule is a
   * `failure`. Never throws.
   */
  async readRecipe(
    text: string,
    options: { readonly locale: Locale; readonly signal?: AbortSignal },
  ): Promise<RecipeOutcome> {
    const messages = buildRecipeMessages(text, options.locale);
    if (messages === null) return { kind: 'empty' };
    const reply = await this.#gate.complete(messages, {
      maxTokens: RECIPE_MAX_TOKENS,
      temperature: RECIPE_TEMPERATURE,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    switch (reply.kind) {
      case 'consentRequired':
      case 'unavailable':
      case 'busy':
        return { kind: reply.kind };
      case 'failure':
        return { kind: 'failure' };
      case 'text': {
        const recipe = parseRecipeReply(reply.text);
        return recipe === null ? { kind: 'failure' } : { kind: 'recipe', recipe };
      }
    }
  }

  /**
   * One recording turned into text. Nothing is sent unless the person agreed for the current
   * destination AND voice is on for it. A "not offered here" answer hides voice for that
   * destination until the settings change. Never throws; the audio is not kept.
   */
  async transcribe(
    audio: Blob,
    options: { readonly locale: Locale; readonly signal?: AbortSignal },
  ): Promise<VoiceOutcome> {
    const status = this.#gate.getSnapshot();
    if (status.kind === 'noAi') return { kind: 'unavailable' };
    if (status.kind === 'needsConsent') return { kind: 'consentRequired' };
    const availability = this.#transcriber.availability();
    if (availability.kind === 'off' || this.#voiceFailed.has(availability.destinationKey)) {
      return { kind: 'unavailable' };
    }
    let outcome: TranscribeOutcome;
    try {
      outcome = await this.#transcriber.transcribe({
        audio,
        locale: options.locale,
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch {
      outcome = { kind: 'failure' };
    }
    if (outcome.kind === 'unsupported') {
      this.#voiceFailed.add(availability.destinationKey);
      if (this.#refresh()) for (const l of [...this.#listeners]) l();
    }
    return outcome;
  }

  dispose(): void {
    for (const u of this.#unsubscribers.splice(0)) u();
    this.#listeners.clear();
    this.#gate.dispose();
  }

  toString(): string {
    return `DescribeAi(${this.#cachedKey})`;
  }
}
