import {
  buildAskReviewMessages,
  buildOutputReviewMessages,
  parseAskReview,
  parseOutputReview,
  REVIEW_LIMITS,
  supportSignalOfRoute,
  type ChatReviewContext,
  type CoachLocale,
  type CoachTextRules,
  type ReviewExchange,
  type SupportSignal,
} from '@anc/core';
import type { CoachingAi, CoachingResult } from '../ai';

/**
 * The second pass of the AI coach's safety layers (docs/ai-tiers.md "Three layers"): the same AI,
 * through the same rung and under the same coaching consent as the coach call, is asked to
 * classify a text. Nothing here is optional for the person and nothing is retried: ONE review call
 * per text, and every way it can go wrong (an error, a timeout, a rate limit, a refusal, a reply
 * that is not exactly the expected JSON) means the text is not shown.
 *
 * The reviewer sees the text under review and, for an output review, four context values
 * (`reviewContext`). For a chat turn it also sees the person's current question and the previous
 * question with the answer it got (capped), as separate delimited data-only blocks, because an
 * answer can only be judged against what it answers. It sees no plate, no profile, no other
 * history and no other message. The block tags carry a random per-request nonce drawn here (the
 * core module is pure), so a text cannot name them in advance.
 */

/** Why a review call produced no verdict. The text under review is not shown in any of these. */
export type ReviewFailure =
  | { readonly kind: 'busy' }
  | { readonly kind: 'consent' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'timeout' }
  /** The session ended (a lock): nothing was sent, or what came back is dropped. */
  | { readonly kind: 'ended' }
  | { readonly kind: 'failure'; readonly message: string };

/** `ok`: show the text. `unsafe` (also an unreadable reply, a refused over-long text): do not. */
export type OutputReviewOutcome =
  { readonly kind: 'ok' } | { readonly kind: 'unsafe' } | ReviewFailure;

export type AskReviewOutcome =
  /** The model routed the question to a support kind: answer with the fixed support copy. */
  | { readonly kind: 'route'; readonly signal: SupportSignal }
  /** An ordinary question: carry on to the coach call. */
  | { readonly kind: 'none' }
  /** The reply could not be read: nothing is answered and nothing more is sent. */
  | { readonly kind: 'unknown' }
  | ReviewFailure;

type Complete = Pick<CoachingAi, 'complete'>;

/** Three reviews in a row that the AI answered with something unreadable: it cannot do this check. */
const UNREADABLE_LIMIT = 3;

/** What the person is told in Settings, Your AI: the chosen AI can or cannot complete the check. */
export type ReviewHealth = 'ok' | 'cannotCheck';

/** 16 random base-36 characters: a per-request tag suffix a text cannot know in advance. */
function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

/**
 * What the second pass remembers for the length of one unlocked session: the abort signal that
 * cancels every review on a lock, whether the provider refused a temperature once (so it is not
 * sent again), and how many reviews in a row came back unreadable (a model that spends its tokens
 * thinking, or one that does not answer in JSON, would otherwise suppress every AI text silently).
 * It is a `useSyncExternalStore` source for the one calm line in Settings, Your AI.
 */
export class ReviewGate {
  readonly #nonce: () => string;
  readonly #live: () => boolean;
  readonly #listeners = new Set<() => void>();
  readonly signal: AbortSignal | undefined;
  #omitTemperature = false;
  #unreadable = 0;
  #health: ReviewHealth = 'ok';

  constructor(
    options: {
      readonly nonce?: () => string;
      readonly signal?: AbortSignal;
      readonly live?: () => boolean;
    } = {},
  ) {
    this.#nonce = options.nonce ?? randomNonce;
    this.#live = options.live ?? (() => true);
    this.signal = options.signal;
  }

  /** The session ended: nothing more is sent. */
  ended = (): boolean => this.signal?.aborted === true || !this.#live();

  nonce = (): string => this.#nonce();

  get omitTemperature(): boolean {
    return this.#omitTemperature;
  }

  /** The provider refused the temperature setting: it is left out from now on. */
  rejectTemperature(): void {
    this.#omitTemperature = true;
  }

