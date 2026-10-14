// The photo flow: capture -> consent -> AiRung.recognize -> resolving -> match sheet; "Not now"
// drops the photo; closest matches. Logic ported from apps/client capture_photo_screen.dart and its
// test (the consent / permit parts).
import { describe, expect, it, vi } from 'vitest';
import {
  catalogFailure,
  databaseFood,
  NO_MATCH,
  rankedMatches,
  recognizedPlate,
  type AiRung,
  type FoodCatalog,
  type FoodMatch,
  type RecognitionResult,
} from '@anc/core';
import { PhotoUploadPermit } from '../ai/photo-upload-permit';
import { photoDigest } from './photo-digest';
import { runPhotoFlow, type PhotoFlowDeps, type PhotoFlowState } from './photo-flow';
import { closestMatches, MAX_CLOSEST_MATCHES } from './closest-matches';
import { jpegWithExif } from './testing';

const match = (name: string, confidence = 1): FoodMatch => ({
  food: databaseFood({
    sourceRef: `seed:${name.toLowerCase()}`,
    displayName: name,
    source: 'seed',
  }),
  confidence,
  presets: [],
});

function setup(over: Partial<PhotoFlowDeps> = {}) {
  const photo = jpegWithExif();
  const states: PhotoFlowState[] = [];
  const recognized: Uint8Array[] = [];
  const rung: AiRung = {
    async recognize(bytes) {
      recognized.push(bytes);
      return recognizedPlate([]);
    },
  };
  const catalog: FoodCatalog = {
    search: async () => rankedMatches([match('Rice')]),
    lookupBySourceRef: async () => null,
    lookupByBarcode: async () => catalogFailure('barcodeUnsupported'),
  };
  const deps: PhotoFlowDeps = {
    capture: { capture: async () => photo },
    getRung: () => rung,
    uploadHost: () => 'api.example.com',
    askBeforeEveryPhoto: () => true,
    hasHostConsent: () => false,
    askConsent: async () => true,
    grantHostConsent: async () => undefined,
    permit: new PhotoUploadPermit(photoDigest),
    catalog,
    onState: (s) => states.push(s),
    ...over,
  };
  return { deps, states, recognized, photo };
}

describe('runPhotoFlow', () => {
  it('capture -> consent -> recognize -> resolving -> ready', async () => {
    const { deps, states, recognized, photo } = setup();
    const final = await runPhotoFlow(deps);
    expect(states.map((s) => s.kind)).toEqual(['capturing', 'resolving', 'ready']);
    expect(final.kind).toBe('ready');
    expect(recognized).toEqual([photo]);
  });

  it('camera denied or cancelled returns null -> the calm denied state; nothing else runs', async () => {
    const getRung = vi.fn();
    const { deps, states } = setup({ capture: { capture: async () => null }, getRung });
    expect((await runPhotoFlow(deps)).kind).toBe('denied');
    expect(states.map((s) => s.kind)).toEqual(['capturing', 'denied']);
    expect(getRung).not.toHaveBeenCalled();
  });

  it('a throwing picker is the same denied state', async () => {
    const { deps } = setup({
      capture: {
        capture: async () => {
          throw new Error('boom');
        },
      },
    });
    expect((await runPhotoFlow(deps)).kind).toBe('denied');
  });

  it('"Not now" drops the photo: the rung is never called, the no-AI core renders', async () => {
    const { deps, recognized } = setup({ askConsent: async () => false });
    const final = await runPhotoFlow(deps);
    expect(recognized).toHaveLength(0);
    expect(final).toMatchObject({ kind: 'ready', result: { kind: 'recognizedPlate', foods: [] } });
  });

  it('no upload host (No AI): never asks', async () => {
    const askConsent = vi.fn(async () => true);
    const { deps, recognized } = setup({ uploadHost: () => null, askConsent });
    await runPhotoFlow(deps);
    expect(askConsent).not.toHaveBeenCalled();
    expect(recognized).toHaveLength(1);
  });

  it('a host that cannot be determined fails closed: nothing is sent', async () => {
    const { deps, recognized } = setup({
      uploadHost: () => {
        throw new Error('no settings');
      },
    });
    await runPhotoFlow(deps);
    expect(recognized).toHaveLength(0);
  });

  it('ask-every-photo: a yes grants a one-shot permit for THIS photo and stores no host consent', async () => {
    const grantHostConsent = vi.fn(async () => undefined);
    const permit = new PhotoUploadPermit(photoDigest);
    let spentDuringRecognize: boolean | undefined;
    const photo = jpegWithExif();
    const { deps } = setup({
      permit,
      grantHostConsent,
      capture: { capture: async () => photo },
      getRung: () => ({
        async recognize(bytes) {
          spentDuringRecognize = await permit.consume({ host: 'api.example.com', bytes });
          return recognizedPlate([]);
        },
      }),
    });
    await runPhotoFlow(deps);
    expect(spentDuringRecognize).toBe(true);
    expect(grantHostConsent).not.toHaveBeenCalled();
    // The permit does not outlive the photo.
    expect(await permit.consume({ host: 'api.example.com', bytes: photo })).toBe(false);
  });

  it('an unreadable ask-every-photo setting is read as ASK', async () => {
    const askConsent = vi.fn(async () => false);
    const { deps } = setup({
      askBeforeEveryPhoto: () => {
        throw new Error('locked');
      },
      hasHostConsent: () => true,
      askConsent,
    });
    await runPhotoFlow(deps);
    expect(askConsent).toHaveBeenCalledWith({ host: 'api.example.com', perPhoto: true });
  });

  it('per-host mode: an already-consented host is not asked again', async () => {
    const askConsent = vi.fn(async () => true);
    const { deps, recognized } = setup({
      askBeforeEveryPhoto: () => false,
      hasHostConsent: () => true,
      askConsent,
    });
    await runPhotoFlow(deps);
    expect(askConsent).not.toHaveBeenCalled();
    expect(recognized).toHaveLength(1);
  });

  it('per-host mode: first photo asks and a yes is remembered', async () => {
    const grantHostConsent = vi.fn(async () => undefined);
    const askConsent = vi.fn(async () => true);
    const { deps, recognized } = setup({
      askBeforeEveryPhoto: () => false,
      askConsent,
      grantHostConsent,
    });
    await runPhotoFlow(deps);
    expect(askConsent).toHaveBeenCalledWith({ host: 'api.example.com', perPhoto: false });
    expect(grantHostConsent).toHaveBeenCalledWith('api.example.com');
    expect(recognized).toHaveLength(1);
  });

  it('if consent cannot be saved the photo is NOT sent', async () => {
    const { deps, recognized } = setup({
      askBeforeEveryPhoto: () => false,
      grantHostConsent: async () => {
        throw new Error('store locked');
      },
    });
    await runPhotoFlow(deps);
    expect(recognized).toHaveLength(0);
  });

  it('a throwing rung lands on a calm failure, never an endless resolving state', async () => {
    const { deps } = setup({
      getRung: () => {
        throw new Error('not wired');
      },
    });
    const final = await runPhotoFlow(deps);
    expect(final).toMatchObject({ kind: 'ready', result: { kind: 'recognitionFailure' } });
    // A typed cause only: no English string baked into the flow.
    expect(final.kind === 'ready' && 'message' in final.result).toBe(false);
  });

  it('only a publishing flow that is still wanted publishes (a retake supersedes the first)', async () => {
    let cancelled = false;
    const { deps, states } = setup({
      isCancelled: () => cancelled,
      getRung: () => ({
        async recognize() {
          cancelled = true;
          return NO_MATCH;
        },
      }),
    });
    await runPhotoFlow(deps);
    expect(states.map((s) => s.kind)).toEqual(['capturing', 'resolving']);
  });

  it("a superseded run does not revoke the newer run's permit", async () => {
    const permit = new PhotoUploadPermit(photoDigest);
    const photo = jpegWithExif();
    await permit.grant({ host: 'api.example.com', bytes: photo });
    const { deps } = setup({
      permit,
      askConsent: async () => false,
      isCancelled: () => true,
      isSuperseded: () => true,
    });
    await runPhotoFlow(deps);
    expect(await permit.consume({ host: 'api.example.com', bytes: photo })).toBe(true);
  });

  it('holds no photo afterwards: the published states carry results, never bytes', async () => {
    const { deps, states } = setup();
    await runPhotoFlow(deps);
    for (const s of states) {
      expect(JSON.stringify(s)).not.toContain('"0":');
      expect(Object.values(s).some((v) => v instanceof Uint8Array)).toBe(false);
    }
  });
});

