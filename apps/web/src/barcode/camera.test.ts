// The three calm camera states: granted / denied / unavailable.
import { describe, expect, it, vi } from 'vitest';
import {
  CAMERA_CONSTRAINTS,
  MINIMAL_CAMERA_CONSTRAINTS,
  constraintsForDevice,
  createCameraRequest,
  stopStream,
} from './camera';
import { fakeStream } from './testing';

const rejecting = (name: string) =>
  createCameraRequest({
    getUserMedia: vi.fn(async () => {
      throw new DOMException('x', name);
    }),
  });

describe('createCameraRequest', () => {
  it('granted: a live stream, rear camera preferred, never audio', async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi.fn(async () => stream);
    const result = await createCameraRequest({ getUserMedia })();
    expect(result).toEqual({ kind: 'granted', stream });
    expect(getUserMedia).toHaveBeenCalledWith(CAMERA_CONSTRAINTS);
    expect(CAMERA_CONSTRAINTS.audio).toBe(false);
    expect(CAMERA_CONSTRAINTS.video).toEqual({
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
      advanced: [{ focusMode: 'continuous' }],
    });
  });

  it('every wish is ideal (or advanced): nothing can be an exact requirement', () => {
    const video = CAMERA_CONSTRAINTS.video as Record<string, unknown>;
    for (const key of ['facingMode', 'width', 'height', 'frameRate']) {
      expect(Object.keys(video[key] as object), key).toEqual(['ideal']);
    }
  });

  it('OverconstrainedError on the rich constraints retries the minimal ones once', async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('x', 'OverconstrainedError'))
      .mockResolvedValueOnce(stream);
    const result = await createCameraRequest({ getUserMedia })();
    expect(result).toEqual({ kind: 'granted', stream });
    expect(getUserMedia).toHaveBeenNthCalledWith(1, CAMERA_CONSTRAINTS);
    expect(getUserMedia).toHaveBeenNthCalledWith(2, MINIMAL_CAMERA_CONSTRAINTS);
  });

  it('a refusal is not retried: one prompt, never a loop', async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException('x', 'NotAllowedError');
    });
    expect(await createCameraRequest({ getUserMedia })()).toEqual({ kind: 'denied' });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('refused (NotAllowedError, SecurityError) -> denied', async () => {
    expect(await rejecting('NotAllowedError')()).toEqual({ kind: 'denied' });
    expect(await rejecting('SecurityError')()).toEqual({ kind: 'denied' });
  });

  it('no camera, busy camera, overconstrained, anything else -> unavailable', async () => {
    for (const name of [
      'NotFoundError',
      'NotReadableError',
      'OverconstrainedError',
      'AbortError',
      'TypeError',
    ]) {
      expect(await rejecting(name)(), name).toEqual({ kind: 'unavailable' });
    }
  });

  it('no mediaDevices (an insecure context) -> unavailable, never a throw', async () => {
    expect(await createCameraRequest(undefined)()).toEqual({ kind: 'unavailable' });
    expect(await createCameraRequest({} as never)()).toEqual({ kind: 'unavailable' });
  });
});

describe('stopStream', () => {
  it('stops every track; null is fine', () => {
    const { stream, raw } = fakeStream();
    stopStream(stream);
    expect(raw.stopped).toBe(1);
    expect(() => stopStream(null)).not.toThrow();
  });
});

function streamOf(deviceId: string) {
  const raw = {
    stopped: 0,
    getTracks: () => [{ stop: () => void raw.stopped++ }],
    getVideoTracks: () => [{ getSettings: () => ({ deviceId }) }],
  };
  return { stream: raw as unknown as MediaStream, raw };
}

