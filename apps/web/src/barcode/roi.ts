/**
 * Where the guide box sits in the camera frame. The preview is `object-cover` inside a box of a
 * different aspect ratio, so part of the frame is cropped away on screen; the reticle is drawn
 * centred on the visible part. To decode what the person sees inside the reticle we map the box
 * back to source pixels: first the visible window (what `object-cover` shows), then the centred
 * guide fraction of that window.
 */
export const GUIDE_WIDTH = 0.8;
export const GUIDE_HEIGHT = 0.35;
/** A crop narrower than this is drawn at twice its size: small bars decode better when bigger. */
export const MIN_CROP_WIDTH = 640;
/** The widest the whole-frame fallback attempt is. */
export const FULL_FRAME_MAX_WIDTH = 1280;
/** Every Nth attempt reads the whole frame instead of the guide box. */
export const FULL_FRAME_EVERY = 4;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The part of a `vw x vh` source that `object-cover` shows in a `cw x ch` box. */
export function visibleSourceRect(vw: number, vh: number, cw: number, ch: number): Rect {
  if (!(cw > 0) || !(ch > 0)) return { x: 0, y: 0, w: vw, h: vh }; // not laid out: the whole frame
  const boxRatio = cw / ch;
  const srcRatio = vw / vh;
  if (srcRatio > boxRatio) {
    const w = vh * boxRatio; // the sides are cropped
    return { x: (vw - w) / 2, y: 0, w, h: vh };
  }
  const h = vw / boxRatio; // the top and bottom are cropped
  return { x: 0, y: (vh - h) / 2, w: vw, h };
}

/** The guide box in source pixels (integers, inside the frame). */
export function guideSourceRect(vw: number, vh: number, cw: number, ch: number): Rect {
  const v = visibleSourceRect(vw, vh, cw, ch);
  const w = Math.min(vw, Math.max(1, Math.round(v.w * GUIDE_WIDTH)));
  const h = Math.min(vh, Math.max(1, Math.round(v.h * GUIDE_HEIGHT)));
  const x = Math.min(Math.max(0, Math.round(v.x + (v.w - w) / 2)), vw - w);
  const y = Math.min(Math.max(0, Math.round(v.y + (v.h - h) / 2)), vh - h);
  return { x, y, w, h };
}

/** Canvas scale for a crop: native, or doubled when the crop is narrow. */
export function cropOutputScale(cropWidth: number): 1 | 2 {
  return cropWidth < MIN_CROP_WIDTH ? 2 : 1;
}

/** Canvas size for the whole-frame fallback: at most {@link FULL_FRAME_MAX_WIDTH} wide. */
export function fullFrameSize(vw: number, vh: number): { w: number; h: number } {
  const scale = Math.min(1, FULL_FRAME_MAX_WIDTH / vw);
  return { w: Math.max(1, Math.round(vw * scale)), h: Math.max(1, Math.round(vh * scale)) };
}
