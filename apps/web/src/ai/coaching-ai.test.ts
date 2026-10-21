// The text chat for BYOK, the separate coaching consent and the gate in front of every coaching
// call: no call without the person's yes for THIS destination, no key on the instance path.
import { describe, expect, it } from 'vitest';
import { ByokChat } from './byok-chat';
import { InMemoryByokKeyStore } from './byok-key-store';
import { CoachingConsent } from './coaching-consent';
import { createAiServices, type AiServices } from './create-ai-services';
import {
  chatReply,
  FakeFetch,
  MemoryKv,
  stubClassify,
  stubDigest,
  stubSanitizer,
  TEST_KEY,
} from './testing';
import type { ByokChatProvider, ChatOutcome } from './types';

const messages = [{ role: 'user', content: 'hello' }] as const;
const BYOK = { endpointUrl: 'https://api.example.com/v1', model: 'gpt-test' };

class FakeChatProvider implements ByokChatProvider {
  calls: { apiKey?: string | undefined }[] = [];
  constructor(private readonly outcome: ChatOutcome) {}
  async completeChat(args: { apiKey?: string }): Promise<ChatOutcome> {
    this.calls.push({ apiKey: args.apiKey });
    return this.outcome;
  }
}

describe('ByokChat', () => {
  it('a missing key is a calm failure before any request', async () => {
    const provider = new FakeChatProvider({ kind: 'text', text: 'x' });
    const chat = new ByokChat({ keyStore: new InMemoryByokKeyStore(), provider });
    expect(await chat.completeChat(messages)).toMatchObject({ kind: 'failure' });
    expect(provider.calls).toHaveLength(0);
  });

  it('hands the stored key to the transport and maps each outcome', async () => {
    const keyStore = new InMemoryByokKeyStore(TEST_KEY);
    const run = (outcome: ChatOutcome) =>
      new ByokChat({ keyStore, provider: new FakeChatProvider(outcome) }).completeChat(messages);
    expect(await run({ kind: 'text', text: 'hi' })).toEqual({ kind: 'text', text: 'hi' });
    expect(await run({ kind: 'quotaExhausted' })).toEqual({ kind: 'busy' });
    expect(await run({ kind: 'keyRejected' })).toMatchObject({ kind: 'failure' });
    expect(await run({ kind: 'failure', cause: 'network', message: 'could not connect' })).toEqual({
      kind: 'failure',
      message: 'could not connect',
    });
    const provider = new FakeChatProvider({ kind: 'text', text: 'hi' });
    await new ByokChat({ keyStore, provider }).completeChat(messages);
    expect(provider.calls[0]?.apiKey).toBe(TEST_KEY);
  });

  it('a throwing transport is a failure, and the key is never in the result or toString', async () => {
    const keyStore = new InMemoryByokKeyStore(TEST_KEY);
    const provider: ByokChatProvider = {
      completeChat: () => Promise.reject(new Error(TEST_KEY)),
    };
    const chat = new ByokChat({ keyStore, provider });
    const result = await chat.completeChat(messages);
    expect(result.kind).toBe('failure');
    expect(JSON.stringify(result)).not.toContain(TEST_KEY);
    expect(String(chat)).not.toContain(TEST_KEY);
  });
});

async function services(
  options: {
    fake?: FakeFetch;
    kv?: MemoryKv;
    byok?: boolean;
    instance?: boolean;
    /** The host the stored key was entered for. */
    keyHost?: string;
  } = {},
): Promise<{ ai: AiServices; fake: FakeFetch; kv: MemoryKv }> {
  const fake = options.fake ?? new FakeFetch();
  const kv = options.kv ?? new MemoryKv();
  fake.jsonBody = chatReply('{"note":"A calm note."}');
  if (options.instance) fake.instanceConfig = { enabled: true, model: 'm1', label: 'Acme AI' };
  const ai = await createAiServices({
    kv,
    sanitizePhoto: stubSanitizer,
    classifyFoodGroup: stubClassify,
    photoDigest: stubDigest,
    fetch: fake.fetch,
    origin: () => 'https://coach.example.org',
  });
  // The default-to-instance step runs after the first read of the offer.
  await ai.instance.refresh();
  await new Promise((r) => setTimeout(r, 0));
  if (options.byok) {
    await ai.keyStore.write(TEST_KEY);
    await ai.settings.setByokTarget({ ...BYOK, keyHost: options.keyHost ?? 'api.example.com' });
    await ai.settings.setRung({ kind: 'byok', previousRung: { previousKind: 'noOp' } });
  }
  return { ai, fake, kv };
}

describe('the live chat on the BYOK rung', () => {
  it('sends the user key to the user endpoint and returns the text', async () => {
    const { ai, fake } = await services({ byok: true });
    const result = await ai.chat.completeChat(messages, { maxTokens: 50 });
    expect(result).toEqual({ kind: 'text', text: '{"note":"A calm note."}' });
    expect(fake.last.url).toBe('https://api.example.com/v1/chat/completions');
    expect(fake.last.headers['authorization']).toBe(`Bearer ${TEST_KEY}`);
    expect(JSON.parse(fake.last.body)).toMatchObject({ model: 'gpt-test', max_tokens: 50 });
  });

  it('a key entered for another host is never released: nothing is sent', async () => {
    const { ai, fake } = await services({ byok: true, keyHost: 'other.example.net' });
    expect(await ai.chat.completeChat(messages)).toMatchObject({ kind: 'failure' });
    expect(fake.requests).toHaveLength(0);
  });

  it('is unavailable on No AI and while the endpoint or model is unset (no request)', async () => {
    const { ai, fake } = await services();
    expect(await ai.chat.completeChat(messages)).toEqual({ kind: 'unavailable' });
    await ai.settings.setRung({ kind: 'byok', previousRung: { previousKind: 'noOp' } });
    expect(await ai.chat.completeChat(messages)).toEqual({ kind: 'unavailable' });
    expect(fake.requests).toHaveLength(0);
  });

  it('a 429 is busy', async () => {
    const { ai, fake } = await services({ byok: true });
    fake.status = 429;
    expect(await ai.chat.completeChat(messages)).toEqual({ kind: 'busy' });
  });
});

