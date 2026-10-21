import { describe, expect, it } from 'vitest';
import { AiSettings } from './ai-settings';
import { AiSettingsController } from './ai-settings-controller';
import { InMemoryAiSettingsStore } from './ai-settings-store';
import { InMemoryByokKeyStore } from './byok-key-store';
import { rungChoices, rungStatusLine } from './copy';
import { createAiServices } from './create-ai-services';
import { InstanceAiSource, describeInstanceConsent, instanceConsentKey } from './instance-config';
import { OpenAiCompatibleByokProvider } from './openai-compatible-provider';
import { PhotoUploadPermit } from './photo-upload-permit';
import {
  buildAiRung,
  createLiveAiRung,
  createLiveChat,
  photoUploadHost,
  type AiRungDeps,
} from './rung-registry';
import { SELECTABLE_RUNGS, isSelectableRung, normaliseRungConfig } from './rungs';
import {
  FakeFetch,
  MemoryKv,
  TEST_KEY,
  chatReply,
  photoBytes,
  stubClassify,
  stubDigest,
  stubSanitizer,
} from './testing';
import { KV_KEYS } from '../storage/key-value-store';
import { decodeAiSettings } from './ai-settings';

const ORIGIN = 'https://plate.example.test';
const OFFER = { enabled: true, model: 'vendor/model-x', label: 'Acme AI' };
const KEY = instanceConsentKey('plate.example.test', OFFER);
const FOODS = '[{"name":"Rice","quantityHint":"1 cup","group":"starch","confidence":0.9}]';

async function world(
  options: {
    offer?: unknown;
    settings?: AiSettings;
    status?: number;
  } = {},
) {
  const fake = new FakeFetch();
  fake.instanceConfig = options.offer ?? OFFER;
  fake.jsonBody = chatReply(FOODS);
  if (options.status !== undefined) fake.status = options.status;
  const settings = new AiSettingsController({
    store: new InMemoryAiSettingsStore(),
    initial:
      options.settings ??
      new AiSettings({
        rung: { kind: 'instance' },
        askBeforeEveryPhoto: false,
        photoConsentHosts: [KEY],
      }),
  });
  const instance = new InstanceAiSource({ fetch: fake.fetch, origin: () => ORIGIN });
  await instance.refresh();
  const keyStore = new InMemoryByokKeyStore(TEST_KEY);
  const deps: AiRungDeps = {
    getSettings: settings.getSnapshot,
    keyStore,
    permit: new PhotoUploadPermit(stubDigest),
    createProvider: () => {
      throw new Error('the instance rung never builds a BYOK transport');
    },
    instance: instance.getSnapshot,
    createInstanceProvider: (a) =>
      new OpenAiCompatibleByokProvider({
        ...a,
        sendKey: false,
        sanitizePhoto: stubSanitizer,
        classifyFoodGroup: stubClassify,
        fetch: fake.fetch,
      }),
    refreshInstance: () => instance.refresh(),
  };
  return { fake, settings, instance, deps };
}

describe('the instance rung in the ladder', () => {
  it('is selectable in the build, normalised like any other kind, and listed only while offered', () => {
    expect([...SELECTABLE_RUNGS]).toEqual(['noOp', 'byok', 'instance']);
    expect(isSelectableRung('instance')).toBe(true);
    expect(normaliseRungConfig({ kind: 'instance' })).toEqual({ kind: 'instance' });
    // Only BYOK carries a previous rung; a previous "instance" survives so removing a key returns to it.
    expect(
      normaliseRungConfig({ kind: 'byok', previousRung: { previousKind: 'instance' } }),
    ).toEqual({ kind: 'byok', previousRung: { previousKind: 'instance' } });
    expect(
      normaliseRungConfig({ kind: 'instance', previousRung: { previousKind: 'noOp' } }),
    ).toEqual({
      kind: 'instance',
    });

    expect(rungChoices().map((c) => c.kind)).toEqual(['noOp', 'byok', 'hostedQuota', 'local']);
    const offered = rungChoices(OFFER);
    expect(offered.map((c) => c.kind)).toEqual([
      'noOp',
      'instance',
      'byok',
      'hostedQuota',
      'local',
    ]);
    const choice = offered[1];
    expect(choice?.label).toBe('Provided by this server');
    expect(choice?.selectable).toBe(true);
    expect(choice?.help).toContain('Acme AI');
    expect(rungChoices({ enabled: false }).map((c) => c.kind)).not.toContain('instance');
  });

  it('round-trips through the persisted settings', () => {
    const decoded = decodeAiSettings(
      JSON.stringify({ v: 1, kind: 'instance', previous: null, consents: ['plate.example.test'] }),
    );
    expect(decoded.rung).toEqual({ kind: 'instance' });
    expect(decoded.hasConsentFor('plate.example.test')).toBe(true);
  });

  it('the status line says what is on, and honestly when the server stopped offering it', () => {
    const s = new AiSettings({ rung: { kind: 'instance' } });
    expect(rungStatusLine(s, false, OFFER)).toBe('this server — Acme AI');
    expect(rungStatusLine(s, false, { enabled: false })).toBe('this server — not offered');
    expect(rungStatusLine(s, false)).toBe('this server — not offered');
  });

  it('names THIS server as the upload host, and nothing while it offers no AI', async () => {
    const w = await world();
    // The consent key is this host AND the provider label AND the model.
    expect(KEY).toBe('instance:plate.example.test|Acme AI|vendor/model-x');
    expect(photoUploadHost(w.settings.getSnapshot(), w.instance.getSnapshot())).toBe(KEY);
    expect(describeInstanceConsent(KEY)).toBe('plate.example.test — Acme AI');
    expect(describeInstanceConsent('api.example.com')).toBeNull();
    expect(photoUploadHost(w.settings.getSnapshot())).toBeNull();
    const off = await world({ offer: { enabled: false } });
    expect(photoUploadHost(off.settings.getSnapshot(), off.instance.getSnapshot())).toBeNull();
    // Other rungs are unchanged by the new argument.
    const none = new AiSettings();
    expect(photoUploadHost(none, w.instance.getSnapshot())).toBeNull();
  });
});

