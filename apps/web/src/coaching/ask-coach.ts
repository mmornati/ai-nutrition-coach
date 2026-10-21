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
  /** The AI answered with something that did not pass the checks: nothing of it is kept. */
  | { readonly id: number; readonly role: 'assistant'; readonly kind: 'unsure' };

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
  readonly naming: PromptNaming;
  readonly live: () => boolean;
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
 * answered with the calm support line and nothing is sent. Otherwise the last seven days (as a JSON
 * document), the targets and the profile go with the conversation, and the answer passes the same
 * validator as a coach note before it is shown. Limits: 6 questions, 500 characters each, answers of
 * at most 800 characters.
 */
export class AskCoachConversation {
  readonly #deps: AskCoachDeps;
  readonly #listeners = new Set<() => void>();
  #state: AskCoachState = EMPTY;
  #nextId = 1;
  #inflight = false;
  /** Bumped by `reset`: an answer that lands after it is dropped. */
  #epoch = 0;

  constructor(deps: AskCoachDeps) {
    this.#deps = deps;
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
      const id = this.#nextId++;
      this.#set({
        entries: [
          ...this.#state.entries,
          { id, role: 'user', text },
          { id: this.#nextId++, role: 'assistant', kind: 'support', signal },
        ],
        asked: this.#state.asked + 1,
        limitReached: this.#state.asked + 1 >= COACH_LIMITS.chatTurns,
        notice: null,
      });
      return 'support';
    }

    const epoch = this.#epoch;
    this.#inflight = true;
    this.#set({ pending: text, notice: null });
    const numbersOn = this.#deps.numbersOn();
    try {
      const messages = buildChatMessages({
        locale: this.#deps.locale(),
        context: {
          ...this.#deps.naming,
          numbersOn,
          plates,
          targets: this.#deps.targets(),
          profile: this.#deps.profile(),
        },
        turns: [...this.#turns(), { role: 'user', text }],
      });
      const result = await this.#deps.coaching.complete(messages, {
        maxTokens: 500,
        temperature: 0.5,
      });
      if (epoch !== this.#epoch || !this.#deps.live()) return 'failure';
      switch (result.kind) {
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
          });
          const userEntry = { id: this.#nextId++, role: 'user', text } as const;
          const answer: ChatEntry = checked.ok
            ? { id: this.#nextId++, role: 'assistant', kind: 'answer', text: checked.text }
            : { id: this.#nextId++, role: 'assistant', kind: 'unsure' };
          const asked = this.#state.asked + 1;
          this.#set({
            entries: [...this.#state.entries, userEntry, answer],
            pending: null,
            asked,
            limitReached: asked >= COACH_LIMITS.chatTurns,
          });
          return checked.ok ? 'answered' : 'unsure';
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
