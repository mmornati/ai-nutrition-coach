/**
 * Camera permission with three calm states, never a nag. Port of the `CameraPermission` port and
 * the `PermissionHandlerCameraPermission` mapping in the earlier client:
 *
 *  - `granted`      a live stream;
 *  - `denied`       the person (or the browser policy) said no;
 *  - `unavailable`  no camera, a camera in use elsewhere, or no `getUserMedia` at all.
 *
 * Asked at most once per scan session by the caller, with no "try again" button: if they deny, the
 * screen shows one tap-to-type path. No frame ever leaves the device from here.
 */
import { pickBackCamera } from './lens';
import { videoTrackOf } from './track-tuning';

export type CameraResult =
  | { readonly kind: 'granted'; readonly stream: MediaStream }
  | { readonly kind: 'denied' }
  | { readonly kind: 'unavailable' };

export type CameraRequest = () => Promise<CameraResult>;

/**
 * The rear camera at 1080p, 30 fps, with continuous focus asked for. Every value is `ideal` (and
 * `advanced` entries a device cannot honour are skipped by the browser), so this cannot fail with
 * an OverconstrainedError on a device that merely lacks 1080p; if a browser throws one anyway the
 * request retries with {@link MINIMAL_CAMERA_CONSTRAINTS}. No audio, ever.
 */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = Object.freeze({
  audio: false,
  video: richVideo({ facingMode: { ideal: 'environment' } }),
});

/** Resolution, frame rate and focus mode, all optional wishes. `focusMode` is not in the DOM typings. */
function richVideo(which: Record<string, unknown>): MediaTrackConstraints {
  return {
    ...which,
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
    advanced: [{ focusMode: 'continuous' }],
  } as unknown as MediaTrackConstraints;
}

/** The earlier constraints: the rear camera if there is one, nothing else. */
export const MINIMAL_CAMERA_CONSTRAINTS: MediaStreamConstraints = Object.freeze({
  audio: false,
  video: { facingMode: { ideal: 'environment' } },
});

/** The constraints for one specific camera (the virtual multi-lens device chosen by `lens.ts`). */
export function constraintsForDevice(deviceId: string): MediaStreamConstraints {
  return { audio: false, video: richVideo({ deviceId: { exact: deviceId } }) };
}

type Devices = Pick<MediaDevices, 'getUserMedia'> & Partial<Pick<MediaDevices, 'enumerateDevices'>>;

const errorName = (error: unknown): string =>
  error instanceof DOMException || error instanceof Error ? error.name : '';

// NotAllowedError: refused (or blocked by policy); SecurityError: the page may not ask.
const isPermissionError = (error: unknown): boolean =>
  ['NotAllowedError', 'SecurityError', 'PermissionDeniedError'].includes(errorName(error));

const isOverconstrained = (error: unknown): boolean =>
  ['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(errorName(error));

/** The default rear stream: rich constraints, then the minimal ones if the browser objects. */
async function openDefault(devices: Devices): Promise<MediaStream> {
  try {
    return await devices.getUserMedia(CAMERA_CONSTRAINTS);
  } catch (error) {
    if (!isOverconstrained(error)) throw error;
    return devices.getUserMedia(MINIMAL_CAMERA_CONSTRAINTS);
  }
}

/**
 * After permission, prefer the iOS virtual multi-lens back camera (it switches to the macro lens
 * for close barcodes). iOS Safari runs one capture at a time and opening a second device ends the
 * first track, so the default stream is stopped BEFORE the better camera is opened. If that fails
 * (not a refusal), the default camera is reopened; permission is already granted, so this does not
 * prompt again. A refusal is rethrown. Returns the stream to use and the deviceId to remember for
 * this session (`undefined` when unknown).
 */
async function chooseLens(
  devices: Devices,
  stream: MediaStream,
): Promise<{ stream: MediaStream; deviceId: string | undefined }> {
  const current = videoTrackOf(stream)?.getSettings?.().deviceId;
  let best: string | undefined;
  try {
    if (typeof devices.enumerateDevices !== 'function') return { stream, deviceId: current };
    best = pickBackCamera(await devices.enumerateDevices(), current);
  } catch {
    return { stream, deviceId: current };
  }
  if (best === undefined) return { stream, deviceId: current };
  stopStream(stream);
  try {
    return { stream: await devices.getUserMedia(constraintsForDevice(best)), deviceId: best };
  } catch (error) {
    if (isPermissionError(error)) throw error;
    const fallback = await openDefault(devices);
    return { stream: fallback, deviceId: videoTrackOf(fallback)?.getSettings?.().deviceId };
  }
}

export function createCameraRequest(
  mediaDevices: Devices | undefined = globalThis.navigator?.mediaDevices,
): CameraRequest {
  // The camera chosen in this scan session; reused on resume so the lens does not flip back.
  let chosen: string | undefined;
  return async () => {
    if (mediaDevices === undefined || typeof mediaDevices.getUserMedia !== 'function') {
      return { kind: 'unavailable' }; // an insecure context or a very old browser
    }
    try {
      if (chosen !== undefined) {
        try {
          return {
            kind: 'granted',
            stream: await mediaDevices.getUserMedia(constraintsForDevice(chosen)),
          };
        } catch (error) {
          if (isPermissionError(error)) throw error;
          chosen = undefined; // a stale id: start over with the default camera
        }
      }
      const first = await openDefault(mediaDevices);
      const picked = await chooseLens(mediaDevices, first);
      chosen = picked.deviceId;
      return { kind: 'granted', stream: picked.stream };
    } catch (error) {
      if (isPermissionError(error)) return { kind: 'denied' };
      // NotFoundError, NotReadableError, OverconstrainedError, AbortError, anything else.
      return { kind: 'unavailable' };
    }
  };
}

/** Release the camera: stop every track (the light goes off). */
export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}
