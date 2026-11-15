// Test support for the AI coach: a scripted stand-in for the coaching gate. Test-only.
import { reviewKindOf } from '@anc/core';
import { ReviewGate } from './review';
import { AiSettings, KvAiSettingsStore } from '../ai';
import { TEST_KEY } from '../ai/testing';
import { KV_KEYS, type StoreBundle } from '../storage';
import type {
  ChatMessage,
  ChatOptions,
  CoachingDestination,
  CoachingResult,
  CoachingStatus,
} from '../ai';

export const READY_DESTINATION: CoachingDestination = {
  kind: 'byok',
  host: 'api.example.com',
  label: null,
  consentKey: 'api.example.com',
};
export const READY: CoachingStatus = { kind: 'ready', destination: READY_DESTINATION };

type Call = { messages: readonly ChatMessage[]; options: ChatOptions | undefined };

export interface ScriptedCoaching {
  /** The coach calls (notes, answers, the weekly paragraph), as before the second pass existed. */
  readonly calls: Call[];
  /** The review calls (the AI's second look at a question or a text). */
  readonly reviewCalls: Call[];
  /** Every call, in order: `ask` review, coach `main` call, `output` review. */
  readonly order: ('ask' | 'main' | 'output')[];
  complete(messages: readonly ChatMessage[], options?: ChatOptions): Promise<CoachingResult>;
  getSnapshot(): CoachingStatus;
}

/** How the scripted AI answers its two reviews (default: an ordinary question, a safe text). */
export interface ScriptedReviews {
  readonly ask?: (call: number) => CoachingResult | Promise<CoachingResult>;
  readonly output?: (call: number) => CoachingResult | Promise<CoachingResult>;
}

export const ASK_NONE = aiTextOf('{"route":"none"}');
export const OUTPUT_OK = aiTextOf('{"verdict":"ok","reason":"other"}');
function aiTextOf(text: string): CoachingResult {
  return { kind: 'text', text };
}

/**
 * Answers every coach call with `reply()`, the reviews with `reviews` (by default "ordinary
 * question" and "ok"), and records what it was asked. `reply` counts coach calls only.
 */
export function scriptedCoaching(
  reply: (call: number) => CoachingResult | Promise<CoachingResult>,
  status: CoachingStatus = READY,
  reviews: ScriptedReviews = {},
): ScriptedCoaching {
  const calls: Call[] = [];
  const reviewCalls: Call[] = [];
  const order: ScriptedCoaching['order'] = [];
  let asks = 0;
  let outputs = 0;
  return {
    calls,
    reviewCalls,
    order,
    complete: async (messages, options) => {
      const kind = reviewKindOf(messages);
      if (kind === 'ask') {
        order.push('ask');
        reviewCalls.push({ messages, options });
        return (reviews.ask ?? (() => ASK_NONE))(++asks);
      }
      if (kind === 'output') {
        order.push('output');
        reviewCalls.push({ messages, options });
        return (reviews.output ?? (() => OUTPUT_OK))(++outputs);
      }
      order.push('main');
      calls.push({ messages, options });
      return reply(calls.length);
    },
    getSnapshot: () => status,
  };
}

export const aiText = (text: string): CoachingResult => ({ kind: 'text', text });
export const aiNote = (note: string, followUp = ''): CoachingResult =>
  aiText(JSON.stringify({ note, followUp }));

/**
 * Puts a store on "my own key" (api.example.com) and, unless `consent: false`, says yes to AI
 * coaching for it. Pair it with a `FakeFetch` whose `jsonBody` is a `chatReply(...)`.
 */
export async function configureByokCoaching(
  bundle: StoreBundle,
  options: { readonly consent?: boolean } = {},
): Promise<void> {
  await new KvAiSettingsStore(bundle.kv).write(
    new AiSettings({
      rung: { kind: 'byok', previousRung: { previousKind: 'noOp' } },
      byokEndpointUrl: 'https://api.example.com/v1',
      byokModel: 'gpt-test',
      byokKeyHost: 'api.example.com',
    }),
  );
  await bundle.kv.write(KV_KEYS.aiByokKey, TEST_KEY);
  if (options.consent !== false) {
    await bundle.kv.write(KV_KEYS.aiCoachingConsent, JSON.stringify({ host: 'api.example.com' }));
  }
}

/** A fixed nonce, so a test can pin the exact request a review sends. */
export const TEST_NONCE = 'testnonce0001';
/** A second-pass gate whose nonce is fixed (the real one draws a random nonce per request). */
export const testReviewGate = (): ReviewGate => new ReviewGate({ nonce: () => TEST_NONCE });
