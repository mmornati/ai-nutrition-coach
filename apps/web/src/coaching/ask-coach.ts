import {
  buildChatMessages,
  COACH_LIMITS,
  containsNumberWithUnit,
  detectSupportSignal,
  validateCoachText,
  type ChatTurn,
  type CoachLocale,
  type Nutrients,
  type PlateLog,
  type Profile,
  type PromptNaming,
  type SupportSignal,
  type Unsubscribe,
} from '@anc/core';
import type { CoachingAi } from '../ai';
import { NO_AI_CONTEXT, type AiContextProvider } from './context';
import {
  completeBounded,
  reviewAskText,
  reviewContext,
  reviewOutputText,
  ReviewGate,
} from './review';

/** One line of the conversation as the screen shows it. */
export type ChatEntry =
  | { readonly id: number; readonly role: 'user'; readonly text: string }
  | {
      readonly id: number;
      readonly role: 'assistant';
      readonly kind: 'answer';
      readonly text: string;
    }
  /** A worry about food or health: answered on the device with the support line, never by an AI. */
  | {
      readonly id: number;
      readonly role: 'assistant';
      readonly kind: 'support';
      readonly signal: SupportSignal;
    }
  /**
   * The AI answered with something that did not pass the checks: nothing of it is kept. `weight`:
   * the answer talked of losing weight for someone who has not chosen that goal.
   */
  | {
      readonly id: number;
      readonly role: 'assistant';
      readonly kind: 'unsure';
      readonly weight?: true;
    };

