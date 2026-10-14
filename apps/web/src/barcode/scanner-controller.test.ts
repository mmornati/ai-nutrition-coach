// The scan session: decoder check -> camera permission -> scanning; three calm states; camera
// lifecycle. Ported from the earlier client ("no local
// barcode detector", "camera lifecycle (F10)", PERMISSION_DENIED, CAMERA_INIT_FAILURE).
import { describe, expect, it, vi } from 'vitest';
import { databaseFood, rankedMatches, type FoodMatch } from '@anc/core';
import type { CameraResult } from './camera';
import {
  ScannerController,
  type ScannerControllerDeps,
  type ScannerState,
} from './scanner-controller';
import { FakeCatalog, FakeDecoder, FakeSurface, granted, ManualScheduler } from './testing';

const nutella: FoodMatch = {
  food: databaseFood({ sourceRef: '3017620422003', displayName: 'Nutella', source: 'off' }),
  confidence: 1,
  presets: [],
};

function setup(
  over: Partial<ScannerControllerDeps> & { camera?: () => Promise<CameraResult> } = {},
) {
  const decoder = new FakeDecoder();
  const surface = new FakeSurface();
  const scheduler = new ManualScheduler();
  const catalog = new FakeCatalog({ '3017620422003': rankedMatches([nutella]) });
  const states: ScannerState[] = [];
  const requestCamera = vi.fn(over.camera ?? (async () => granted()));
  const controller = new ScannerController({
    catalog,
    createDecoder: async () => decoder,
    requestCamera,
    surface,
    scheduler,
    onChange: (s) => states.push(s),
    ...over,
  });
  return { controller, decoder, surface, scheduler, catalog, states, requestCamera };
}

describe('start', () => {
  it('decoder ok + camera granted -> scanning, preview attached, one camera request', async () => {
    const t = setup();
    expect(t.controller.state.kind).toBe('checking');
    await t.controller.start();
    expect(t.controller.state).toEqual({ kind: 'scanning', lookup: { kind: 'idle' } });
    expect(t.surface.attached).toBe(1);
    expect(t.requestCamera).toHaveBeenCalledTimes(1);
    await t.controller.start(); // ONE controller, ONE start per session
    expect(t.requestCamera).toHaveBeenCalledTimes(1);
  });

  it('no local barcode detector -> unsupported, and the camera is NEVER requested', async () => {
    const t = setup({ createDecoder: async () => null });
    await t.controller.start();
    expect(t.controller.state).toEqual({ kind: 'unsupported' });
    expect(t.requestCamera).not.toHaveBeenCalled();
  });

  it('a decoder factory that throws is the same unsupported state', async () => {
    const t = setup({
      createDecoder: async () => {
        throw new Error('boom');
      },
    });
    await t.controller.start();
    expect(t.controller.state.kind).toBe('unsupported');
  });

  it('PERMISSION_DENIED -> denied; no retry, the camera is asked once', async () => {
    const t = setup({ camera: async () => ({ kind: 'denied' }) });
    await t.controller.start();
    expect(t.controller.state).toEqual({ kind: 'denied' });
    expect(t.requestCamera).toHaveBeenCalledTimes(1);
    expect(t.surface.attached).toBe(0);
  });

  it('CAMERA_INIT_FAILURE -> unavailable', async () => {
    const t = setup({ camera: async () => ({ kind: 'unavailable' }) });
    await t.controller.start();
    expect(t.controller.state).toEqual({ kind: 'unavailable' });
  });

  it('a preview that cannot start (autoplay blocked) -> unavailable, and the camera is released', async () => {
    const cam = granted();
    const t = setup({ camera: async () => cam });
    t.surface.failAttach = true;
    await t.controller.start();
    expect(t.controller.state.kind).toBe('unavailable');
    expect(cam.raw.stopped).toBe(1);
  });

  it('disposed while the decoder loads: the camera is never requested; while the camera is asked: it is released', async () => {
    const early = setup();
    const p = early.controller.start();
    early.controller.dispose();
    await p;
    expect(early.requestCamera).not.toHaveBeenCalled();
    expect(early.decoder.disposed).toBe(true);

    const cam = granted();
    let release: (c: CameraResult) => void = () => undefined;
    const late = setup({ camera: () => new Promise<CameraResult>((r) => (release = r)) });
    const q = late.controller.start();
    await Promise.resolve();
    await Promise.resolve();
    late.controller.dispose();
    release(cam);
    await q;
    expect(cam.raw.stopped).toBe(1);
    expect(late.surface.attached).toBe(0);
  });
});

