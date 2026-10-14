/**
 * The photo-capture port. The adapter wraps a file input (`<input type=file accept=image/*
 * capture=environment>`: the camera on a phone, the file picker on a desktop); tests inject a fake.
 *
 * Returns:
 *  - the downscaled photo bytes on success;
 *  - `null` when the person cancels the picker, the OS denies the camera, or the file cannot be
 *    read as an image. The distinction is deliberately collapsed so the screen renders the same
 *    calm copy in every case (no nag, no retry).
 *
 * Privacy (N1 / N10): the bytes are returned to the caller and held nowhere here: there is no
 * "last photo". The picked `File` is only read, never kept.
 */
import { createBrowserImageCodec, downscalePhoto, type ImageCodec } from './photo-downscale';

export interface PhotoCapture {
  capture(): Promise<Uint8Array | null>;
}

export type PhotoSource = 'camera' | 'files';

/**
 * Open a file input and resolve with the chosen file, or `null` on cancel. Must be called from a
 * user gesture (browsers refuse to open a picker otherwise). `cancel` is fired by current
 * browsers; where it is not, the page regaining focus with no file after a grace period counts as
 * a cancel.
 */
export function pickPhotoFile(
  source: PhotoSource,
  doc: Document = document,
  win: Window = window,
): Promise<File | null> {
  return new Promise<File | null>((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    let settled = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (file: File | null): void => {
      if (settled) return;
      settled = true;
      if (graceTimer !== undefined) clearTimeout(graceTimer);
      win.removeEventListener('focus', onFocus);
      input.remove();
      resolve(file);
    };
    const onFocus = (): void => {
      graceTimer = setTimeout(() => finish(input.files?.[0] ?? null), 1500);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    win.addEventListener('focus', onFocus, { once: true });
    doc.body.append(input);
    input.click();
  });
}

export interface FilePhotoCaptureDeps {
  readonly pick?: (source: PhotoSource) => Promise<File | null>;
  readonly codec?: ImageCodec;
}

/** The production adapter. */
export function createFilePhotoCapture(
  source: PhotoSource,
  deps: FilePhotoCaptureDeps = {},
): PhotoCapture {
  const pick = deps.pick ?? ((s: PhotoSource) => pickPhotoFile(s));
  return {
    async capture() {
      let file: File | null;
      try {
        file = await pick(source);
      } catch {
        return null;
      }
      if (file === null) return null;
      return downscalePhoto(file, deps.codec ?? createBrowserImageCodec());
    },
  };
}