describe('the live chat on the instance rung', () => {
  it('goes to the same-origin proxy and sends no Authorization header', async () => {
    const { ai, fake } = await services({ instance: true });
    expect(ai.settings.getSnapshot().rung.kind).toBe('instance');
    // Even with a BYOK key on file, the instance path never carries it.
    await ai.keyStore.write(TEST_KEY);
    const result = await ai.chat.completeChat(messages);
    expect(result.kind).toBe('text');
    expect(fake.last.url).toBe('https://coach.example.org/ai/v1/chat/completions');
    expect(fake.last.headers['authorization']).toBeUndefined();
    expect(fake.last.body).not.toContain(TEST_KEY);
  });
});

describe('CoachingAi: the coaching consent gate', () => {
  it('defaults to off: no call is made without the person’s yes', async () => {
    const { ai, fake } = await services({ byok: true });
    expect(ai.coaching.getSnapshot()).toMatchObject({
      kind: 'needsConsent',
      destination: { kind: 'byok', host: 'api.example.com', label: null },
    });
    expect(await ai.coaching.complete(messages)).toEqual({ kind: 'consentRequired' });
    expect(fake.requests).toHaveLength(0);
  });

  it('the photo consent is a different thing: a photo yes does not unlock coaching', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.settings.grantPhotoConsent('api.example.com');
    expect(await ai.coaching.complete(messages)).toEqual({ kind: 'consentRequired' });
    expect(fake.requests).toHaveLength(0);
  });

  it('after a yes it sends; after a revoke it stops at once', async () => {
    const { ai, fake } = await services({ byok: true });
    expect(await ai.coaching.grant()).toBe(true);
    expect(ai.coaching.getSnapshot().kind).toBe('ready');
    expect((await ai.coaching.complete(messages)).kind).toBe('text');
    expect(fake.requests).toHaveLength(1);
    await ai.coaching.revoke();
    expect(await ai.coaching.complete(messages)).toEqual({ kind: 'consentRequired' });
    expect(fake.requests).toHaveLength(1);
  });

  it('the yes is for one destination: it lapses when the endpoint changes', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.coaching.grant();
    await ai.settings.setByokTarget({ endpointUrl: 'https://api.elsewhere.test/v1', model: 'm' });
    expect(ai.coaching.getSnapshot().kind).toBe('needsConsent');
    expect(await ai.coaching.complete(messages)).toEqual({ kind: 'consentRequired' });
    expect(fake.requests).toHaveLength(0);
  });

  it('on No AI there is nothing to agree to and nothing is sent', async () => {
    const { ai, fake } = await services();
    expect(ai.coaching.getSnapshot()).toEqual({ kind: 'noAi' });
    expect(await ai.coaching.grant()).toBe(false);
    expect(await ai.coaching.complete(messages)).toEqual({ kind: 'unavailable' });
    expect(fake.requests).toHaveLength(0);
  });

  it('names this server and its provider label on the instance rung', async () => {
    const { ai } = await services({ instance: true });
    expect(ai.coaching.getSnapshot()).toMatchObject({
      kind: 'needsConsent',
      destination: { kind: 'instance', host: 'coach.example.org', label: 'Acme AI' },
    });
    await ai.coaching.grant();
    expect(ai.coaching.getSnapshot().kind).toBe('ready');
  });

  it('notifies subscribers when the status changes', async () => {
    const { ai } = await services({ byok: true });
    let calls = 0;
    const stop = ai.coaching.subscribe(() => {
      calls += 1;
    });
    await ai.coaching.grant();
    expect(calls).toBe(1);
    await ai.coaching.revoke();
    expect(calls).toBe(2);
    stop();
  });

  it('is kept in its own row, readable after a reload, and is not the photo setting', async () => {
    const { ai, kv } = await services({ byok: true });
    await ai.coaching.grant();
    expect(kv.map.get('ai.coachingConsent')).toBe('{"host":"api.example.com"}');
    expect(kv.map.get('ai.settings')).not.toContain('coach');
    const again = new CoachingConsent(kv);
    await again.load();
    expect(again.grantedFor('API.example.com')).toBe(true);
    expect(again.grantedFor('other.test')).toBe(false);
  });

  it('a garbled stored row reads as no agreement', async () => {
    const kv = new MemoryKv();
    kv.map.set('ai.coachingConsent', 'not json');
    const consent = new CoachingConsent(kv);
    await consent.load();
    expect(consent.getSnapshot()).toBeNull();
  });

  it('a failed write leaves the agreement off and throws', async () => {
    const { ai, kv } = await services({ byok: true });
    kv.failWrites = true;
    await expect(ai.coaching.grant()).rejects.toThrow();
    expect(ai.coaching.getSnapshot().kind).toBe('needsConsent');
  });
});
