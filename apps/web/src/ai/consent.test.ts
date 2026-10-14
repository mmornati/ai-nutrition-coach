import { recognizedPlate, type AiRung, type RecognitionResult } from '@anc/core';
import { describe, expect, it } from 'vitest';
import { AiSettings } from './ai-settings';
import { AiSettingsController } from './ai-settings-controller';
import { InMemoryAiSettingsStore } from './ai-settings-store';
import { InMemoryByokKeyStore } from './byok-key-store';
import { ConsentGatedAiRung } from './consent-gated-ai-rung';
import {
  photoConsentRequest,
  recognizeWithConsent,
  type PhotoConsentRequest,
} from './photo-consent';
import { PhotoUploadPermit } from './photo-upload-permit';
import { createLiveAiRung, photoUploadHost } from './rung-registry';
import {
  FakeFetch,
  TEST_KEY,
  chatReply,
  photoBytes,
  stubClassify,
  stubDigest,
  stubSanitizer,
} from './testing';
import { OpenAiCompatibleByokProvider } from './openai-compatible-provider';

class RecordingRung implements AiRung {
  calls: Uint8Array[] = [];
  async recognize(bytes: Uint8Array): Promise<RecognitionResult> {
    this.calls.push(bytes);
    return recognizedPlate([]);
  }
}

const photoA = Uint8Array.from([1, 2, 3]);
const photoB = Uint8Array.from([9, 9, 9]);
const host = 'api.example.com';