describe('recognising a photo through the same-origin proxy', () => {
  it('POSTs to /ai/v1/chat/completions with NO Authorization header and the model of the offer', async () => {
    const w = await world();
    const rung = buildAiRung(w.settings.getSnapshot(), w.deps);
    const result = await rung.recognize(photoBytes(1, 2, 3));
    expect(result.kind).toBe('recognizedPlate');

    expect(w.fake.requests).toHaveLength(1);
    const request = w.fake.last;
    expect(request.url).toBe(`${ORIGIN}/ai/v1/chat/completions`);
    expect(request.init.method).toBe('POST');
    // Exactly one header: the key lives on the server.
    expect(request.headers).toEqual({ 'content-type': 'application/json' });
    expect(request.init.credentials).toBe('omit');
    const body = JSON.parse(request.body) as { model: string; messages: { content: unknown[] }[] };
    expect(body.model).toBe('vendor/model-x');
    expect(body.messages).toHaveLength(1);
    // Nothing of the BYOK key store is read or sent.
    expect(request.body).not.toContain(TEST_KEY);
    expect(request.url).not.toContain(TEST_KEY);
  });

  it('asks consent first like every other rung: no permit, no request', async () => {
    const w = await world({
      settings: new AiSettings({ rung: { kind: 'instance' } }), // ask before every photo (default)
    });
    const rung = buildAiRung(w.settings.getSnapshot(), w.deps);
    expect(await rung.recognize(photoBytes(1))).toMatchObject({
      kind: 'recognitionFailure',
      cause: 'consentRequired',
    });
    expect(w.fake.requests).toHaveLength(0);

    await w.deps.permit.grant({ host: KEY, bytes: photoBytes(1) });
    expect((await rung.recognize(photoBytes(1))).kind).toBe('recognizedPlate');
    expect(w.fake.requests).toHaveLength(1);
    // A permit for another host is not enough.
    await w.deps.permit.grant({ host: 'other.example.test', bytes: photoBytes(2) });
    expect(await rung.recognize(photoBytes(2))).toMatchObject({ cause: 'consentRequired' });
  });

  it('changing the provider label or the model asks again (the agreement was for the old combination)', async () => {
    const w = await world();
    const rung = createLiveAiRung(w.deps);
    expect((await rung.recognize(photoBytes(1))).kind).toBe('recognizedPlate');
    for (const changed of [
      { ...OFFER, label: 'Other AI' },
      { ...OFFER, model: 'vendor/model-y' },
    ]) {
      w.fake.instanceConfig = changed;
      await w.instance.refresh();
      expect(await rung.recognize(photoBytes(2))).toMatchObject({ cause: 'consentRequired' });
    }
    w.fake.instanceConfig = OFFER;
    await w.instance.refresh();
    expect((await rung.recognize(photoBytes(3))).kind).toBe('recognizedPlate');
  });

  it('429 is "busy, try again in a moment" with no countdown, even when the proxy sends Retry-After', async () => {
    const w = await world({ status: 429 });
    w.fake.headers = { 'retry-after': '120' };
    const result = await buildAiRung(w.settings.getSnapshot(), w.deps).recognize(photoBytes(1));
    expect(result).toEqual({
      kind: 'recognitionFailure',
      cause: 'httpError',
      message: 'The AI on this server is busy. Try again in a moment.',
    });
    expect(JSON.stringify(result)).not.toMatch(/resetAt|120|second|minute/);
  });

  it('404 means the operator switched the AI off; 5xx and a refused key are the server’s side', async () => {
    const cases: [number, string][] = [
      [404, 'This server does not offer AI right now.'],
      [500, 'The AI on this server did not answer.'],
      [502, 'The AI on this server did not answer.'],
      [503, 'The AI on this server did not answer.'],
      [401, 'The AI on this server did not answer.'],
      [403, 'The AI on this server did not answer.'],
    ];
    for (const [status, message] of cases) {
      const w = await world({ status });
      const result = await buildAiRung(w.settings.getSnapshot(), w.deps).recognize(photoBytes(1));
      expect(result, String(status)).toMatchObject({ kind: 'recognitionFailure' });
      expect(JSON.stringify(result), String(status)).toContain(message);
      // Never says the person's own key was rejected: they have none.
      expect(JSON.stringify(result)).not.toMatch(/your own key|keyRejected/);
    }
  });

  it('a timeout or a dropped connection is a calm failure naming this server', async () => {
    const w = await world();
    w.fake.error = new TypeError('Failed to fetch');
    const result = await buildAiRung(w.settings.getSnapshot(), w.deps).recognize(photoBytes(1));
    expect(result).toMatchObject({ kind: 'recognitionFailure', cause: 'network' });
  });

  it('while this server offers no AI the rung says so, sends nothing and never throws', async () => {
    const w = await world({ offer: { enabled: false } });
    const result = await buildAiRung(w.settings.getSnapshot(), w.deps).recognize(photoBytes(1));
    expect(result).toMatchObject({ kind: 'recognitionFailure', cause: 'notConfigured' });
    expect(JSON.stringify(result)).toContain('does not offer AI');
    expect(w.fake.requests).toHaveLength(0);
  });

  it('the live rung reads the offer again when the session started without it', async () => {
    const w = await world({ offer: { enabled: false } });
    const rung = createLiveAiRung(w.deps);
    expect(await rung.recognize(photoBytes(1))).toMatchObject({ cause: 'notConfigured' });
    expect(w.fake.configRequests).toHaveLength(2); // the first read, then one on demand
    w.fake.instanceConfig = OFFER;
    expect((await rung.recognize(photoBytes(1))).kind).toBe('recognizedPlate');
    expect(w.fake.requests).toHaveLength(1);
    // Once offered it is not read again per photo.
    await rung.recognize(photoBytes(1));
    expect(w.fake.configRequests).toHaveLength(3);
  });
});

