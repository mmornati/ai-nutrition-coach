// "Describe a meal" through the person's AI: its own consent (neither the photo nor the coaching
// consent), per destination and off by default; the same chat transport as the coach; the same
// recognised-foods list as a photo; and voice to text that is hidden for a destination that has none.
import { describe, expect, it } from 'vitest';
import { createAiServices, type AiServices } from './create-ai-services';
import { DESCRIBE_PROMPTS } from './describe-meal';
import {
  chatReply,
  FakeFetch,
  MemoryKv,
  stubClassify,
  stubDigest,
  stubSanitizer,
  TEST_KEY,
} from './testing';

const BYOK = { endpointUrl: 'https://api.example.com/v1', model: 'gpt-test' };
const EGGS = JSON.stringify([
  {
    name: 'Egg',
    quantityHint: '2 eggs',
    grams: 100,
    per100g: { energyKcal: 143, protein: 12.6 },
    group: 'protein',
    confidence: 0.9,
  },
  { name: 'Toast', quantityHint: '1 slice', grams: 30, group: 'starch', confidence: 0.8 },
]);

function audio(size = 2048, type = 'audio/webm;codecs=opus'): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

async function services(
  options: {
    byok?: boolean;
    instance?: boolean | { transcription?: boolean; transcriptionModel?: string };
    keyHost?: string;
  } = {},
): Promise<{ ai: AiServices; fake: FakeFetch }> {
  const fake = new FakeFetch();
  fake.jsonBody = chatReply(EGGS);
  if (options.instance) {
    const extra = typeof options.instance === 'object' ? options.instance : {};
    fake.instanceConfig = { enabled: true, model: 'm1', label: 'Acme AI', ...extra };
  }
  const ai = await createAiServices({
    kv: new MemoryKv(),
    sanitizePhoto: stubSanitizer,
    classifyFoodGroup: stubClassify,
    photoDigest: stubDigest,
    fetch: fake.fetch,
    origin: () => 'https://coach.example.org',
  });
  await ai.instance.refresh();
  await new Promise((r) => setTimeout(r, 0));
  if (options.byok) {
    await ai.keyStore.write(TEST_KEY);
    await ai.settings.setByokTarget({ ...BYOK, keyHost: options.keyHost ?? 'api.example.com' });
    await ai.settings.setRung({ kind: 'byok', previousRung: { previousKind: 'noOp' } });
  }
  return { ai, fake };
}

const LOCALE = { locale: 'en' } as const;

describe('Describe: the consent gate', () => {
  it('defaults to off: nothing is sent without the person’s yes for this destination', async () => {
    const { ai, fake } = await services({ byok: true });
    expect(ai.describe.getSnapshot().status).toMatchObject({
      kind: 'needsConsent',
      destination: { kind: 'byok', host: 'api.example.com', label: null },
    });
    expect(await ai.describe.describe('two eggs', LOCALE)).toEqual({ kind: 'consentRequired' });
    expect(fake.requests).toHaveLength(0);
  });

  it('is its own consent: neither the photo yes nor the coaching yes unlocks it', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.settings.grantPhotoConsent('api.example.com');
    await ai.coaching.grant();
    expect(ai.coaching.getSnapshot().kind).toBe('ready');
    expect(await ai.describe.describe('two eggs', LOCALE)).toEqual({ kind: 'consentRequired' });
    expect(fake.requests).toHaveLength(0);
    // And the other way round: a describe yes does not turn coaching on.
    await ai.coaching.revoke();
    await ai.describe.grant();
    expect(ai.describe.getSnapshot().status.kind).toBe('ready');
    expect(ai.coaching.getSnapshot().kind).toBe('needsConsent');
  });

  it('after a yes it sends exactly the fixed instruction and the text; a revoke stops it at once', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.describe.grant();
    const out = await ai.describe.describe('  two eggs,\n toast  ', LOCALE);
    expect(out.kind).toBe('recognized');
    expect(fake.requests).toHaveLength(1);
    expect(fake.last.url).toBe('https://api.example.com/v1/chat/completions');
    expect(fake.last.headers['authorization']).toBe(`Bearer ${TEST_KEY}`);
    const body = JSON.parse(fake.last.body) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'temperature']);
    expect(body['messages']).toEqual([
      { role: 'system', content: DESCRIBE_PROMPTS.en },
      { role: 'user', content: 'two eggs, toast' },
    ]);
    await ai.describe.revoke();
    expect(await ai.describe.describe('two eggs', LOCALE)).toEqual({ kind: 'consentRequired' });
    expect(fake.requests).toHaveLength(1);
  });

  it('the yes is for one destination: it lapses when the endpoint changes, and asks again', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.describe.grant();
    await ai.settings.setByokTarget({ endpointUrl: 'https://api.elsewhere.test/v1', model: 'm' });
    expect(ai.describe.getSnapshot().status.kind).toBe('needsConsent');
    expect(await ai.describe.describe('two eggs', LOCALE)).toEqual({ kind: 'consentRequired' });
    // Going back to the first destination does not bring the old yes back.
    await ai.settings.setByokTarget({ endpointUrl: BYOK.endpointUrl, model: BYOK.model });
    expect(ai.describe.getSnapshot().status.kind).toBe('needsConsent');
    expect(fake.requests).toHaveLength(0);
  });

  it('on No AI there is nothing to agree to and nothing is sent', async () => {
    const { ai, fake } = await services();
    expect(ai.describe.getSnapshot()).toEqual({ status: { kind: 'noAi' }, voice: false });
    expect(await ai.describe.grant()).toBe(false);
    expect(await ai.describe.describe('two eggs', LOCALE)).toEqual({ kind: 'unavailable' });
    expect(fake.requests).toHaveLength(0);
  });

  it('on the instance rung it names this server, the label and the model, sends no key, and asks again if the operator changes the provider', async () => {
    const { ai, fake } = await services({ instance: true });
    expect(ai.describe.getSnapshot().status).toMatchObject({
      kind: 'needsConsent',
      destination: {
        kind: 'instance',
        host: 'coach.example.org',
        label: 'Acme AI',
        consentKey: 'instance:coach.example.org|Acme AI|m1',
      },
    });
    await ai.describe.grant();
    await ai.keyStore.write(TEST_KEY);
    expect((await ai.describe.describe('two eggs', LOCALE)).kind).toBe('recognized');
    expect(fake.last.url).toBe('https://coach.example.org/ai/v1/chat/completions');
    expect(fake.last.headers['authorization']).toBeUndefined();
    expect(fake.last.body).not.toContain(TEST_KEY);
    fake.instanceConfig = { enabled: true, model: 'm1', label: 'Other AI' };
    await ai.instance.refresh();
    expect(ai.describe.getSnapshot().status.kind).toBe('needsConsent');
  });
});