describe('lens choice', () => {
  const devices = [
    { kind: 'videoinput', deviceId: 'wide', label: 'Back Camera' },
    { kind: 'videoinput', deviceId: 'triple', label: 'Back Triple Camera' },
    { kind: 'videoinput', deviceId: 'front', label: 'Front Camera' },
  ];
  const enumerateDevices = async () => devices as unknown as MediaDeviceInfo[];

  it('switches to the virtual multi-lens camera, stops the first stream, and remembers it for resume', async () => {
    const first = streamOf('wide');
    const second = streamOf('triple');
    const third = streamOf('triple');
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(second.stream)
      .mockResolvedValueOnce(third.stream);
    const request = createCameraRequest({ getUserMedia, enumerateDevices });

    expect(await request()).toEqual({ kind: 'granted', stream: second.stream });
    expect(getUserMedia).toHaveBeenNthCalledWith(2, constraintsForDevice('triple'));
    expect(first.raw.stopped).toBe(1);
    expect(second.raw.stopped).toBe(0);

    // resume: straight to the remembered camera, no default stream and no second lens search
    expect(await request()).toEqual({ kind: 'granted', stream: third.stream });
    expect(getUserMedia).toHaveBeenCalledTimes(3);
    expect(getUserMedia).toHaveBeenNthCalledWith(3, constraintsForDevice('triple'));
  });

  it('the default stream is stopped BEFORE the better camera is opened (one capture at a time on iOS)', async () => {
    const first = streamOf('wide');
    const second = streamOf('triple');
    let stoppedAtSecondCall = -1;
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(first.stream)
      .mockImplementationOnce(async () => {
        stoppedAtSecondCall = first.raw.stopped;
        return second.stream;
      });
    await createCameraRequest({ getUserMedia, enumerateDevices })();
    expect(stoppedAtSecondCall).toBe(1);
  });

  it('if the better camera cannot be opened, the default camera is reopened', async () => {
    const first = streamOf('wide');
    const reopened = streamOf('wide');
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(first.stream)
      .mockRejectedValueOnce(new DOMException('x', 'NotReadableError'))
      .mockResolvedValueOnce(reopened.stream);
    const request = createCameraRequest({ getUserMedia, enumerateDevices });
    expect(await request()).toEqual({ kind: 'granted', stream: reopened.stream });
    expect(getUserMedia).toHaveBeenCalledTimes(3);
    expect(getUserMedia).toHaveBeenNthCalledWith(3, CAMERA_CONSTRAINTS);
    expect(first.raw.stopped).toBe(1);
  });

  it('a refusal on the better camera is denied, not retried', async () => {
    const first = streamOf('wide');
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(first.stream)
      .mockRejectedValueOnce(new DOMException('x', 'NotAllowedError'));
    expect(await createCameraRequest({ getUserMedia, enumerateDevices })()).toEqual({
      kind: 'denied',
    });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('enumerateDevices failing or missing keeps the default stream', async () => {
    const a = streamOf('wide');
    const failing = createCameraRequest({
      getUserMedia: async () => a.stream,
      enumerateDevices: async () => {
        throw new Error('nope');
      },
    });
    expect(await failing()).toEqual({ kind: 'granted', stream: a.stream });
    const b = streamOf('wide');
    expect(await createCameraRequest({ getUserMedia: async () => b.stream })()).toEqual({
      kind: 'granted',
      stream: b.stream,
    });
  });

  it('a camera that is already the best is not reopened', async () => {
    const a = streamOf('triple');
    const getUserMedia = vi.fn(async () => a.stream);
    await createCameraRequest({ getUserMedia, enumerateDevices })();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('a stale remembered camera falls back to the default one', async () => {
    const first = streamOf('wide');
    const second = streamOf('triple');
    const fresh = streamOf('wide');
    const again = streamOf('triple');
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(second.stream)
      .mockRejectedValueOnce(new DOMException('x', 'OverconstrainedError')) // the remembered id is gone
      .mockResolvedValueOnce(fresh.stream)
      .mockResolvedValueOnce(again.stream); // the lens search runs again from the default camera
    const request = createCameraRequest({ getUserMedia, enumerateDevices });
    await request();
    expect(await request()).toEqual({ kind: 'granted', stream: again.stream });
    expect(fresh.raw.stopped).toBe(1);
  });
});