describe('PhotoUploadPermit', () => {
  it('is bound to the host: another host cannot spend it, case does not matter', async () => {
    const permit = new PhotoUploadPermit(stubDigest);
    await permit.grant({ host, bytes: photoA });
    expect(await permit.consume({ host: 'evil.example.com', bytes: photoA })).toBe(false);
    expect(await permit.consume({ host: 'API.example.com', bytes: photoA })).toBe(true);
    expect(await permit.consume({ host, bytes: photoA })).toBe(false); // spent
  });

  it('two concurrent consumers cannot both spend one permit', async () => {
    const permit = new PhotoUploadPermit(stubDigest);
    await permit.grant({ host, bytes: photoA });
    const results = await Promise.all([
      permit.consume({ host, bytes: photoA }),
      permit.consume({ host, bytes: photoA }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('works with an async digest (SHA-256 via SubtleCrypto)', async () => {
    const permit = new PhotoUploadPermit(async (bytes) => stubDigest(bytes));
    await permit.grant({ host, bytes: photoA });
    expect(await permit.consume({ host, bytes: photoB })).toBe(false);
    expect(await permit.consume({ host, bytes: photoA })).toBe(true);
  });
});

describe('ConsentGatedAiRung (per-photo mode, the default)', () => {
  const rungFor = (inner: AiRung, permit?: PhotoUploadPermit) =>
    new ConsentGatedAiRung({
      inner,
      hasConsent: () => true, // the standing host agreement is NOT enough
      askEveryPhoto: () => true,
      ...(permit === undefined ? {} : { permit }),
      host,
    });

  it('no permit, no upload; one permit, one upload', async () => {
    const inner = new RecordingRung();
    const permit = new PhotoUploadPermit(stubDigest);
    const rung = rungFor(inner, permit);
    expect(await rung.recognize(photoA)).toMatchObject({
      kind: 'recognitionFailure',
      cause: 'consentRequired',
    });
    expect(inner.calls).toHaveLength(0);

    await permit.grant({ host, bytes: photoA });
    expect((await rung.recognize(photoA)).kind).toBe('recognizedPlate');
    expect(inner.calls).toHaveLength(1);

    // Spent: the next photo is refused until it is granted again.
    expect((await rung.recognize(photoA)).kind).toBe('recognitionFailure');
    expect(inner.calls).toHaveLength(1);
  });

  it('a retake while recognising cannot reuse the permit: it is bound to its photo', async () => {
    const inner = new RecordingRung();
    const permit = new PhotoUploadPermit(stubDigest);
    await permit.grant({ host, bytes: photoA });
    const rung = rungFor(inner, permit);
    expect((await rung.recognize(photoB)).kind).toBe('recognitionFailure');
    expect(inner.calls).toHaveLength(0);
    expect((await rung.recognize(photoA)).kind).toBe('recognizedPlate');
    expect(inner.calls).toEqual([photoA]);
    expect((await rung.recognize(photoA)).kind).toBe('recognitionFailure');
  });

  it('a revoked permit sends nothing', async () => {
    const inner = new RecordingRung();
    const permit = new PhotoUploadPermit(stubDigest);
    await permit.grant({ host, bytes: photoA });
    permit.revoke();
    expect((await rungFor(inner, permit).recognize(photoA)).kind).toBe('recognitionFailure');
    expect(inner.calls).toHaveLength(0);
  });

  it('per-photo mode with no permit object fails closed', async () => {
    const inner = new RecordingRung();
    expect((await rungFor(inner).recognize(photoA)).kind).toBe('recognitionFailure');
    expect(inner.calls).toHaveLength(0);
  });

  it('a throwing mode switch also fails closed', async () => {
    const inner = new RecordingRung();
    const rung = new ConsentGatedAiRung({
      inner,
      hasConsent: () => true,
      askEveryPhoto: () => {
        throw new Error('unreadable');
      },
      host,
    });
    expect((await rung.recognize(photoA)).kind).toBe('recognitionFailure');
    expect(inner.calls).toHaveLength(0);
  });

  it('"ask once" mode uses the per-host agreement, read at call time', async () => {
    let agreed = false;
    const inner = new RecordingRung();
    const rung = new ConsentGatedAiRung({
      inner,
      hasConsent: () => agreed,
      askEveryPhoto: () => false,
      permit: new PhotoUploadPermit(stubDigest),
      host,
    });
    expect((await rung.recognize(photoA)).kind).toBe('recognitionFailure');
    agreed = true;
    expect((await rung.recognize(photoA)).kind).toBe('recognizedPlate');
  });
});

describe('photoConsentRequest', () => {
  const byok = (extra: Partial<ConstructorParameters<typeof AiSettings>[0]> = {}) =>
    new AiSettings({
      rung: { kind: 'byok', previousRung: { previousKind: 'noOp' } },
      byokEndpointUrl: 'https://api.example.com/v1',
      byokModel: 'm',
      ...extra,
    });

  it('No AI never asks (nothing leaves the device)', () => {
    expect(photoConsentRequest(AiSettings.defaults)).toBeNull();
    expect(photoUploadHost(AiSettings.defaults)).toBeNull();
  });

  it('an invalid BYOK endpoint sends nothing, so it asks nothing', () => {
    expect(photoConsentRequest(byok({ byokEndpointUrl: 'http://example.com' }))).toBeNull();
  });

  it('by default EVERY photo asks, even for a host agreed before', () => {
    expect(photoConsentRequest(byok())).toEqual({ host, perPhoto: true });
    expect(photoConsentRequest(byok({ photoConsentHosts: [host] }))).toEqual({
      host,
      perPhoto: true,
    });
  });

  it('with "ask before every photo" off, the host is asked once', () => {
    expect(photoConsentRequest(byok({ askBeforeEveryPhoto: false }))).toEqual({
      host,
      perPhoto: false,
    });
    expect(
      photoConsentRequest(byok({ askBeforeEveryPhoto: false, photoConsentHosts: [host] })),
    ).toBeNull();
  });
});

describe('recognizeWithConsent', () => {
  function setup(settings: AiSettings) {
    const controller = new AiSettingsController({
      store: new InMemoryAiSettingsStore(settings),
      initial: settings,
    });
    const permit = new PhotoUploadPermit(stubDigest);
    const fake = new FakeFetch();
    fake.jsonBody = chatReply('[{"name":"Apple","quantityHint":"1 piece"}]');
    const rung = createLiveAiRung({
      getSettings: controller.getSnapshot,
      keyStore: new InMemoryByokKeyStore(TEST_KEY),
      permit,
      createProvider: (args) =>
        new OpenAiCompatibleByokProvider({
          ...args,
          sanitizePhoto: stubSanitizer,
          classifyFoodGroup: stubClassify,
          fetch: fake.fetch,
        }),
    });
    const asked: PhotoConsentRequest[] = [];
    const run = (answer: boolean, bytes = photoBytes(1)) =>
      recognizeWithConsent({
        photoBytes: bytes,
        settings: controller.getSnapshot,
        controller,
        permit,
        rung,
        ask: async (r) => {
          asked.push(r);
          return answer;
        },
      });
    return { controller, permit, fake, asked, run };
  }
  const byokSettings = (extra: ConstructorParameters<typeof AiSettings>[0] = {}) =>
    new AiSettings({
      rung: { kind: 'byok', previousRung: { previousKind: 'noOp' } },
      byokEndpointUrl: 'https://api.example.com/v1',
      byokModel: 'm',
      byokKeyHost: host,
      ...extra,
    });

  it('per-photo yes sends that photo only and remembers nothing', async () => {
    const t = setup(byokSettings());
    const out = await t.run(true);
    expect(out.consented).toBe(true);
    expect(out.result.kind).toBe('recognizedPlate');
    expect(t.fake.requests).toHaveLength(1);
    expect(t.controller.getSnapshot().photoConsentHosts.size).toBe(0);
    // A second photo asks all over again, and the permit is spent.
    expect(await t.permit.consume({ host, bytes: photoBytes(1) })).toBe(false);
    await t.run(true, photoBytes(2));
    expect(t.asked).toHaveLength(2);
  });

  it('"Not now": the rung is never reached, nothing is stored, the no-AI core takes over', async () => {
    const t = setup(byokSettings());
    const out = await t.run(false);
    expect(out).toEqual({ result: recognizedPlate([]), consented: false });
    expect(t.fake.requests).toHaveLength(0);
    expect(t.controller.getSnapshot().photoConsentHosts.size).toBe(0);
  });

  it('per-host mode: the first yes is remembered, the second photo is not asked', async () => {
    const t = setup(byokSettings({ askBeforeEveryPhoto: false }));
    await t.run(true);
    expect(t.controller.getSnapshot().hasConsentFor(host)).toBe(true);
    expect(t.fake.requests).toHaveLength(1);
    await t.run(true, photoBytes(7));
    expect(t.asked).toHaveLength(1);
    expect(t.fake.requests).toHaveLength(2);
  });

  it('if the per-host consent cannot be saved the photo is NOT sent', async () => {
    const store = new InMemoryAiSettingsStore();
    store.write = async () => {
      throw new Error('locked');
    };
    const initial = byokSettings({ askBeforeEveryPhoto: false });
    const controller = new AiSettingsController({ store, initial });
    const t = setup(initial);
    const out = await recognizeWithConsent({
      photoBytes: photoBytes(1),
      settings: controller.getSnapshot,
      controller,
      permit: t.permit,
      rung: createLiveAiRung({
        getSettings: controller.getSnapshot,
        keyStore: new InMemoryByokKeyStore(TEST_KEY),
        permit: t.permit,
        createProvider: () => ({
          recognize: async () => {
            throw new Error('must not be called');
          },
        }),
      }),
      ask: async () => true,
    });
    expect(out.consented).toBe(false);
    expect(out.result).toEqual(recognizedPlate([]));
    expect(controller.getSnapshot().hasConsentFor(host)).toBe(false);
  });

  it('a throwing dialog fails closed', async () => {
    const t = setup(byokSettings());
    const out = await recognizeWithConsent({
      photoBytes: photoBytes(1),
      settings: t.controller.getSnapshot,
      controller: t.controller,
      permit: t.permit,
      rung: { recognize: async () => recognizedPlate([]) },
      ask: async () => {
        throw new Error('dialog crashed');
      },
    });
    expect(out.consented).toBe(false);
    expect(t.fake.requests).toHaveLength(0);
  });

  it('the rung refuses by itself when something else reaches it without a permit', async () => {
    const t = setup(byokSettings());
    const rung = createLiveAiRung({
      getSettings: t.controller.getSnapshot,
      keyStore: new InMemoryByokKeyStore(TEST_KEY),
      permit: t.permit,
      createProvider: () => ({
        recognize: async () => {
          throw new Error('must not be called');
        },
      }),
    });
    expect(await rung.recognize(photoBytes(1))).toMatchObject({ cause: 'consentRequired' });
  });

  it('No AI never asks and never touches the network', async () => {
    const t = setup(AiSettings.defaults);
    const out = await t.run(true);
    expect(t.asked).toHaveLength(0);
    expect(out.result).toEqual(recognizedPlate([]));
    expect(t.fake.requests).toHaveLength(0);
  });

  it('an unspent permit never outlives the photo', async () => {
    const t = setup(byokSettings());
    // Even when the rung is never reached, the permit is revoked afterwards.
    await recognizeWithConsent({
      photoBytes: photoA,
      settings: t.controller.getSnapshot,
      controller: t.controller,
      permit: t.permit,
      rung: { recognize: async () => recognizedPlate([]) },
      ask: async () => true,
    });
    expect(await t.permit.consume({ host, bytes: photoA })).toBe(false);
  });
});
