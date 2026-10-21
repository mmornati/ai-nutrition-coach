import { describe, expect, it } from 'vitest';
import { KV_KEYS } from '../storage/key-value-store';
import { decodeAiSettings } from './ai-settings';
import {
  connectionResultMessage,
  keySavedText,
  previousRungHint,
  rungStatusLine,
  saveResultMessage,
} from './copy';
import { createAiServices, type AiServices } from './create-ai-services';
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

async function setup() {
  const kv = new MemoryKv();
  const fake = new FakeFetch();
  fake.jsonBody = chatReply('pong');
  const services: AiServices = await createAiServices({
    kv,
    sanitizePhoto: stubSanitizer,
    classifyFoodGroup: stubClassify,
    photoDigest: stubDigest,
    fetch: fake.fetch,
  });
  return { kv, fake, services, yourAi: services.yourAi, settings: services.settings };
}

const form = { endpointUrl: 'https://api.example.com/v1', model: 'vision-1' };

describe('YourAi.saveByok', () => {
  it('stores the key, binds it to the host, makes "my own key" active and remembers the previous rung', async () => {
    const t = await setup();
    expect(await t.yourAi.saveByok({ ...form, newKey: TEST_KEY })).toEqual({ kind: 'saved' });
    const s = t.settings.getSnapshot();
    expect(s.rung).toEqual({ kind: 'byok', previousRung: { previousKind: 'noOp' } });
    expect(s.byokKeyHost).toBe('api.example.com');
    expect(s.byokEndpointUrl).toBe(form.endpointUrl);
    expect(t.kv.map.get(KV_KEYS.aiByokKey)).toBe(TEST_KEY);
    // Persisted, not just published.
    expect(decodeAiSettings(t.kv.map.get(KV_KEYS.aiSettings)).equals(s)).toBe(true);
    // The key is in the encrypted key row only, never in the settings blob.
    expect(t.kv.map.get(KV_KEYS.aiSettings)).not.toContain('sk-');
    expect(await t.yourAi.keyStatus()).toEqual({ hasKey: true, keyEnding: 'abcd' });
  });

  it('validates before touching anything', async () => {
    const t = await setup();
    expect(await t.yourAi.saveByok({ ...form, endpointUrl: 'http://example.com' })).toEqual({
      kind: 'endpointInvalid',
      problem: 'notHttps',
    });
    expect(await t.yourAi.saveByok({ ...form, model: '  ' })).toEqual({ kind: 'modelMissing' });
    expect(await t.yourAi.saveByok({ ...form, newKey: 'sk-has space' })).toEqual({
      kind: 'keyInvalid',
    });
    expect(t.kv.writes).toBe(0);
  });

  it('no key anywhere: saves endpoint and model, keeps the rung, reports "key missing"', async () => {
    const t = await setup();
    expect(await t.yourAi.saveByok(form)).toEqual({ kind: 'keyMissing' });
    expect(t.settings.getSnapshot().rung.kind).toBe('noOp');
    expect(t.settings.getSnapshot().byokModel).toBe('vision-1');
  });

  it('a saved key is refused for an edited endpoint on another host until pasted again', async () => {
    const t = await setup();
    await t.yourAi.saveByok({ ...form, newKey: TEST_KEY });
    const before = t.settings.getSnapshot();
    expect(
      await t.yourAi.saveByok({ endpointUrl: 'https://evil.example.org/v1', model: 'm' }),
    ).toEqual({
      kind: 'keyForOtherHost',
      savedFor: 'api.example.com',
    });
    expect(t.settings.getSnapshot()).toBe(before); // nothing changed
    // Pasting the key for the new endpoint re-binds it.
    expect(
      await t.yourAi.saveByok({
        endpointUrl: 'https://evil.example.org/v1',
        model: 'm',
        newKey: TEST_KEY,
      }),
    ).toEqual({ kind: 'saved' });
    expect(t.settings.getSnapshot().byokKeyHost).toBe('evil.example.org');
  });

  it('same host, new model: no key needed again; the previous rung is kept', async () => {
    const t = await setup();
    await t.yourAi.selectNoAi();
    await t.yourAi.saveByok({ ...form, newKey: TEST_KEY });
    expect(await t.yourAi.saveByok({ ...form, model: 'other' })).toEqual({ kind: 'saved' });
    expect(t.settings.getSnapshot().byokModel).toBe('other');
    expect(t.settings.getSnapshot().rung).toEqual({
      kind: 'byok',
      previousRung: { previousKind: 'noOp' },
    });
  });

  it('a storage failure is reported and leaves the key unusable (binding unset), not usable anywhere', async () => {
    const t = await setup();
    t.kv.failWrites = true;
    expect(await t.yourAi.saveByok({ ...form, newKey: TEST_KEY })).toEqual({
      kind: 'storageFailed',
    });
    expect(t.settings.getSnapshot().byokKeyHost).toBe('');
    expect(t.settings.getSnapshot().rung.kind).toBe('noOp');
  });

  it('a partial failure (key saved, binding not) leaves the key unbound', async () => {
    const t = await setup();
    const write = t.kv.write.bind(t.kv);
    t.kv.write = async (k, v) => {
      if (k === KV_KEYS.aiSettings) throw new Error('locked');
      await write(k, v);
    };
    expect(await t.yourAi.saveByok({ ...form, newKey: TEST_KEY })).toEqual({
      kind: 'storageFailed',
    });
    expect(t.settings.getSnapshot().byokKeyHost).toBe('');
    // The live rung therefore cannot release the key.
    expect(await t.services.rung.recognize(photoBytes(1))).toEqual({
      kind: 'recognitionFailure',
      cause: 'noAi',
    });
  });
});

