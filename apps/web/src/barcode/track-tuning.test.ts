import { describe, expect, it, vi } from 'vitest';
import { pickZoom, setTorch, tuneTrack, videoTrackOf } from './track-tuning';

const track = (
  caps: unknown,
  applyConstraints = vi.fn<(c: unknown) => Promise<undefined>>(async () => undefined),
) => ({
  getCapabilities: () => caps,
  applyConstraints,
});

describe('pickZoom', () => {
  it('2x, clamped into the supported range', () => {
    expect(pickZoom({ min: 1, max: 5 })).toBe(2);
    expect(pickZoom({ min: 3, max: 10 })).toBe(3);
    expect(pickZoom({ min: 0.5, max: 1.5 })).toBe(1.5);
  });
  it('no usable range -> null', () => {
    expect(pickZoom(undefined)).toBeNull();
    expect(pickZoom({})).toBeNull();
    expect(pickZoom({ min: 1, max: 0 })).toBeNull();
  });
});

describe('tuneTrack', () => {
  it('applies zoom and continuous focus, reports the torch', async () => {
    const t = track({ zoom: { min: 1, max: 4 }, focusMode: ['manual', 'continuous'], torch: true });
    expect(await tuneTrack(t)).toEqual({ zoom: 2, continuousFocus: true, torchAvailable: true });
    expect(t.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }] });
    expect(t.applyConstraints).toHaveBeenCalledWith({ advanced: [{ focusMode: 'continuous' }] });
  });

  it('applies only what the track supports', async () => {
    const t = track({});
    expect(await tuneTrack(t)).toEqual({
      zoom: null,
      continuousFocus: false,
      torchAvailable: false,
    });
    expect(t.applyConstraints).not.toHaveBeenCalled();
  });

  it('a refused constraint is not fatal and not reported as applied', async () => {
    const t = track(
      { zoom: { min: 1, max: 4 }, focusMode: ['continuous'], torch: true },
      vi.fn(async () => {
        throw new DOMException('x', 'OverconstrainedError');
      }),
    );
    expect(await tuneTrack(t)).toEqual({
      zoom: null,
      continuousFocus: false,
      torchAvailable: true,
    });
  });

  it('a track without the APIs, or whose getCapabilities throws, is left alone', async () => {
    const none = { zoom: null, continuousFocus: false, torchAvailable: false };
    expect(await tuneTrack(undefined)).toEqual(none);
    expect(await tuneTrack({})).toEqual(none);
    expect(
      await tuneTrack({
        getCapabilities: () => {
          throw new Error('x');
        },
      }),
    ).toEqual(none);
  });
});

describe('setTorch', () => {
  it('applies the torch constraint and says whether it was accepted', async () => {
    const t = track({ torch: true });
    expect(await setTorch(t, true)).toBe(true);
    expect(t.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
    const refusing = track(
      {},
      vi.fn(() => Promise.reject(new Error('no'))),
    );
    expect(await setTorch(refusing, true)).toBe(false);
    expect(await setTorch(undefined, true)).toBe(false);
  });
});

describe('videoTrackOf', () => {
  it('first video track; tolerant of partial streams', () => {
    const v = {};
    expect(videoTrackOf({ getVideoTracks: () => [v] } as never)).toBe(v);
    expect(videoTrackOf({} as never)).toBeUndefined();
  });
});
