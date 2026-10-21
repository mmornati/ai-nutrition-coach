// Test support for the AI coach: a scripted stand-in for the coaching gate. Test-only.
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
};
export const READY: CoachingStatus = { kind: 'ready', destination: READY_DESTINATION };

export interface ScriptedCoaching {
  readonly calls: { messages: readonly ChatMessage[]; options: ChatOptions | undefined }[];
  complete(messages: readonly ChatMessage[], options?: ChatOptions): Promise<CoachingResult>;
  getSnapshot(): CoachingStatus;
}

/** Answers every call with `reply()` and records what it was asked. */
export function scriptedCoaching(
  reply: (call: number) => CoachingResult | Promise<CoachingResult>,
  status: CoachingStatus = READY,
): ScriptedCoaching {
  const calls: ScriptedCoaching['calls'] = [];
  return {
    calls,
    complete: async (messages, options) => {
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