describe('scanning', () => {
  it('decodes a frame per tick and runs the scan flow (match opens; the loop idles while it is shown)', async () => {
    const t = setup();
    await t.controller.start();
    t.decoder.emit('3017620422003');
    await t.scheduler.run();
    expect(t.controller.state).toMatchObject({
      kind: 'scanning',
      lookup: { kind: 'match', code: '3017620422003' },
    });

    const frames = t.decoder.frames;
    await t.scheduler.run();
    await t.scheduler.run();
    expect(t.decoder.frames).toBe(frames); // paused while the result is shown

    t.controller.dismissResult();
    await t.scheduler.run();
    expect(t.decoder.frames).toBe(frames + 1); // resumed
    expect(t.controller.state).toMatchObject({ kind: 'scanning', lookup: { kind: 'idle' } });
  });

  it('a preview that is not ready yet decodes nothing', async () => {
    const t = setup();
    await t.controller.start();
    t.surface.ready = false;
    await t.scheduler.run();
    expect(t.decoder.frames).toBe(0);
    expect(t.scheduler.pending).toBe(true); // keeps polling
  });

  it('a decoder that throws does not stop the loop', async () => {
    const t = setup();
    await t.controller.start();
    t.decoder.decode = async () => {
      throw new Error('bad frame');
    };
    await t.scheduler.run();
    expect(t.scheduler.pending).toBe(true);
  });
});

describe('camera lifecycle (F10)', () => {
  it('backgrounding releases the camera; returning re-acquires it', async () => {
    const first = granted();
    const second = granted();
    const cams = [first, second];
    const t = setup({ camera: async () => cams.shift()! });
    await t.controller.start();
    t.controller.pauseCamera();
    expect(first.raw.stopped).toBe(1);
    expect(t.surface.detached).toBe(1);
    expect(t.scheduler.pending).toBe(false);

    await t.controller.resumeCamera();
    expect(t.requestCamera).toHaveBeenCalledTimes(2);
    expect(t.surface.attached).toBe(2);
    expect(t.scheduler.pending).toBe(true);
  });

  it('repeated background events pause once; resume without a pause does nothing', async () => {
    const t = setup();
    await t.controller.start();
    t.controller.pauseCamera();
    t.controller.pauseCamera();
    expect(t.surface.detached).toBe(1);
    await t.controller.resumeCamera();
    await t.controller.resumeCamera();
    expect(t.requestCamera).toHaveBeenCalledTimes(2); // the second resume found the camera running
  });

  it('a session that never started the camera never resumes it', async () => {
    const t = setup({ camera: async () => ({ kind: 'denied' }) });
    await t.controller.start();
    t.controller.pauseCamera();
    await t.controller.resumeCamera();
    expect(t.surface.detached).toBe(0);
    expect(t.requestCamera).toHaveBeenCalledTimes(1);
  });

  it('after dispose, lifecycle events are ignored and the camera is released', async () => {
    const cam = granted();
    const t = setup({ camera: async () => cam });
    await t.controller.start();
    t.controller.dispose();
    expect(cam.raw.stopped).toBe(1);
    expect(t.decoder.disposed).toBe(true);
    const detached = t.surface.detached;
    t.controller.pauseCamera();
    await t.controller.resumeCamera();
    expect(t.surface.detached).toBe(detached);
    expect(t.requestCamera).toHaveBeenCalledTimes(1);
  });

  it('a camera that is gone on return becomes the calm unavailable state', async () => {
    let n = 0;
    const t = setup({ camera: async () => (n++ === 0 ? granted() : { kind: 'unavailable' }) });
    await t.controller.start();
    t.controller.pauseCamera();
    await t.controller.resumeCamera();
    expect(t.controller.state.kind).toBe('unavailable');
  });
});