/** Why the last send did not produce an answer (the question stays in the box). */
export type AskCoachNotice =
  | { readonly kind: 'busy' }
  | { readonly kind: 'consent' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failure'; readonly message: string };

export interface AskCoachState {
  readonly entries: readonly ChatEntry[];
  /** The question being answered right now. */
  readonly pending: string | null;
  /** Questions asked in this conversation. */
  readonly asked: number;
  readonly limitReached: boolean;
  readonly notice: AskCoachNotice | null;
}

export type SendOutcome =
  | 'answered'
  | 'support'
  | 'unsure'
  | 'empty'
  | 'tooLong'
  | 'limit'
  | 'busy'
  | 'consent'
  | 'unavailable'
  | 'failure';

export interface AskCoachDeps {
  readonly coaching: Pick<CoachingAi, 'complete'>;
  readonly numbersOn: () => boolean;
  readonly locale: () => CoachLocale;
  readonly targets: () => Required<Nutrients>;
  readonly profile: () => Profile | undefined;
  /** The goal, the step and the switches, read at each question (default: no weight talk). */
  readonly context?: AiContextProvider;
  readonly naming: PromptNaming;
  readonly live: () => boolean;
  /** The session's second-pass state (abort on lock, temperature, unreadable count). */
  readonly reviews?: ReviewGate;
  /** Test seam. Default `COACH_LIMITS.reviewTimeoutMs`: one review call. */
  readonly reviewTimeoutMs?: number;
  /** Test seam. Default `COACH_LIMITS.chatTimeoutMs`: the coach call of one turn. */
  readonly chatTimeoutMs?: number;
}

const EMPTY: AskCoachState = Object.freeze({
  entries: [],
  pending: null,
  asked: 0,
  limitReached: false,
  notice: null,
});

/**
 * "Ask the coach": a text-only conversation kept in memory for this unlocked session only. It is
 * never written to the store, never exported, and it is gone on a lock (the session that holds it
 * is thrown away) or when the person starts a new conversation.
 *
 * Every question is checked on the device first: a worry about eating or a health symptom is
 * answered with the calm support line and nothing is sent. The order of one turn is then fixed:
 *
 *   1. `detectSupportSignal` on the question (no network);
 *   2. ASK REVIEW: the same AI classifies the question, with the previous question and answer (a
 *      short follow-up inherits its topic), and may route it to the support copy; nothing else is
 *      sent before it answers;
 *   3. the coach call: the last seven days (as a JSON document), the targets and the profile go
 *      with the conversation;
 *   4. the lexical validator, as for a coach note;
 *   5. OUTPUT REVIEW: the same AI classifies the answer, with the question it answers and the
 *      previous exchange;
 *   6. the answer is shown.
 *
 * Three calls at most, in sequence, no retries. An error, a timeout or a rate limit at step 2 is
 * the usual notice (the question stays in the box, nothing is answered); an unreadable reply there,
 * or any failure or unsafe verdict at step 5, is the calm "not sure" line and nothing of the answer
 * is kept. The support copy is shown only for an actual route verdict. Limits: 6 questions, 500
 * characters each, answers of at most 800 characters.
 */
export class AskCoachConversation {
  readonly #deps: AskCoachDeps;
  readonly #listeners = new Set<() => void>();
  readonly #gate: ReviewGate;
  #state: AskCoachState = EMPTY;
  #nextId = 1;
  #inflight = false;
  /** Bumped by `reset`: an answer that lands after it is dropped. */
  #epoch = 0;

  constructor(deps: AskCoachDeps) {
    this.#deps = deps;
    this.#gate = deps.reviews ?? new ReviewGate({ live: deps.live });
  }

  getSnapshot = (): AskCoachState => this.#state;

  subscribe = (listener: () => void): Unsubscribe => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #set(next: Partial<AskCoachState>): void {
    this.#state = { ...this.#state, ...next };
    for (const l of [...this.#listeners]) l();
  }

  /** A new conversation. */
  reset(): void {
    this.#epoch++;
    this.#inflight = false;
    this.#state = EMPTY;
    this.#nextId = 1;
    for (const l of [...this.#listeners]) l();
  }

  clearNotice(): void {
    if (this.#state.notice !== null) this.#set({ notice: null });
  }

  /**
   * The turns the AI sees: a question together with the answer it got. A question that was routed
   * to the support line (or whose answer was dropped) is never sent, so a worry typed here stays
   * on the device.
   */
  #turns(): ChatTurn[] {
    const turns: ChatTurn[] = [];
    const { entries } = this.#state;
    entries.forEach((e, i) => {
      const next = entries[i + 1];
      if (
        e.role === 'user' &&
        next?.role === 'assistant' &&
        next.kind === 'answer' &&
        // An answer that quotes amounts is not sent back as history while numbers are off.
        (this.#deps.numbersOn() || !containsNumberWithUnit(next.text))
      ) {
        turns.push({ role: 'user', text: e.text }, { role: 'assistant', text: next.text });
      }
    });
    return turns;
  }

  /** The last question and the answer it got, for the reviews (a follow-up inherits its topic). */
  #previousExchange(): { readonly question: string; readonly answer: string } | undefined {
    const turns = this.#turns();
    const q = turns[turns.length - 2];
    const a = turns[turns.length - 1];
    return q === undefined || a === undefined ? undefined : { question: q.text, answer: a.text };
  }

  /** Adds a question and its (support or unsure) reply, and counts the turn. */
  #record(
    text: string,
    reply:
      { readonly kind: 'support'; readonly signal: SupportSignal } | { readonly kind: 'unsure' },
  ): void {
    const id = this.#nextId++;
    const asked = this.#state.asked + 1;
    this.#set({
      entries: [
        ...this.#state.entries,
        { id, role: 'user', text },
        { id: this.#nextId++, role: 'assistant', ...reply },
      ],
      pending: null,
      asked,
      limitReached: asked >= COACH_LIMITS.chatTurns,
      notice: null,
    });
  }

  /** Asks one question. `plates` are the last seven local days. Never throws. */
  async send(raw: string, plates: readonly PlateLog[]): Promise<SendOutcome> {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (text === '') return 'empty';
    if (text.length > COACH_LIMITS.inputChars) return 'tooLong';
    if (this.#inflight) return 'busy';
    if (this.#state.asked >= COACH_LIMITS.chatTurns) return 'limit';

    // Safety first, on the device, before anything is sent.
    const signal = detectSupportSignal(text);
    if (signal !== null) {
      this.#record(text, { kind: 'support', signal });
      return 'support';
    }

    const epoch = this.#epoch;
    this.#inflight = true;
    this.#set({ pending: text, notice: null });
    const numbersOn = this.#deps.numbersOn();
    const context = this.#deps.context?.() ?? NO_AI_CONTEXT;
    const reviewTimeoutMs = this.#deps.reviewTimeoutMs ?? COACH_LIMITS.reviewTimeoutMs;
    const gate = this.#gate;
    const previous = this.#previousExchange();
    try {
      // Step 2: nothing else is sent until this answers.
      const asked = await reviewAskText(this.#deps.coaching, text, {
        timeoutMs: reviewTimeoutMs,
        gate,
        previous,
      });
      if (epoch !== this.#epoch || !this.#deps.live() || gate.ended()) return 'failure';
      switch (asked.kind) {
        case 'ended':
          return 'failure';
        case 'none':
          break;
        case 'route':
          this.#record(text, { kind: 'support', signal: asked.signal });
          return 'support';
        case 'unknown':
          this.#record(text, { kind: 'unsure' });
          return 'unsure';
        case 'busy':
          this.#set({ pending: null, notice: { kind: 'busy' } });
          return 'busy';
        case 'consent':
          this.#set({ pending: null, notice: { kind: 'consent' } });
          return 'consent';
        case 'unavailable':
          this.#set({ pending: null, notice: { kind: 'unavailable' } });
          return 'unavailable';
        case 'timeout':
          this.#set({ pending: null, notice: { kind: 'failure', message: '' } });
          return 'failure';
        case 'failure':
          this.#set({ pending: null, notice: { kind: 'failure', message: asked.message } });
          return 'failure';
      }
      const messages = buildChatMessages({
        locale: this.#deps.locale(),
        context: {
          ...this.#deps.naming,
          numbersOn,
          plates,
          targets: this.#deps.targets(),
          profile: this.#deps.profile(),
          personalGuide: context.personalGuide,
          weightHelp: context.weightHelp,
          step: context.step,
          weightTrend: context.weightTrend,
        },
        turns: [...this.#turns(), { role: 'user', text }],
      });
      const result = await completeBounded(
        this.#deps.coaching,
        messages,
        { maxTokens: 500, temperature: 0.5 },
        { timeoutMs: this.#deps.chatTimeoutMs ?? COACH_LIMITS.chatTimeoutMs, signal: gate.signal },
      );
      if (epoch !== this.#epoch || !this.#deps.live() || gate.ended()) return 'failure';
      switch (result.kind) {
        case 'ended':
          return 'failure';
        case 'timeout':
          this.#set({ pending: null, notice: { kind: 'failure', message: '' } });
          return 'failure';
        case 'busy':
          this.#set({ pending: null, notice: { kind: 'busy' } });
          return 'busy';
        case 'consentRequired':
          this.#set({ pending: null, notice: { kind: 'consent' } });
          return 'consent';
        case 'unavailable':
          this.#set({ pending: null, notice: { kind: 'unavailable' } });
          return 'unavailable';
        case 'failure':
          this.#set({ pending: null, notice: { kind: 'failure', message: result.message } });
          return 'failure';
        case 'text': {
          const checked = validateCoachText(result.text, {
            maxChars: COACH_LIMITS.answerChars,
            numbersOn,
            maxQuestions: 2,
            locale: this.#deps.locale(),
            ...context.limits,
          });
          // Step 5: the answer is shown only if the same AI also finds it safe. Any other outcome
          // (unsafe, an error, a timeout, a rate limit) is the "not sure" line.
          const reviewed = checked.ok
            ? await reviewOutputText(
                this.#deps.coaching,
                checked.text,
                reviewContext(this.#deps.locale(), context.limits),
                { timeoutMs: reviewTimeoutMs, gate, chat: { question: text, previous } },
              )
            : null;
          if (epoch !== this.#epoch || !this.#deps.live() || gate.ended()) return 'failure';
          const shown = checked.ok && reviewed?.kind === 'ok';
          const userEntry = { id: this.#nextId++, role: 'user', text } as const;
          const answer: ChatEntry =
            checked.ok && shown
              ? { id: this.#nextId++, role: 'assistant', kind: 'answer', text: checked.text }
              : {
                  id: this.#nextId++,
                  role: 'assistant',
                  kind: 'unsure',
                  ...(!checked.ok && checked.problem === 'weightTalk'
                    ? { weight: true as const }
                    : {}),
                };
          const asked = this.#state.asked + 1;
          this.#set({
            entries: [...this.#state.entries, userEntry, answer],
            pending: null,
            asked,
            limitReached: asked >= COACH_LIMITS.chatTurns,
          });
          return shown ? 'answered' : 'unsure';
        }
        default: {
          const _exhaustive: never = result;
          return _exhaustive;
        }
      }
    } catch {
      if (epoch === this.#epoch)
        this.#set({ pending: null, notice: { kind: 'failure', message: '' } });
      return 'failure';
    } finally {
      if (epoch === this.#epoch) this.#inflight = false;
    }
  }

  toString(): string {
    return `AskCoachConversation(${this.#state.asked} questions)`;
  }
}
