import { describe, expect, it } from 'vitest';
import {
  OpenAiCompatibleByokProvider,
  RECOGNITION_PROMPT,
  type ByokConnectionResult,
} from './openai-compatible-provider';
import type { ByokOutcome } from './types';
import {
  FakeFetch,
  TEST_KEY,
  chatReply,
  endlessStream,
  photoBytes,
  stubClassify,
  stubSanitizer,
} from './testing';

const provider = (
  fake: FakeFetch,
  o: {
    endpoint?: string;
    model?: string;
    receiveTimeoutMs?: number;
    pingReceiveTimeoutMs?: number;
  } = {},
) =>
  new OpenAiCompatibleByokProvider({
    endpointUrl: o.endpoint ?? 'https://api.example.com/v1',
    model: o.model ?? 'vision-1',
    sanitizePhoto: stubSanitizer,
    classifyFoodGroup: stubClassify,
    fetch: fake.fetch,
    ...(o.receiveTimeoutMs === undefined ? {} : { receiveTimeoutMs: o.receiveTimeoutMs }),
    ...(o.pingReceiveTimeoutMs === undefined
      ? {}
      : { pingReceiveTimeoutMs: o.pingReceiveTimeoutMs }),
  });

const recognize = (p: OpenAiCompatibleByokProvider, bytes = photoBytes(1, 2, 3)) =>
  p.recognize({ photoBytes: bytes, apiKey: TEST_KEY });

const recognizedFoods = (out: ByokOutcome) => {
  if (out.kind !== 'recognized') throw new Error(`expected recognized, got ${out.kind}`);
  return out.foods;
};

const ALLOWED_HEADERS = ['authorization', 'content-type'];

describe('what leaves the device (privacy audit, automated check 1)', () => {
  const sentBody = (f: FakeFetch) => JSON.parse(f.last.body) as Record<string, unknown>;

  // Pins the EXACT shape of the request: a new field (a date, an id, the locale, a user name...)
  // fails this test and has to be argued in the diff and in docs/ai-tiers.md.
  it('the photo request has exactly these keys, parts and headers', async () => {
    const f = new FakeFetch();
    f.jsonBody = chatReply('[]');
    await recognize(provider(f));
    const body = sentBody(f);

    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'temperature']);
    expect(body.model).toBe('vision-1');
    expect(body.max_tokens).toBe(800);
    expect(body.temperature).toBe(0.2);

    const messages = body.messages as Record<string, unknown>[];
    expect(messages).toHaveLength(1);
    const message = messages[0] as Record<string, unknown>;
    expect(Object.keys(message).sort()).toEqual(['content', 'role']);
    expect(message.role).toBe('user');

    const parts = message.content as Record<string, unknown>[];
    expect(parts).toHaveLength(2);
    expect(Object.keys(parts[0] as object).sort()).toEqual(['text', 'type']);
    expect(parts[0]).toEqual({ type: 'text', text: RECOGNITION_PROMPT });
    expect(Object.keys(parts[1] as object).sort()).toEqual(['image_url', 'type']);
    expect(parts[1]?.type).toBe('image_url');
    const image = parts[1]?.image_url as Record<string, unknown>;
    expect(Object.keys(image)).toEqual(['url']);
    expect(image.url).toMatch(/^data:image\/jpeg;base64,/);

    expect(Object.keys(f.last.headers).sort()).toEqual(ALLOWED_HEADERS);
    expect(f.last.headers.authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(f.last.headers['content-type']).toBe('application/json');
    expect(new URL(f.last.url).search).toBe('');
  });

  it('no cookies, no referrer, no cache, no redirect following', async () => {
    const f = new FakeFetch();
    f.jsonBody = chatReply('[]');
    await recognize(provider(f));
    expect(f.last.init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      redirect: 'manual',
    });
  });

  it('nothing but the fixed prompt, the model and the photo is in the body', async () => {
    const f = new FakeFetch();
    f.jsonBody = chatReply('[]');
    await recognize(provider(f));
    const body = sentBody(f);
    const parts = ((body.messages as { content: unknown[] }[])[0] as { content: unknown[] })
      .content;
    // Everything except the base64 photo.
    const scannable = JSON.stringify({
      ...body,
      messages: [{ role: 'user', content: [parts[0]] }],
    });
    expect(scannable).not.toMatch(/\d{4}-\d{2}-\d{2}/); // no ISO date
    expect(scannable).not.toMatch(/\b[a-z]{2}[-_][A-Z]{2}\b/); // no locale
    for (const needle of ['locale', 'user_id', 'device', 'Plate']) {
      expect(scannable.split(needle).length - 1, needle).toBe(0);
    }
    expect(RECOGNITION_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('the connection test sends only a one-token ping', async () => {
    const f = new FakeFetch();
    f.jsonBody = chatReply('pong');
    await provider(f).testConnection({ apiKey: TEST_KEY });
    const body = sentBody(f);
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'temperature']);
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }]);
    expect(body.max_tokens).toBe(1);
    expect(Object.keys(f.last.headers).sort()).toEqual(ALLOWED_HEADERS);
  });
});