describe('completeChat: the text seam a later coach reuses', () => {
  const messages = [
    { role: 'system', content: 'Be kind.' },
    { role: 'user', content: 'Hello' },
  ] as const;

  it('sends a plain chat completion through the same proxy, with no key and nothing added', async () => {
    const w = await world();
    w.fake.jsonBody = chatReply('Bonjour');
    const chat = createLiveChat(w.deps);
    expect(await chat.completeChat(messages, { maxTokens: 300, temperature: 0.7 })).toEqual({
      kind: 'text',
      text: 'Bonjour',
    });
    const request = w.fake.last;
    expect(request.url).toBe(`${ORIGIN}/ai/v1/chat/completions`);
    expect(request.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(request.body)).toEqual({
      model: 'vendor/model-x',
      messages: [
        { role: 'system', content: 'Be kind.' },
        { role: 'user', content: 'Hello' },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });
  });

  it('is calm about 429, 404, 5xx and an empty reply; unavailable off the instance rung', async () => {
    const busy = await world({ status: 429 });
    expect(await createLiveChat(busy.deps).completeChat(messages)).toEqual({ kind: 'busy' });
    const gone = await world({ status: 404 });
    expect(await createLiveChat(gone.deps).completeChat(messages)).toEqual({ kind: 'unavailable' });
    const down = await world({ status: 502 });
    expect(await createLiveChat(down.deps).completeChat(messages)).toMatchObject({
      kind: 'failure',
      message: 'The AI on this server did not answer. Try again in a moment.',
    });
    const empty = await world();
    empty.fake.jsonBody = { choices: [] };
    expect(await createLiveChat(empty.deps).completeChat(messages)).toMatchObject({
      kind: 'failure',
    });

    const none = await world({ settings: new AiSettings() });
    expect(await createLiveChat(none.deps).completeChat(messages)).toEqual({ kind: 'unavailable' });
    expect(none.fake.requests).toHaveLength(0);
    const own = await world({
      settings: new AiSettings({ rung: { kind: 'byok', previousRung: { previousKind: 'noOp' } } }),
    });
    expect(await createLiveChat(own.deps).completeChat(messages)).toEqual({ kind: 'unavailable' });
    expect(own.fake.requests).toHaveLength(0);
  });

  it('a caller can cancel one call', async () => {
    const w = await world();
    w.fake.hang = true;
    const stop = new AbortController();
    const pending = createLiveChat(w.deps).completeChat(messages, { signal: stop.signal });
    await new Promise((r) => setTimeout(r, 0));
    stop.abort();
    expect(await pending).toMatchObject({ kind: 'failure' });
  });
});

describe('createAiServices: the default for a new install', () => {
  const build = async (kv: MemoryKv, offer: unknown) => {
    const fake = new FakeFetch();
    fake.instanceConfig = offer;
    const services = await createAiServices({
      kv,
      sanitizePhoto: stubSanitizer,
      classifyFoodGroup: stubClassify,
      photoDigest: stubDigest,
      fetch: fake.fetch,
      origin: () => ORIGIN,
    });
    await services.instance.refresh();
    // The default lands after the read; give the continuation a turn.
    await new Promise((r) => setTimeout(r, 0));
    return { services, fake };
  };

  it('a NEW install defaults to the server’s AI while it offers it', async () => {
    const kv = new MemoryKv();
    const { services } = await build(kv, OFFER);
    expect(services.settings.getSnapshot().rung).toEqual({ kind: 'instance' });
    expect(decodeAiSettings(kv.map.get(KV_KEYS.aiSettings)).rung).toEqual({ kind: 'instance' });
    // Consent is still asked for every photo.
    expect(services.settings.getSnapshot().askBeforeEveryPhoto).toBe(true);
  });

  it('a new install stays on No AI when the server offers nothing (and writes nothing)', async () => {
    const kv = new MemoryKv();
    const { services } = await build(kv, { enabled: false });
    expect(services.settings.getSnapshot().rung.kind).toBe('noOp');
    expect(kv.writes).toBe(0);
  });

  it('an existing choice is never overridden, not even No AI', async () => {
    for (const stored of [
      JSON.stringify({ v: 1, kind: 'noOp', previous: null }),
      JSON.stringify({
        v: 1,
        kind: 'byok',
        previous: 'noOp',
        endpoint: 'https://a.test/v1',
        model: 'm',
      }),
    ]) {
      const kv = new MemoryKv();
      kv.map.set(KV_KEYS.aiSettings, stored);
      const writes = kv.writes;
      const { services } = await build(kv, OFFER);
      expect(services.settings.getSnapshot().rung.kind).not.toBe('instance');
      expect(kv.writes).toBe(writes);
    }
  });

  it('an unreadable store counts as "a choice exists": no default is written over it', async () => {
    const kv = new MemoryKv();
    kv.failReads = true;
    const { services } = await build(kv, OFFER);
    expect(services.settings.getSnapshot().rung.kind).toBe('noOp');
    expect(kv.writes).toBe(0);
  });

  it('YourAi.selectInstance reads the offer again and refuses when it is gone', async () => {
    const kv = new MemoryKv();
    kv.map.set(KV_KEYS.aiSettings, JSON.stringify({ v: 1, kind: 'noOp', previous: null }));
    const { services, fake } = await build(kv, OFFER);
    expect(await services.yourAi.selectInstance()).toBe(true);
    expect(services.settings.getSnapshot().rung).toEqual({ kind: 'instance' });
    await services.yourAi.selectNoAi();
    fake.instanceConfig = { enabled: false };
    expect(await services.yourAi.selectInstance()).toBe(false);
    expect(services.settings.getSnapshot().rung.kind).toBe('noOp');
  });

  it('keeps the BYOK key, endpoint and model while on the instance rung, and removing a key returns to it', async () => {
    const kv = new MemoryKv();
    kv.map.set(KV_KEYS.aiSettings, JSON.stringify({ v: 1, kind: 'noOp', previous: null }));
    const { services } = await build(kv, OFFER);
    await services.yourAi.selectInstance();
    await services.yourAi.saveByok({
      endpointUrl: 'https://api.example.com/v1',
      model: 'm',
      newKey: TEST_KEY,
    });
    expect(services.settings.getSnapshot().rung).toEqual({
      kind: 'byok',
      previousRung: { previousKind: 'instance' },
    });
    await services.yourAi.removeByok();
    expect(services.settings.getSnapshot().rung).toEqual({ kind: 'instance' });
  });
});