describe('closestMatches', () => {
  const recognition = (names: string[]): RecognitionResult =>
    recognizedPlate(
      names.map((n) => ({
        databaseFood: databaseFood({ sourceRef: `x:${n}`, displayName: n, source: 'seed' }),
        confidence: 0.9,
        quantity: { low: 1, high: 1, unit: 'piece', displayLabel: '~1 piece' },
      })),
    );

  it('catalog matches for each RECOGNISED name (first three, four each), then recent foods; deduplicated', async () => {
    const search = vi.fn(async (q: string) => rankedMatches([match(q), match('Shared')]));
    const catalog: FoodCatalog = { ...setup().deps.catalog, search };
    const out = await closestMatches(recognition(['A', 'B', 'C', 'D']), catalog, async () => [
      match('Recent', 0.3),
      match('A', 0.3),
    ]);
    expect(search).toHaveBeenCalledTimes(3);
    expect(search).toHaveBeenCalledWith('A', { limit: 4 });
    expect(out.map((m) => m.food.displayName)).toEqual(['A', 'Shared', 'B', 'C', 'Recent']);
  });

  it('caps at eight', async () => {
    const many = Array.from({ length: 12 }, (_, i) => match(`Food${i}`));
    const catalog: FoodCatalog = {
      ...setup().deps.catalog,
      search: async () => rankedMatches(many),
    };
    expect(await closestMatches(recognition(['A']), catalog)).toHaveLength(MAX_CLOSEST_MATCHES);
  });

  it('an error in either source just leaves that part out', async () => {
    const catalog: FoodCatalog = {
      ...setup().deps.catalog,
      search: async () => {
        throw new Error('x');
      },
    };
    const out = await closestMatches(recognition(['A']), catalog, async () => [match('Recent')]);
    expect(out.map((m) => m.food.displayName)).toEqual(['Recent']);
    const none = await closestMatches(recognition(['A']), catalog, async () => {
      throw new Error('y');
    });
    expect(none).toEqual([]);
  });

  it('a failed or empty recognition still offers the recent foods', async () => {
    const out = await closestMatches(NO_MATCH, setup().deps.catalog, async () => [match('Recent')]);
    expect(out).toHaveLength(1);
  });
});