describe('recognize', () => {
  it('posts to <base>/chat/completions with the key ONLY in the Authorization header', async () => {
    const f = new FakeFetch();
    f.jsonBody = chatReply('[{"name":"Apple","quantityHint":"1 piece"}]');
    const out = await recognize(provider(f, { endpoint: 'https://api.example.com/v1/' }));
    expect(out.kind).toBe('recognized');
    expect(f.last.url).toBe('https://api.example.com/v1/chat/completions');
    expect(f.last.headers.authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(f.last.url).not.toContain('sk-');
    expect(f.last.body).not.toContain('sk-or');
  });

  it('sends the sanitiser output: its bytes and its REAL mime type', async () => {
    const f = new FakeFetch();
    f.jsonBody = chatReply('[]');
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 9, 9]);
    await recognize(provider(f), png);
    expect(f.last.body).toContain('data:image/png;base64,');
    const url = (JSON.parse(f.last.body).messages[0].content[1].image_url as { url: string }).url;
    expect(Uint8Array.from(atob(url.split(',')[1] as string), (c) => c.charCodeAt(0))).toEqual(png);
  });

  it('bytes the sanitiser refuses are NOT sent: no request at all', async () => {
    const f = new FakeFetch();
    const out = await recognize(provider(f), Uint8Array.from([1, 2, 3]));
    expect(out).toMatchObject({ kind: 'failure', cause: 'photoNotSendable' });
    expect(f.requests).toHaveLength(0);
  });

  it('a throwing sanitiser is also "not sendable", never a crash', async () => {
    const f = new FakeFetch();
    const p = new OpenAiCompatibleByokProvider({
      endpointUrl: 'https://api.example.com/v1',
      model: 'm',
      sanitizePhoto: () => {
        throw new Error('boom');
      },
      classifyFoodGroup: stubClassify,
      fetch: f.fetch,
    });
    expect(await recognize(p)).toMatchObject({ kind: 'failure', cause: 'photoNotSendable' });
    expect(f.requests).toHaveLength(0);
  });

  it('an invalid endpoint makes no request', async () => {
    for (const bad of ['http://example.com/v1', 'ftp://x', 'not a url', 'https://u:p@x.com']) {
      const f = new FakeFetch();
      const out = await recognize(provider(f, { endpoint: bad }));
      expect(out, bad).toMatchObject({ kind: 'failure', cause: 'notConfigured' });
      expect(f.requests, bad).toHaveLength(0);
    }
  });

  it('http://localhost is allowed (a local model)', async () => {
    const f = new FakeFetch();
    f.jsonBody = chatReply('[]');
    await recognize(provider(f, { endpoint: 'http://localhost:11434/v1' }));
    expect(f.requests).toHaveLength(1);
    expect(f.last.url).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('an unset endpoint or model makes no request', async () => {
    const f = new FakeFetch();
    expect(await recognize(provider(f, { endpoint: '' }))).toMatchObject({
      cause: 'notConfigured',
    });
    expect(await recognize(provider(f, { model: '' }))).toMatchObject({ cause: 'notConfigured' });
    expect(f.requests).toHaveLength(0);
  });

  it('401 and 403 are "key rejected"', async () => {
    for (const status of [401, 403]) {
      const f = new FakeFetch();
      f.status = status;
      f.jsonBody = { error: 'no' };
      expect((await recognize(provider(f))).kind, String(status)).toBe('keyRejected');
    }
  });

  it('429 reads retry-after (seconds) and x-ratelimit-reset (duration string)', async () => {
    const before = Date.now();
    const a = new FakeFetch();
    a.status = 429;
    a.headers = { 'retry-after': '90' };
    const out = await recognize(provider(a));
    if (out.kind !== 'quotaExhausted') throw new Error('expected quota');
    expect((out.resetAt as number) - before).toBeGreaterThanOrEqual(89_000);
    expect((out.resetAt as number) - before).toBeLessThan(95_000);

    const b = new FakeFetch();
    b.status = 429;
    b.headers = { 'x-ratelimit-reset': '6m0s' };
    const out2 = await recognize(provider(b));
    if (out2.kind !== 'quotaExhausted') throw new Error('expected quota');
    expect((out2.resetAt as number) - before).toBeGreaterThanOrEqual(359_000);
    expect((out2.resetAt as number) - before).toBeLessThan(365_000);

    const c = new FakeFetch();
    c.status = 429;
    expect(await recognize(provider(c))).toEqual({ kind: 'quotaExhausted' }); // reset unknown
  });

  it('a 5xx is a failure naming the host and status only', async () => {
    const f = new FakeFetch();
    f.status = 503;
    const out = await recognize(provider(f));
    if (out.kind !== 'failure') throw new Error('expected failure');
    expect(out.cause).toBe('httpError');
    expect(out.message).toContain('503');
    expect(out.message).toContain('api.example.com');
    expect(out.message).not.toContain('sk-');
  });

  it('3xx redirects are never followed and are a failure', async () => {
    const f = new FakeFetch();
    f.status = 302;
    f.headers = { location: 'https://evil.example.net/steal' };
    const out = await recognize(provider(f));
    expect(out).toMatchObject({ kind: 'failure', cause: 'httpError' });
    expect((out as { message: string }).message).toContain('302');
    expect(f.requests).toHaveLength(1);
    expect(f.last.init.redirect).toBe('manual');

    // A browser hides the Location of a manual redirect behind an opaque response.
    const g = new FakeFetch();
    g.opaqueRedirect = true;
    expect(await recognize(provider(g))).toMatchObject({ kind: 'failure', cause: 'httpError' });
    expect(g.requests).toHaveLength(1);
  });

  it('a network/CORS/CSP rejection is a calm failure, key-free, with the browser note', async () => {
    const f = new FakeFetch();
    f.error = new TypeError('Failed to fetch');
    const out = await recognize(provider(f));
    if (out.kind !== 'failure') throw new Error('expected failure');
    expect(out.cause).toBe('network');
    expect(out.message).toContain('could not connect to api.example.com');
    expect(out.message).toContain('CORS');
    expect(out.message).toContain('Content-Security-Policy');
    expect(out.message).not.toContain(TEST_KEY);
  });

  it('a request that gets no response headers in time is a timeout', async () => {
    const f = new FakeFetch();
    f.hang = true;
    const out = await recognize(provider(f, { receiveTimeoutMs: 20 }));
    expect(out).toMatchObject({ kind: 'failure', cause: 'timeout' });
    expect((out as { message: string }).message).toContain('timed out');
    expect((out as { message: string }).message).not.toContain(TEST_KEY);
  });

  it('a response past 2 MiB is aborted (stream cancelled), not buffered', async () => {
    const f = new FakeFetch();
    const s = endlessStream(256 * 1024);
    f.stream = s.stream;
    const out = await recognize(provider(f));
    expect(out).toMatchObject({ kind: 'failure', cause: 'responseTooLarge' });
    expect((out as { message: string }).message).toContain('too large');
    expect(s.cancelled()).toBe(true);
    expect(s.pulls()).toBeLessThan(40);
  });

  it('an over-long Content-Length is refused up front', async () => {
    const f = new FakeFetch();
    f.headers = { 'content-length': String(3 * 1024 * 1024) };
    f.jsonBody = chatReply('[]');
    expect(await recognize(provider(f))).toMatchObject({ cause: 'responseTooLarge' });
  });

  it('an empty, unparsable or non-array reply is noMatch', async () => {
    for (const body of [
      {},
      [],
      { choices: [] },
      chatReply(''),
      chatReply('[]'),
      chatReply('the plate has rice'),
      chatReply('{"name":"x"}'),
      chatReply('[1, "a", null]'),
    ]) {
      const f = new FakeFetch();
      f.jsonBody = body;
      expect((await recognize(provider(f))).kind, JSON.stringify(body)).toBe('noMatch');
    }
  });

  it('tolerates a fenced array, prose around it, and the older choices[0].text shape', async () => {
    const entry = '[{"name":"Apple","quantityHint":"1 piece","group":"vegFruit"}]';
    for (const body of [
      chatReply('```json\n' + entry + '\n```'),
      chatReply('Here you go: ' + entry + ' Enjoy!'),
      { choices: [{ text: entry }] },
    ]) {
      const f = new FakeFetch();
      f.jsonBody = body;
      expect(recognizedFoods(await recognize(provider(f)))[0]?.databaseFood.displayName).toBe(
        'Apple',
      );
    }
  });

  it('a recognised food carries a manual-source database food and an honest quantity', async () => {
    const f = new FakeFetch();
    f.jsonBody = chatReply('[{"name":"Apple","quantityHint":"~1 cup"},{"name":"Egg"}]');
    const foods = recognizedFoods(await recognize(provider(f, { model: 'm1' })));
    expect(foods[0]).toEqual({
      databaseFood: {
        sourceRef: 'byok-m1-Apple',
        displayName: 'Apple',
        source: 'manual',
        foodGroup: 'other',
      },
      confidence: 0.5,
      quantity: { low: 1, high: 1, unit: '~1 cup', displayLabel: '~1 cup' },
    });
    expect(foods[1]?.quantity).toEqual({
      low: 1,
      high: 1,
      unit: 'serving',
      displayLabel: '1 serving',
    });
  });

  it('untrusted output: at most 20 foods, names and hints at most 100 characters, controls removed', async () => {
    const foods = [
      { name: 'N'.repeat(500), quantityHint: 'h' },
      ...Array.from({ length: 40 }, (_, i) => ({
        name: `Food ${i}`,
        quantityHint: 'x'.repeat(300),
      })),
      { name: 'Bad\u0000\nName', quantityHint: 'ok' },
    ];
    const f = new FakeFetch();
    f.jsonBody = chatReply(JSON.stringify(foods));
    const out = recognizedFoods(await recognize(provider(f)));
    expect(out).toHaveLength(20);
    expect(out[0]?.databaseFood.displayName).toHaveLength(100);
    for (const food of out) {
      expect(food.databaseFood.displayName.length).toBeLessThanOrEqual(100);
      expect(food.quantity.displayLabel.length).toBeLessThanOrEqual(100);
    }
    const g = new FakeFetch();
    g.jsonBody = chatReply(JSON.stringify([{ name: 'Bad\u0000\nName', quantityHint: 'a\tb' }]));
    const control = recognizedFoods(await recognize(provider(g)));
    expect(control[0]?.databaseFood.displayName).toBe('Bad Name');
    expect(control[0]?.quantity.displayLabel).toBe('a b');
  });

  it('skips entries with no usable name and counts only kept foods toward the cap', async () => {
    const f = new FakeFetch();
    f.jsonBody = chatReply(JSON.stringify([{ name: 5 }, { name: '  ' }, 'x', { name: 'Pear' }]));
    expect(recognizedFoods(await recognize(provider(f)))).toHaveLength(1);
  });

  it('toString is redacted', () => {
    const p = provider(new FakeFetch(), {
      endpoint: 'https://private.example.com/v1',
      model: 'secret-model',
    });
    expect(String(p)).not.toContain('private');
    expect(String(p)).not.toContain('secret-model');
  });
});

describe('food group (F2): recognised BYOK foods carry a validated group', () => {
  const groups = async (modelJson: string) => {
    const f = new FakeFetch();
    f.jsonBody = chatReply(modelJson);
    return recognizedFoods(await recognize(provider(f))).map((x) => x.databaseFood.foodGroup);
  };

  it('the prompt asks for the closed group enum', () => {
    for (const g of ['vegFruit', 'protein', 'starch', 'dairy', 'other']) {
      expect(RECOGNITION_PROMPT).toContain(g);
    }
    expect(RECOGNITION_PROMPT).toContain('group');
  });

  it('a valid model group is used', async () => {
    expect(await groups('[{"name":"Salmon","quantityHint":"1 fillet","group":"protein"}]')).toEqual(
      ['protein'],
    );
  });

  it('an invalid or missing group falls back to the injected classifier', async () => {
    expect(
      await groups(
        '[{"name":"Peanut butter","quantityHint":"1 tbsp","group":"spreads"},' +
          '{"name":"Brown rice","quantityHint":"1 cup"},' +
          '{"name":"Mystery goo","quantityHint":"1 dab","group":42}]',
      ),
    ).toEqual(['protein', 'starch', 'other']);
  });

  it('the model group is trusted over the name when valid', async () => {
    expect(await groups('[{"name":"Almond milk","quantityHint":"1 cup","group":"other"}]')).toEqual(
      ['other'],
    );
  });
});

describe('testConnection', () => {
  const test = (f: FakeFetch, o: Parameters<typeof provider>[1] = {}, key = TEST_KEY) =>
    provider(f, o).testConnection({ apiKey: key });

  it('ok: a one-token chat completion with the key in the header', async () => {
    const f = new FakeFetch();
    f.jsonBody = chatReply('pong');
    expect(await test(f)).toEqual({ kind: 'ok' });
    expect(JSON.parse(f.last.body).max_tokens).toBe(1);
    expect(f.last.headers.authorization).toBe(`Bearer ${TEST_KEY}`);
  });

  it('too-large reply -> a dedicated result; 302 -> unexpected status', async () => {
    const big = new FakeFetch();
    big.stream = endlessStream(256 * 1024).stream;
    expect(await test(big)).toEqual({ kind: 'responseTooLarge' });
    const redirect = new FakeFetch();
    redirect.status = 302;
    expect(await test(redirect)).toEqual({ kind: 'unexpectedStatus', statusCode: 302 });
  });

  it('uses the 20 s ping receive timeout (injected shorter here) and maps a hang to a timeout', async () => {
    const f = new FakeFetch();
    f.hang = true;
    expect(await test(f, { pingReceiveTimeoutMs: 20 })).toEqual({
      kind: 'unreachable',
      reason: 'timeout',
    });
  });

  it('maps 401, 429, 404, network, invalid endpoint and the unconfigured cases', async () => {
    const run = (
      setup: (f: FakeFetch) => void,
      o: Parameters<typeof provider>[1] = {},
      key = TEST_KEY,
    ): Promise<ByokConnectionResult> => {
      const f = new FakeFetch();
      setup(f);
      return test(f, o, key);
    };
    expect(await run((f) => (f.status = 401))).toEqual({ kind: 'keyRejected' });
    expect(await run((f) => (f.status = 403))).toEqual({ kind: 'keyRejected' });
    const limited = await run((f) => {
      f.status = 429;
      f.headers = { 'retry-after': '5' };
    });
    expect(limited).toMatchObject({ kind: 'rateLimited' });
    expect((limited as { resetAt?: number }).resetAt).toBeDefined();
    expect(await run((f) => (f.status = 429))).toEqual({ kind: 'rateLimited' });
    expect(await run((f) => (f.status = 404))).toEqual({
      kind: 'unexpectedStatus',
      statusCode: 404,
    });
    expect(await run((f) => (f.status = 500))).toEqual({
      kind: 'unexpectedStatus',
      statusCode: 500,
    });
    expect(await run((f) => (f.error = new TypeError('Failed to fetch')))).toEqual({
      kind: 'unreachable',
      reason: 'network',
    });
    expect(await run(() => undefined, { endpoint: 'http://example.com' })).toEqual({
      kind: 'endpointInvalid',
      problem: 'notHttps',
    });
    expect(await run(() => undefined, { endpoint: '' })).toEqual({ kind: 'notConfigured' });
    expect(await run(() => undefined, { model: '  ' })).toEqual({ kind: 'notConfigured' });
    expect(await run(() => undefined, {}, '')).toEqual({ kind: 'notConfigured' });
  });

  it('never makes a request for the unconfigured cases and never echoes the key', async () => {
    const f = new FakeFetch();
    await test(f, { model: '' });
    await test(f, { endpoint: 'ftp://x' });
    expect(f.requests).toHaveLength(0);
    const g = new FakeFetch();
    g.error = new TypeError(`Failed to fetch ${TEST_KEY}`);
    expect(JSON.stringify(await test(g))).not.toContain('sk-');
  });
});
