import { recognizedPlate, type AiRung, type RecognitionResult } from '@anc/core';
import { describe, expect, it } from 'vitest';
import { AiSettings } from './ai-settings';
import { AiSettingsController } from './ai-settings-controller';
import { InMemoryAiSettingsStore } from './ai-settings-store';
import { InMemoryByokKeyStore } from './byok-key-store';
import { ConsentGatedAiRung } from './consent-gated-ai-rung';
import { photoFlowConsentDeps } from './photo-consent';
import { PhotoUploadPermit } from './photo-upload-permit';
import { createLiveAiRung } from './rung-registry';
import { TEST_KEY, photoBytes, stubDigest } from './testing';

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

describe('the rung guards itself', () => {
  const byokSettings = new AiSettings({
    rung: { kind: 'byok', previousRung: { previousKind: 'noOp' } },
    byokEndpointUrl: 'https://api.example.com/v1',
    byokModel: 'm',
    byokKeyHost: host,
  });

  it('refuses when something reaches it without a permit', async () => {
    const controller = new AiSettingsController({
      store: new InMemoryAiSettingsStore(byokSettings),
      initial: byokSettings,
    });
    const rung = createLiveAiRung({
      getSettings: controller.getSnapshot,
      keyStore: new InMemoryByokKeyStore(TEST_KEY),
      permit: new PhotoUploadPermit(stubDigest),
      createProvider: () => ({
        recognize: async () => {
          throw new Error('must not be called');
        },
      }),
    });
    expect(await rung.recognize(photoBytes(1))).toMatchObject({ cause: 'consentRequired' });
  });

  it('photoFlowConsentDeps reads the live settings', async () => {
    const controller = new AiSettingsController({
      store: new InMemoryAiSettingsStore(byokSettings),
      initial: byokSettings,
    });
    const deps = photoFlowConsentDeps(controller);
    expect(deps.uploadHost()).toBe(host);
    expect(deps.askBeforeEveryPhoto()).toBe(true);
    expect(deps.hasHostConsent(host)).toBe(false);
    await deps.grantHostConsent(host);
    expect(deps.hasHostConsent(host)).toBe(true);
  });
});