describe('Describe: reading the answer', () => {
  it('turns the reply into the same recognised foods a photo gives (flagged as estimates)', async () => {
    const { ai } = await services({ byok: true });
    await ai.describe.grant();
    const out = await ai.describe.describe('two eggs, toast', LOCALE);
    if (out.kind !== 'recognized' || out.result.kind !== 'recognizedPlate') {
      throw new Error('not recognised');
    }
    const [egg, toast] = out.result.foods;
    expect(egg?.databaseFood.displayName).toBe('Egg');
    expect(egg?.databaseFood.sourceRef).toBe('described-Egg');
    expect(egg?.databaseFood.nutrientsPer100g).toMatchObject({ energyKcal: 143 });
    expect(egg?.databaseFood.extra?.nutrientsEstimated).toBe(true);
    expect(egg?.quantity).toMatchObject({
      grams: 100,
      gramsEstimated: true,
      displayLabel: '2 eggs',
    });
    expect(toast?.databaseFood.foodGroup).toBe('starch');
  });

  it('an unreadable or empty reply is "no match", never a guess', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.describe.grant();
    fake.jsonBody = chatReply('I cannot help with that.');
    expect(await ai.describe.describe('two eggs', LOCALE)).toEqual({ kind: 'noMatch' });
    fake.jsonBody = chatReply('[]');
    expect(await ai.describe.describe('two eggs', LOCALE)).toEqual({ kind: 'noMatch' });
  });

  it('nothing to send is "empty" (no request); a 429 is busy; a 5xx is a calm failure', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.describe.grant();
    expect(await ai.describe.describe('  \n ', LOCALE)).toEqual({ kind: 'empty' });
    expect(fake.requests).toHaveLength(0);
    fake.status = 429;
    expect(await ai.describe.describe('two eggs', LOCALE)).toEqual({ kind: 'busy' });
    fake.status = 503;
    expect(await ai.describe.describe('two eggs', LOCALE)).toEqual({ kind: 'failure' });
  });

  it('asks for French when the app is French', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.describe.grant();
    await ai.describe.describe('deux œufs et du pain', { locale: 'fr' });
    const messages = (JSON.parse(fake.last.body) as { messages: { content: string }[] }).messages;
    expect(messages[0]?.content).toBe(DESCRIBE_PROMPTS.fr);
    expect(messages[1]?.content).toBe('deux œufs et du pain');
  });
});

