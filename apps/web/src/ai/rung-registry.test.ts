import { describe, expect, it } from 'vitest';
import { AiSettings } from './ai-settings';
import { AiSettingsController } from './ai-settings-controller';
import { InMemoryAiSettingsStore } from './ai-settings-store';
import { InMemoryByokKeyStore } from './byok-key-store';
import { OpenAiCompatibleByokProvider } from './openai-compatible-provider';
import { PhotoUploadPermit } from './photo-upload-permit';
import { buildAiRung, createLiveAiRung } from './rung-registry';
import {
  RUNG_LISTING,
  SELECTABLE_RUNGS,
  isSelectableRung,
  normaliseRungConfig,
  normaliseRungKind,
} from './rungs';
import {
  FakeFetch,
  TEST_KEY,
  chatReply,
  photoBytes,
  stubClassify,
  stubDigest,
  stubSanitizer,
} from './testing';
import { rungChoices } from './copy';

describe('rungs', () => {
  it('lists four rungs; only No AI and My own key are always selectable (the server’s AI joins while offered)', () => {
    expect(RUNG_LISTING.map((r) => r.kind)).toEqual(['noOp', 'byok', 'hostedQuota', 'local']);
    expect([...SELECTABLE_RUNGS]).toEqual(['noOp', 'byok', 'instance']);
    expect(isSelectableRung('hostedQuota')).toBe(false);
    expect(isSelectableRung('local')).toBe(false);
    const choices = rungChoices();
    expect(choices.filter((c) => c.selectable).map((c) => c.label)).toEqual([
      'No AI',
      'My own key',
    ]);
    expect(choices.filter((c) => !c.selectable).map((c) => c.help)).toEqual([
      'Not available yet',
      'Not available yet',
    ]);
  });

  it('normalises an unavailable rung (and an unavailable previous rung) to No AI', () => {
    expect(normaliseRungKind('hostedQuota')).toBe('noOp');
    expect(normaliseRungKind('local')).toBe('noOp');
    expect(normaliseRungConfig({ kind: 'local' })).toEqual({ kind: 'noOp' });
    expect(
      normaliseRungConfig({ kind: 'byok', previousRung: { previousKind: 'hostedQuota' } }),
    ).toEqual({ kind: 'byok', previousRung: { previousKind: 'noOp' } });
    // Only BYOK carries a previous rung.
    expect(normaliseRungConfig({ kind: 'noOp', previousRung: { previousKind: 'noOp' } })).toEqual({
      kind: 'noOp',
    });
  });
});

describe('the live rung', () => {
  it('follows the settings on the very next photo, with no restart', async () => {
    const fake = new FakeFetch();
    fake.jsonBody = chatReply('[{"name":"Apple"}]');
    const controller = new AiSettingsController({
      store: new InMemoryAiSettingsStore(),
      initial: new AiSettings({
        byokEndpointUrl: 'https://api.example.com/v1',
        byokModel: 'm',
        byokKeyHost: 'api.example.com',
        askBeforeEveryPhoto: false,
        photoConsentHosts: ['api.example.com'],
      }),
    });
    const rung = createLiveAiRung({
      getSettings: controller.getSnapshot,
      keyStore: new InMemoryByokKeyStore(TEST_KEY),
      permit: new PhotoUploadPermit(stubDigest),
      createProvider: (a) =>
        new OpenAiCompatibleByokProvider({
          ...a,
          sanitizePhoto: stubSanitizer,
          classifyFoodGroup: stubClassify,
          fetch: fake.fetch,
        }),
    });
    expect(await rung.recognize(photoBytes(1))).toEqual({
      kind: 'recognitionFailure',
      cause: 'noAi',
    });
    expect(fake.requests).toHaveLength(0);

    await controller.setRung({ kind: 'byok', previousRung: { previousKind: 'noOp' } });
    expect((await rung.recognize(photoBytes(1))).kind).toBe('recognizedPlate');
    expect(fake.requests).toHaveLength(1);

    await controller.setRung({ kind: 'noOp' });
    await rung.recognize(photoBytes(1));
    expect(fake.requests).toHaveLength(1);
  });

  it('a key entered for another host is never released to an edited endpoint', async () => {
    const fake = new FakeFetch();
    const settings = new AiSettings({
      rung: { kind: 'byok', previousRung: { previousKind: 'noOp' } },
      byokEndpointUrl: 'https://other.example.org/v1',
      byokModel: 'm',
      byokKeyHost: 'api.example.com',
      askBeforeEveryPhoto: false,
      photoConsentHosts: ['other.example.org'],
    });
    const rung = buildAiRung(settings, {
      getSettings: () => settings,
      keyStore: new InMemoryByokKeyStore(TEST_KEY),
      permit: new PhotoUploadPermit(stubDigest),
      createProvider: (a) =>
        new OpenAiCompatibleByokProvider({
          ...a,
          sanitizePhoto: stubSanitizer,
          classifyFoodGroup: stubClassify,
          fetch: fake.fetch,
        }),
    });
    expect(await rung.recognize(photoBytes(1))).toMatchObject({ cause: 'keyMissing' });
    expect(fake.requests).toHaveLength(0);
  });

  it('an unset or invalid endpoint is "not configured", not "key missing", and sends nothing', async () => {
    for (const endpoint of ['', 'http://example.com/v1', 'not a url']) {
      const fake = new FakeFetch();
      const settings = new AiSettings({
        rung: { kind: 'byok', previousRung: { previousKind: 'noOp' } },
        byokEndpointUrl: endpoint,
        byokModel: 'm',
        byokKeyHost: 'api.example.com',
      });
      const rung = buildAiRung(settings, {
        getSettings: () => settings,
        keyStore: new InMemoryByokKeyStore(TEST_KEY),
        permit: new PhotoUploadPermit(stubDigest),
        createProvider: (a) =>
          new OpenAiCompatibleByokProvider({
            ...a,
            sanitizePhoto: stubSanitizer,
            classifyFoodGroup: stubClassify,
            fetch: fake.fetch,
          }),
      });
      expect(await rung.recognize(photoBytes(1)), endpoint).toMatchObject({
        kind: 'recognitionFailure',
        cause: 'notConfigured',
      });
      expect(fake.requests, endpoint).toHaveLength(0);
    }
  });

  it('the hosted and local rungs make no request', async () => {
    for (const kind of ['hostedQuota', 'local'] as const) {
      const fake = new FakeFetch();
      const settings = new AiSettings({ rung: { kind } });
      const rung = buildAiRung(settings, {
        getSettings: () => settings,
        keyStore: new InMemoryByokKeyStore(TEST_KEY),
        permit: new PhotoUploadPermit(stubDigest),
        createProvider: () => {
          throw new Error('no transport for an unavailable rung');
        },
      });
      expect(await rung.recognize(photoBytes(1))).toMatchObject({ cause: 'unsupported' });
      expect(fake.requests).toHaveLength(0);
    }
  });
});
