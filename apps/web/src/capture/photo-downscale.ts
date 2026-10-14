/**
 * Downscale a captured photo BEFORE anything else sees it: at most 1024 x 1024, JPEG quality 80
 * (the Dart `ImagePicker` call used `maxWidth: 1024, maxHeight: 1024, imageQuality: 80`). This
 * reduces what is uploaded; it is NOT relied on to drop metadata (a canvas re-encode may or may
 * not, and nothing documents it), so `sanitizePhotoForUpload` strips explicitly at the point of
 * upload.
 *
 * The decode / encode steps are an injectable `ImageCodec` so the sizing and quality rules are
 * unit-tested without a canvas; the browser codec is `createBrowserImageCodec`.
 */

export const MAX_PHOTO_EDGE = 1024;
export const PHOTO_JPEG_QUALITY = 0.8;

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * The size that fits `source` inside `max` x `max`, keeping the aspect ratio. A photo already
 * inside the box is never enlarged. Each side is at least 1 pixel.
 */
export function fitWithin(source: Size, max: number = MAX_PHOTO_EDGE): Size {
  const { width, height } = source;
  if (!(width > 0) || !(height > 0)) return { width: 1, height: 1 };
  const scale = Math.min(1, max / width, max / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** A decoded image the codec can draw. `close` releases it. */
export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  close(): void;
}

export interface ImageCodec {
  /** `null` when the browser cannot decode the file (an unsupported format). */
  decode(file: Blob): Promise<DecodedImage | null>;
  /** JPEG bytes of `image` drawn at `size`, or `null` when encoding failed. */
  encodeJpeg(image: DecodedImage, size: Size, quality: number): Promise<Uint8Array | null>;
}

/**
 * The bytes of `file` as a JPEG of at most {@link MAX_PHOTO_EDGE} px per side at quality 80, or
 * `null` when it cannot be decoded or encoded. Never throws.
 */
export async function downscalePhoto(file: Blob, codec: ImageCodec): Promise<Uint8Array | null> {
  let image: DecodedImage | null = null;
  try {
    image = await codec.decode(file);
    if (image === null) return null;
    const size = fitWithin(image, MAX_PHOTO_EDGE);
    return await codec.encodeJpeg(image, size, PHOTO_JPEG_QUALITY);
  } catch {
    return null;
  } finally {
    try {
      image?.close();
    } catch {
      // Releasing is best-effort.
    }
  }
}

/** The real codec: `createImageBitmap` (EXIF orientation applied) and a canvas. */
export function createBrowserImageCodec(): ImageCodec {
  return {
    async decode(file) {
      try {
        // 'from-image' bakes the EXIF rotation into the pixels, so the re-encoded JPEG is upright
        // even though its metadata is gone.
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        return null;
      }
    },
    async encodeJpeg(image, size, quality) {
      const bitmap = image as unknown as ImageBitmap;
      const canvas =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(size.width, size.height)
          : Object.assign(document.createElement('canvas'), {
              width: size.width,
              height: size.height,
            });
      const ctx = canvas.getContext('2d') as
        CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (ctx === null) return null;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob =
        canvas instanceof HTMLCanvasElement
          ? await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, 'image/jpeg', quality),
            )
          : await canvas.convertToBlob({ type: 'image/jpeg', quality });
      if (blob === null) return null;
      return new Uint8Array(await blob.arrayBuffer());
    },
  };
}