describe('Describe: voice to text', () => {
  it('is offered on a key destination, sends model, language and the file to its endpoint with the key, and needs the yes first', async () => {
    const { ai, fake } = await services({ byok: true });
    expect(ai.describe.getSnapshot().voice).toBe(true);
    expect(await ai.describe.transcribe(audio(), LOCALE)).toEqual({ kind: 'consentRequired' });
    expect(fake.requests).toHaveLength(0);

    await ai.describe.grant();
    fake.jsonBody = { text: '  two eggs\nand toast ' };
    expect(await ai.describe.transcribe(audio(), LOCALE)).toEqual({
      kind: 'text',
      text: 'two eggs and toast',
    });
    expect(fake.last.url).toBe('https://api.example.com/v1/audio/transcriptions');
    expect(fake.last.headers['authorization']).toBe(`Bearer ${TEST_KEY}`);
    // No JSON content type: the browser writes multipart with its boundary.
    expect(fake.last.headers['content-type']).toBeUndefined();
    const form = fake.last.init.body as FormData;
    expect([...form.keys()].sort()).toEqual(['file', 'language', 'model']);
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('language')).toBe('en');
    const file = form.get('file') as File;
    expect(file.name).toBe('voice.webm');
    expect(file.size).toBe(2048);
  });

  it('uses the voice model set in Your AI, and a Safari recording is named .m4a', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.describe.grant();
    await ai.settings.setByokTranscriptionModel('whisper-large-v3');
    fake.jsonBody = { text: 'bread' };
    await ai.describe.transcribe(audio(512, 'audio/mp4'), { locale: 'fr' });
    const form = fake.last.init.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3');
    expect(form.get('language')).toBe('fr');
    expect((form.get('file') as File).name).toBe('voice.m4a');
  });

  it('is offered on this server only when the server says it transcribes, with its model and no key', async () => {
    const off = await services({ instance: true });
    expect(off.ai.describe.getSnapshot().voice).toBe(false);
    expect(await off.ai.describe.transcribe(audio(), LOCALE)).toEqual({
      kind: 'consentRequired',
    });
    await off.ai.describe.grant();
    expect(await off.ai.describe.transcribe(audio(), LOCALE)).toEqual({ kind: 'unavailable' });
    expect(off.fake.requests).toHaveLength(0);

    const { ai, fake } = await services({
      instance: { transcription: true, transcriptionModel: 'whisper-x' },
    });
    expect(ai.describe.getSnapshot().voice).toBe(true);
    await ai.describe.grant();
    await ai.keyStore.write(TEST_KEY);
    fake.jsonBody = { text: 'two eggs' };
    expect(await ai.describe.transcribe(audio(), LOCALE)).toEqual({
      kind: 'text',
      text: 'two eggs',
    });
    expect(fake.last.url).toBe('https://coach.example.org/ai/v1/audio/transcriptions');
    expect(fake.last.headers['authorization']).toBeUndefined();
    expect((fake.last.init.body as FormData).get('model')).toBe('whisper-x');
  });

  it('a 404 hides voice for that destination until the settings change', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.describe.grant();
    fake.status = 404;
    expect(await ai.describe.transcribe(audio(), LOCALE)).toEqual({ kind: 'unsupported' });
    expect(ai.describe.getSnapshot().voice).toBe(false);
    const before = fake.requests.length;
    expect(await ai.describe.transcribe(audio(), LOCALE)).toEqual({ kind: 'unavailable' });
    expect(fake.requests).toHaveLength(before);
    // Changing the voice model is a settings change: voice gets another chance.
    await ai.settings.setByokTranscriptionModel('another-model');
    expect(ai.describe.getSnapshot().voice).toBe(true);
  });

  it('maps 429, 401, 413 and 5xx calmly, and an empty transcript', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.describe.grant();
    const run = async (status: number, body: unknown = { text: 'x' }) => {
      fake.status = status;
      fake.jsonBody = body;
      return (await ai.describe.transcribe(audio(), LOCALE)).kind;
    };
    expect(await run(429)).toBe('busy');
    expect(await run(401)).toBe('keyRejected');
    expect(await run(413)).toBe('tooLarge');
    expect(await run(502)).toBe('failure');
    expect(await run(200, { text: '   ' })).toBe('empty');
    expect(await run(200, { nope: 1 })).toBe('failure');
    expect(ai.describe.getSnapshot().voice).toBe(true);
  });

  it('never sends a recording that is empty or above the proxy’s 1 MiB', async () => {
    const { ai, fake } = await services({ byok: true });
    await ai.describe.grant();
    expect(await ai.describe.transcribe(audio(0), LOCALE)).toEqual({ kind: 'empty' });
    expect(await ai.describe.transcribe(audio(1024 * 1024 + 1), LOCALE)).toEqual({
      kind: 'tooLarge',
    });
    expect(fake.requests).toHaveLength(0);
  });

  it('a key entered for another host is never released to the voice endpoint', async () => {
    const { ai, fake } = await services({ byok: true, keyHost: 'other.example.net' });
    await ai.describe.grant();
    expect((await ai.describe.transcribe(audio(), LOCALE)).kind).toBe('keyRejected');
    expect(fake.requests).toHaveLength(0);
  });
});
