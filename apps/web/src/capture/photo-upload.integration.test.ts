// The whole photo path with NOTHING stubbed except the network: runPhotoFlow (the one consent
// orchestrator) + the real sanitiser + the real SHA-256 digest + the one PhotoUploadPermit +
// ConsentGatedAiRung + the BYOK provider, over a fake fetch.
import { describe, expect, it } from 'vitest';
import { catalogFailure, rankedMatches, type FoodCatalog, type RecognitionResult } from '@anc/core';
import { AiSettings } from '../ai/ai-settings';
import { AiSettingsController } from '../ai/ai-settings-controller';
import { InMemoryAiSettingsStore } from '../ai/ai-settings-store';
import { InMemoryByokKeyStore } from '../ai/byok-key-store';
import { OpenAiCompatibleByokProvider } from '../ai/openai-compatible-provider';
import { photoFlowConsentDeps } from '../ai/photo-consent';
import { PhotoUploadPermit } from '../ai/photo-upload-permit';
import { createLiveAiRung } from '../ai/rung-registry';
import { FakeFetch, TEST_KEY, chatReply } from '../ai/testing';
import { classifyFoodByName } from '../catalog';
import { photoDigest } from './photo-digest';
import { runPhotoFlow, type PhotoFlowState } from './photo-flow';
import { sanitizePhotoForUpload } from './photo-sanitizer';
import { codes, jpegWithExif } from './testing';

const HOST = 'api.example.com';

function setup(over: { askBeforeEveryPhoto?: boolean } = {}) {
  const settings = new AiSettings({
    rung: { kind: 'byok', previousRung: { previousKind: 'noOp' } },
    byokEndpointUrl: `https://${HOST}/v1`,
    byokModel: 'vision-1',
    byokKeyHost: HOST,
    ...over,
  });
  const controller = new AiSettingsController({
    store: new InMemoryAiSettingsStore(settings),
    initial: settings,
  });
  const fake = new FakeFetch();
  fake.jsonBody = chatReply('[{"name":"egg","quantityHint":"2"},{"name":"rice"}]');
  const permit = new PhotoUploadPermit(photoDigest);
  const rung = createLiveAiRung({
    getSettings: controller.getSnapshot,
    keyStore: new InMemoryByokKeyStore(TEST_KEY),
    permit,
    createProvider: (args) =>
      new OpenAiCompatibleByokProvider({
        ...args,
        sanitizePhoto: sanitizePhotoForUpload, // the real one: Phase 5's result is used directly
        classifyFoodGroup: classifyFoodByName,
        fetch: fake.fetch,
      }),
  });
  const catalog: FoodCatalog = {
    search: async () => rankedMatches([]),
    lookupBySourceRef: async () => null,
    lookupByBarcode: async () => catalogFailure('barcodeUnsupported'),
  };
  const asked: { host: string; perPhoto: boolean }[] = [];
  const states: PhotoFlowState[] = [];
  const run = (photo: Uint8Array, answer: boolean) =>
    runPhotoFlow({
      capture: { capture: async () => photo },
      getRung: () => rung,
      ...photoFlowConsentDeps(controller),
      askConsent: async (r) => {
        asked.push(r);
        return answer;
      },
      permit,
      catalog,
      onState: (s) => states.push(s),
    });
  return { run, fake, asked, states, permit, controller };
}

const contains = (haystack: Uint8Array, needle: string): boolean =>
  Array.from(haystack).some((_, i) => codes(needle).every((c, j) => haystack[i + j] === c));

function sentImage(body: string): Uint8Array {
  const parsed = JSON.parse(body) as {
    messages: { content: { type: string; image_url?: { url: string } }[] }[];
  };
  const part = parsed.messages[0]?.content.find((p) => p.type === 'image_url');
  const url = part?.image_url?.url ?? '';
  const prefix = 'data:image/jpeg;base64,';
  expect(url.startsWith(prefix)).toBe(true);
  return Uint8Array.from(atob(url.slice(prefix.length)), (c) => c.charCodeAt(0));
}

describe('photo path, end to end (real sanitiser, digest, permit, gate, provider)', () => {
  it('per-photo yes: exactly one POST, and its body carries no EXIF / GPS bytes', async () => {
    const t = setup();
    const photo = jpegWithExif();
    // The fixture really does carry location and camera metadata.
    expect(contains(photo, 'Exif')).toBe(true);
    expect(contains(photo, 'GPS:48.8584N')).toBe(true);

    const final = await t.run(photo, true);

    expect(t.asked).toEqual([{ host: HOST, perPhoto: true }]);
    expect(t.fake.requests).toHaveLength(1);
    expect(t.fake.last.url).toBe(`https://${HOST}/v1/chat/completions`);
    expect(t.fake.last.init.method).toBe('POST');

    // The raw request body, and the image decoded back to bytes, are free of the metadata.
    expect(t.fake.last.body).not.toContain('GPS');
    expect(t.fake.last.body).not.toContain('Exif');
    const sent = sentImage(t.fake.last.body);
    expect(contains(sent, 'Exif')).toBe(false);
    expect(contains(sent, 'GPS')).toBe(false);
    expect(contains(sent, 'hi!!')).toBe(false); // the COM segment
    const sanitized = sanitizePhotoForUpload(photo);
    expect(sanitized.kind).toBe('sanitized');
    if (sanitized.kind === 'sanitized') expect(sent).toEqual(sanitized.bytes);

    // The AI fallback classifier ran on whole names.
    expect(final.kind).toBe('ready');
    const result: RecognitionResult | undefined = final.kind === 'ready' ? final.result : undefined;
    expect(result?.kind).toBe('recognizedPlate');
    if (result?.kind === 'recognizedPlate') {
      expect(result.foods.map((f) => f.databaseFood.foodGroup)).toEqual(['protein', 'starch']);
    }

    // Nothing is remembered and the permit was spent: a second photo asks again.
    expect(t.controller.getSnapshot().photoConsentHosts.size).toBe(0);
    expect(await t.permit.consume({ host: HOST, bytes: photo })).toBe(false);
    await t.run(photo, true);
    expect(t.asked).toHaveLength(2);
    expect(t.fake.requests).toHaveLength(2);
  });

  it('"Not now": zero POSTs, and the no-AI core takes over', async () => {
    const t = setup();
    const final = await t.run(jpegWithExif(), false);
    expect(t.fake.requests).toHaveLength(0);
    expect(final).toMatchObject({ kind: 'ready', result: { kind: 'recognizedPlate', foods: [] } });
  });

  it('a photo the sanitiser refuses is never sent, even after a yes', async () => {
    const t = setup();
    const final = await t.run(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), true);
    expect(t.fake.requests).toHaveLength(0);
    expect(final).toMatchObject({
      kind: 'ready',
      result: { kind: 'recognitionFailure', cause: 'photoNotSendable' },
    });
  });
});