  getSnapshot = (): ReviewHealth => this.#health;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #set(next: ReviewHealth): void {
    if (next === this.#health) return;
    this.#health = next;
    for (const l of [...this.#listeners]) l();
  }

  /** A reply that could be read (whatever it decided). */
  noteReadable(): void {
    this.#unreadable = 0;
    this.#set('ok');
  }

  /** A reply that could not be read. */
  noteUnreadable(): void {
    this.#unreadable++;
    if (this.#unreadable >= UNREADABLE_LIMIT) this.#set('cannotCheck');
  }

  /** The destination changed: the new AI starts with a clean record. */
  reset(): void {
    this.#omitTemperature = false;
    this.#unreadable = 0;
    this.#set('ok');
  }

  toString(): string {
    return `ReviewGate(${this.#health})`;
  }
}

/** The four values an output review sees besides the text, from what the validator already uses. */
export function reviewContext(
  locale: CoachLocale,
  limits: Pick<CoachTextRules, 'weightTalk' | 'floorKcal' | 'guideKcal'>,
) {
  return {
    locale,
    weightTalk: limits.weightTalk ?? 'restrained',
    guideKcal: limits.guideKcal ?? null,
    floorKcal: limits.floorKcal ?? 1200,
  } as const;
}

/**
 * One AI call with its own timeout and abort: cancelled when `timeoutMs` passes, when the session's
 * signal fires, or when `extra` does. Never throws. Used by the coach calls too (notes, answers,
 * the weekly paragraph), so none can hang for the length of a session.
 */
export async function completeBounded(
  coaching: Complete,
  messages: readonly { readonly role: 'system' | 'user' | 'assistant'; readonly content: string }[],
  options: { readonly maxTokens: number; readonly temperature?: number },
  bounds: {
    readonly timeoutMs: number;
    readonly signal?: Outer;
    readonly deadline?: Deadline | undefined;
  },
): Promise<CoachingResult | { readonly kind: 'timeout' } | { readonly kind: 'ended' }> {
  const deadline = bounds.deadline ?? startDeadline(bounds.timeoutMs, bounds.signal);
  const own = bounds.deadline === undefined;
  try {
    if (deadline.signal.aborted)
      return deadline.expired() ? { kind: 'timeout' } : { kind: 'ended' };
    const result = await Promise.race([
      coaching.complete(messages, { ...options, signal: deadline.signal }),
      deadline.done,
    ]);
    if (result === 'timeout') return { kind: 'timeout' };
    if (result === 'ended') return { kind: 'ended' };
    return result;
  } catch {
    return { kind: 'failure', message: '' };
  } finally {
    if (own) deadline.stop();
  }
}

/** One outer signal, several, or none (an undefined entry is skipped). */
type Outer = AbortSignal | readonly (AbortSignal | undefined)[] | undefined;

/** A timer and an abort controller that also follows outer signals (the session's, a time box's). */
export interface Deadline {
  readonly signal: AbortSignal;
  /** Resolves `timeout` when the time passes, `ended` when an outer signal fires. */
  readonly done: Promise<'timeout' | 'ended'>;
  expired(): boolean;
  /** Clears the timer and lets go of the outer signals. */
  stop(): void;
  /** Cancels whatever still listens to `signal`. */
  abort(): void;
}

export function startDeadline(timeoutMs: number, outer?: Outer): Deadline {
  const outers = (Array.isArray(outer) ? outer : [outer]).filter(
    (s): s is AbortSignal => s !== undefined,
  );
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hit = false;
  let onOuter: (() => void) | undefined;
  const done = new Promise<'timeout' | 'ended'>((resolve) => {
    timer = setTimeout(
      () => {
        hit = true;
        abort.abort();
        resolve('timeout');
      },
      Math.max(0, timeoutMs),
    );
    onOuter = () => {
      abort.abort();
      resolve('ended');
    };
    for (const o of outers) {
      if (o.aborted) onOuter();
      else o.addEventListener('abort', onOuter, { once: true });
    }
  });
  return {
    signal: abort.signal,
    done,
    expired: () => hit,
    stop: () => {
      clearTimeout(timer);
      if (onOuter !== undefined) for (const o of outers) o.removeEventListener('abort', onOuter);
    },
    abort: () => abort.abort(),
  };
}

type Raw = { readonly kind: 'text'; readonly text: string } | ReviewFailure;

/** The provider said "no" to the request's shape (a 400 or a 422): the temperature is the usual cause. */
const rejectedShape = (r: CoachingResult): boolean =>
  r.kind === 'failure' && (r.status === 400 || r.status === 422);

/**
 * One bounded review call: 200 tokens, temperature 0 unless this provider refused it once (then it
 * is left out, for the rest of the session, and the same call is repeated once without it),
 * cancelled when `timeoutMs` passes or the session ends. Nothing is sent after a lock.
 */
async function callReview(
  coaching: Complete,
  messages: readonly { readonly role: 'system' | 'user'; readonly content: string }[],
  timeoutMs: number,
  gate: ReviewGate,
): Promise<Raw> {
  if (timeoutMs <= 0) return { kind: 'timeout' };
  if (gate.ended()) return { kind: 'ended' };
  const deadline = startDeadline(timeoutMs, gate.signal);
  try {
    const send = (withTemperature: boolean) =>
      completeBounded(
        coaching,
        messages,
        {
          maxTokens: REVIEW_LIMITS.maxTokens,
          ...(withTemperature ? { temperature: REVIEW_LIMITS.temperature } : {}),
        },
        { timeoutMs, deadline },
      );
    let result = await send(!gate.omitTemperature);
    if (!gate.omitTemperature && rejectedShape(result as CoachingResult)) {
      gate.rejectTemperature();
      result = await send(false);
    }
    if (gate.ended()) return { kind: 'ended' };
    switch (result.kind) {
      case 'text':
        return { kind: 'text', text: result.text };
      case 'busy':
        return { kind: 'busy' };
      case 'consentRequired':
        return { kind: 'consent' };
      case 'unavailable':
        return { kind: 'unavailable' };
      case 'timeout':
        return { kind: 'timeout' };
      case 'ended':
        return { kind: 'ended' };
      case 'failure':
        return { kind: 'failure', message: result.message };
    }
  } finally {
    deadline.stop();
  }
}

/** Output review: is this coach text, which passed the validator, safe to show? */
export async function reviewOutputText(
  coaching: Complete,
  text: string,
  context: ReturnType<typeof reviewContext>,
  options: {
    readonly timeoutMs: number;
    readonly gate: ReviewGate;
    /** A chat answer: the question it answers and the exchange before it. */
    readonly chat?: ChatReviewContext | undefined;
  },
): Promise<OutputReviewOutcome> {
  const { gate } = options;
  const messages = buildOutputReviewMessages(text, context, {
    nonce: gate.nonce(),
    chat: options.chat,
  });
  // A text the review cannot take whole (empty, over the cap, carrying review markup) is never
  // shown unreviewed.
  if (messages === null) return { kind: 'unsafe' };
  const raw = await callReview(coaching, messages, options.timeoutMs, gate);
  if (raw.kind !== 'text') return raw;
  const read = parseOutputReview(raw.text);
  if (read.verdict === 'unsafe' && read.malformed) {
    gate.noteUnreadable();
    return { kind: 'unsafe' };
  }
  gate.noteReadable();
  return read.verdict === 'ok' ? { kind: 'ok' } : { kind: 'unsafe' };
}

/** Ask review: should this question get the support copy instead of an answer? */
export async function reviewAskText(
  coaching: Complete,
  text: string,
  options: {
    readonly timeoutMs: number;
    readonly gate: ReviewGate;
    /** The exchange before this question (a short follow-up inherits its topic). */
    readonly previous?: ReviewExchange | undefined;
  },
): Promise<AskReviewOutcome> {
  const { gate } = options;
  const messages = buildAskReviewMessages(text, {
    nonce: gate.nonce(),
    previous: options.previous,
  });
  if (messages === null) return { kind: 'unknown' };
  const raw = await callReview(coaching, messages, options.timeoutMs, gate);
  if (raw.kind !== 'text') return raw;
  const read = parseAskReview(raw.text);
  if (read.kind === 'unknown') {
    gate.noteUnreadable();
    return { kind: 'unknown' };
  }
  gate.noteReadable();
  return read.kind === 'route'
    ? { kind: 'route', signal: supportSignalOfRoute(read.route) }
    : { kind: 'none' };
}
