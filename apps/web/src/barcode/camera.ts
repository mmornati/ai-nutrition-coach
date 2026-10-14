/**
 * Camera permission with three calm states, never a nag. Port of the `CameraPermission` port and
 * the `PermissionHandlerCameraPermission` mapping in `scanner_adapters.dart`:
 *
 *  - `granted`      a live stream;
 *  - `denied`       the person (or the browser policy) said no;
 *  - `unavailable`  no camera, a camera in use elsewhere, or no `getUserMedia` at all.
 *
 * Asked at most once per scan session by the caller, with no "try again" button: if they deny, the
 * screen shows one tap-to-type path. No frame ever leaves the device from here.
 */
export type CameraResult =
  | { readonly kind: 'granted'; readonly stream: MediaStream }
  | { readonly kind: 'denied' }
  | { readonly kind: 'unavailable' };

export type CameraRequest = () => Promise<CameraResult>;

/** The rear camera if there is one, no audio ever. */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = Object.freeze({
  audio: false,
  video: { facingMode: { ideal: 'environment' } },
});

export function createCameraRequest(
  mediaDevices: Pick<MediaDevices, 'getUserMedia'> | undefined = globalThis.navigator?.mediaDevices,
): CameraRequest {
  return async () => {
    if (mediaDevices === undefined || typeof mediaDevices.getUserMedia !== 'function') {
      return { kind: 'unavailable' }; // an insecure context or a very old browser
    }
    try {
      return { kind: 'granted', stream: await mediaDevices.getUserMedia(CAMERA_CONSTRAINTS) };
    } catch (error) {
      const name = error instanceof DOMException || error instanceof Error ? error.name : '';
      // NotAllowedError: refused (or blocked by policy); SecurityError: the page may not ask.
      if (
        name === 'NotAllowedError' ||
        name === 'SecurityError' ||
        name === 'PermissionDeniedError'
      ) {
        return { kind: 'denied' };
      }
      // NotFoundError, NotReadableError, OverconstrainedError, AbortError, anything else.
      return { kind: 'unavailable' };
    }
  };
}

/** Release the camera: stop every track (the light goes off). */
export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}
