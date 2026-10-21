/**
 * Tuning the live video track once the camera runs: a little zoom, so the person can hold the
 * phone at a distance where the lens focuses (about 20 to 30 cm), and continuous focus. And the
 * torch, where the track has one. Everything is best effort: capabilities differ by browser and
 * device (Safari on iPhone reports zoom and torch on most rear cameras; Firefox none), and a
 * refused constraint is never an error the person sees.
 */

/** The parts of a `MediaStreamTrack` used here (the DOM typings omit zoom / torch / focusMode). */
export interface TunableTrack {
  getCapabilities?(): unknown;
  applyConstraints?(constraints: unknown): Promise<void>;
}

interface RangeCap {
  readonly min?: number;
  readonly max?: number;
}
interface Caps {
  readonly zoom?: RangeCap;
  readonly torch?: boolean;
  readonly focusMode?: readonly string[];
}

export const TARGET_ZOOM = 2;

export interface TrackTuning {
  readonly zoom: number | null;
  readonly continuousFocus: boolean;
  readonly torchAvailable: boolean;
}

const NOTHING: TrackTuning = { zoom: null, continuousFocus: false, torchAvailable: false };

/** `clamp(2, min, max)`, or `null` when the range is unusable. */
export function pickZoom(cap: RangeCap | undefined, target: number = TARGET_ZOOM): number | null {
  if (cap === undefined || typeof cap.max !== 'number' || !(cap.max > 0)) return null;
  const min = typeof cap.min === 'number' ? cap.min : 1;
  const zoom = Math.min(Math.max(target, min), cap.max);
  return Number.isFinite(zoom) ? zoom : null;
}

async function apply(track: TunableTrack, advanced: Record<string, unknown>): Promise<boolean> {
  if (typeof track.applyConstraints !== 'function') return false;
  try {
    await track.applyConstraints({ advanced: [advanced] });
    return true;
  } catch {
    return false;
  }
}

/** Apply zoom and continuous focus where supported. Never throws. */
export async function tuneTrack(track: TunableTrack | undefined): Promise<TrackTuning> {
  if (track === undefined) return NOTHING;
  let caps: Caps;
  try {
    caps = (track.getCapabilities?.() ?? {}) as Caps;
  } catch {
    return NOTHING;
  }
  const target = pickZoom(caps.zoom);
  const zoom = target !== null && (await apply(track, { zoom: target })) ? target : null;
  const continuousFocus =
    Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')
      ? await apply(track, { focusMode: 'continuous' })
      : false;
  return { zoom, continuousFocus, torchAvailable: caps.torch === true };
}

/** Switch the torch. Resolves whether the camera accepted it; never throws. */
export function setTorch(track: TunableTrack | undefined, on: boolean): Promise<boolean> {
  return track === undefined ? Promise.resolve(false) : apply(track, { torch: on });
}

/** The first video track of a stream (tolerates the partial streams of tests). */
export function videoTrackOf(stream: MediaStream): MediaStreamTrack | undefined {
  try {
    return stream.getVideoTracks?.()[0];
  } catch {
    return undefined;
  }
}