describe('YourAi.removeByok', () => {
  it('clears the key and the binding and returns to the exact previous rung', async () => {
    const t = await setup();
    await t.yourAi.saveByok({ ...form, newKey: TEST_KEY });
    await t.yourAi.removeByok();
    expect(t.kv.map.has(KV_KEYS.aiByokKey)).toBe(false);
    expect(t.settings.getSnapshot().rung).toEqual({ kind: 'noOp' });
    expect(t.settings.getSnapshot().byokKeyHost).toBe('');
    expect(await t.yourAi.keyStatus()).toEqual({ hasKey: false, keyEnding: null });
  });
});

describe('YourAi.testConnection', () => {
  it('a typed key wins and nothing is persisted by a test', async () => {
    const t = await setup();
    expect(await t.yourAi.testConnection({ ...form, typedKey: TEST_KEY })).toEqual({ kind: 'ok' });
    expect(t.fake.last.headers.authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(t.kv.writes).toBe(0);
  });

  it('with no key typed or saved the result is "not configured" and no request is made', async () => {
    const t = await setup();
    expect(await t.yourAi.testConnection(form)).toEqual({ kind: 'notConfigured' });
    expect(t.fake.requests).toHaveLength(0);
  });

  it('uses the saved key only for the host it was entered for', async () => {
    const t = await setup();
    await t.yourAi.saveByok({ ...form, newKey: TEST_KEY });
    expect(await t.yourAi.testConnection(form)).toEqual({ kind: 'ok' });
    expect(t.fake.last.headers.authorization).toBe(`Bearer ${TEST_KEY}`);
    const sent = t.fake.requests.length;
    expect(
      await t.yourAi.testConnection({ endpointUrl: 'https://other.example.org/v1', model: 'm' }),
    ).toEqual({ kind: 'keyForOtherHost' });
    expect(t.fake.requests).toHaveLength(sent);
  });
});

describe('copy', () => {
  it('shows only the last four of a long key', () => {
    expect(keySavedText('abcd')).toBe('key saved • ends with ••••abcd');
    expect(keySavedText(null)).toBe('key saved');
  });

  it('maps every save and test outcome to calm copy on the right field, key-free', () => {
    expect(saveResultMessage({ kind: 'saved' })).toEqual({ field: 'message', text: 'Saved.' });
    expect(saveResultMessage({ kind: 'endpointInvalid', problem: 'notHttps' }).field).toBe(
      'endpoint',
    );
    expect(saveResultMessage({ kind: 'modelMissing' }).field).toBe('model');
    expect(
      saveResultMessage({ kind: 'keyForOtherHost', savedFor: 'a.example.com' }).text,
    ).toContain('a.example.com');
    expect(connectionResultMessage({ kind: 'unexpectedStatus', statusCode: 404 }).text).toContain(
      '404',
    );
    const blocked = connectionResultMessage({ kind: 'unreachable', reason: 'network' }).text;
    expect(blocked).toContain("Couldn't reach the service.");
    expect(blocked).toContain('CORS');
    expect(connectionResultMessage({ kind: 'unreachable', reason: 'timeout' }).text).not.toContain(
      'CORS',
    );
    for (const r of [
      { kind: 'ok' },
      { kind: 'keyRejected' },
      { kind: 'rateLimited' },
      { kind: 'notConfigured' },
      { kind: 'keyForOtherHost' },
      { kind: 'responseTooLarge' },
    ] as const) {
      expect(connectionResultMessage(r).text).not.toContain('sk-');
    }
  });

  it('the status line shows the live rung', async () => {
    const t = await setup();
    expect(rungStatusLine(t.settings.getSnapshot(), false)).toBe('offline (no AI)');
    await t.yourAi.saveByok({ ...form, newKey: TEST_KEY });
    expect(rungStatusLine(t.settings.getSnapshot(), true)).toBe('your key — 1 model');
    expect(rungStatusLine(t.settings.getSnapshot(), false)).toBe('your key — none');
    expect(previousRungHint(t.settings.getSnapshot())).toBe(
      'removing this key returns to offline (no AI)',
    );
  });
});

describe('createAiServices', () => {
  it('starts from the persisted settings and tolerates a corrupt blob', async () => {
    const kv = new MemoryKv();
    kv.map.set(KV_KEYS.aiSettings, '{"kind":"hostedQuota","consents":"x"}');
    const s = await createAiServices({
      kv,
      sanitizePhoto: stubSanitizer,
      classifyFoodGroup: stubClassify,
      photoDigest: stubDigest,
    });
    expect(s.settings.getSnapshot().rung.kind).toBe('noOp');
    kv.map.set(KV_KEYS.aiSettings, 'not json');
    await s.settings.reload();
    expect(s.settings.getSnapshot().rung.kind).toBe('noOp');
  });
});
