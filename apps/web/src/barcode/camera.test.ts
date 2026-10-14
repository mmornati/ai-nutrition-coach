// The three calm camera states: granted / denied / unavailable.
import { describe, expect, it, vi } from 'vitest';
import { CAMERA_CONSTRAINTS, createCameraRequest, stopStream } from './camera';
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
    expect(CAMERA_CONSTRAINTS.video).toEqual({ facingMode: { ideal: 'environment' } });
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
