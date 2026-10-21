import { describe, expect, it } from 'vitest';
import {
  GUIDE_HEIGHT,
  GUIDE_WIDTH,
  cropOutputScale,
  fullFrameSize,
  guideSourceRect,
  visibleSourceRect,
} from './roi';

describe('visibleSourceRect (object-cover)', () => {
  it('a wider source than the box loses its sides', () => {
    // 1920x1080 into a 4:3 box
    expect(visibleSourceRect(1920, 1080, 400, 300)).toEqual({ x: 240, y: 0, w: 1440, h: 1080 });
  });
  it('a taller source than the box loses its top and bottom', () => {
    // 1080x1920 portrait into a 4:3 box
    const r = visibleSourceRect(1080, 1920, 400, 300);
    expect(r.x).toBe(0);
    expect(r.w).toBe(1080);
    expect(r.h).toBeCloseTo(810);
    expect(r.y).toBeCloseTo(555);
  });
  it('same ratio shows everything; an unmeasured box falls back to the whole frame', () => {
    expect(visibleSourceRect(1600, 1200, 400, 300)).toEqual({ x: 0, y: 0, w: 1600, h: 1200 });
    expect(visibleSourceRect(1600, 1200, 0, 0)).toEqual({ x: 0, y: 0, w: 1600, h: 1200 });
  });
});

describe('guideSourceRect', () => {
  it('is the centred 80% x 35% of the visible window, in whole pixels', () => {
    const r = guideSourceRect(1920, 1080, 400, 300);
    expect(r.w).toBe(Math.round(1440 * GUIDE_WIDTH));
    expect(r.h).toBe(Math.round(1080 * GUIDE_HEIGHT));
    expect(r.x + r.w / 2).toBeCloseTo(960, 0);
    expect(r.y + r.h / 2).toBeCloseTo(540, 0);
  });
  it('portrait video: still centred on what is visible', () => {
    const r = guideSourceRect(1080, 1920, 400, 300);
    expect(r.w).toBe(864);
    expect(r.x + r.w / 2).toBe(540);
    expect(r.y + r.h / 2).toBeCloseTo(960, 0);
  });
  it('always inside the frame', () => {
    const cases: [number, number, number, number][] = [
      [640, 480, 1, 1],
      [1920, 1080, 50, 400],
      [3, 3, 0, 0],
    ];
    for (const [vw, vh, cw, ch] of cases) {
      const r = guideSourceRect(vw, vh, cw, ch);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(vw);
      expect(r.y + r.h).toBeLessThanOrEqual(vh);
      expect(r.w).toBeGreaterThan(0);
    }
  });
});

describe('scales', () => {
  it('a narrow crop is doubled, a wide one is not', () => {
    expect(cropOutputScale(639)).toBe(2);
    expect(cropOutputScale(640)).toBe(1);
  });
  it('the whole-frame fallback is at most 1280 wide', () => {
    expect(fullFrameSize(1920, 1080)).toEqual({ w: 1280, h: 720 });
    expect(fullFrameSize(640, 480)).toEqual({ w: 640, h: 480 });
  });
});
