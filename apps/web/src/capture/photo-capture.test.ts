// Ported from the earlier client: a camera that is denied or
// cancelled is the calm `null` path and never reaches the codec; a granted one returns bytes.
// Plus the downscale rules (<= 1024 x 1024, quality 80) the earlier adapter delegated to image_picker.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFilePhotoCapture, pickPhotoFile } from './photo-capture';
import {
  downscalePhoto,
  fitWithin,
  MAX_PHOTO_EDGE,
  PHOTO_JPEG_QUALITY,
  type DecodedImage,
  type ImageCodec,
} from './photo-downscale';

function fakeCodec(width = 4000, height = 3000) {
  const calls = { decode: 0, encode: [] as { w: number; h: number; q: number }[], closed: 0 };
  const codec: ImageCodec = {
    async decode() {
      calls.decode++;
      const image: DecodedImage = { width, height, close: () => void calls.closed++ };
      return image;
    },
    async encodeJpeg(_img, size, quality) {
      calls.encode.push({ w: size.width, h: size.height, q: quality });
      return Uint8Array.from([1, 2, 3]);
    },
  };
  return { codec, calls };
}

const file = (): File => new File([Uint8Array.from([9, 9, 9])], 'p.jpg', { type: 'image/jpeg' });

describe('fitWithin', () => {
  it('shrinks the long side to 1024 and keeps the aspect ratio', () => {
    expect(fitWithin({ width: 4000, height: 3000 })).toEqual({ width: 1024, height: 768 });
    expect(fitWithin({ width: 3000, height: 4000 })).toEqual({ width: 768, height: 1024 });
    expect(fitWithin({ width: 2048, height: 2048 })).toEqual({ width: 1024, height: 1024 });
  });

  it('never enlarges a photo that already fits', () => {
    expect(fitWithin({ width: 640, height: 480 })).toEqual({ width: 640, height: 480 });
    expect(fitWithin({ width: 1024, height: 1024 })).toEqual({ width: 1024, height: 1024 });
  });

  it('keeps every side at least one pixel, even for an extreme panorama', () => {
    expect(fitWithin({ width: 100000, height: 10 })).toEqual({ width: 1024, height: 1 });
    expect(fitWithin({ width: 0, height: 0 })).toEqual({ width: 1, height: 1 });
  });
});

describe('downscalePhoto', () => {
  it('encodes at <= 1024 x 1024 and quality 80, and releases the decoded image', async () => {
    const { codec, calls } = fakeCodec();
    const bytes = await downscalePhoto(file(), codec);
    expect(Array.from(bytes ?? [])).toEqual([1, 2, 3]);
    expect(calls.encode).toEqual([{ w: 1024, h: 768, q: 0.8 }]);
    expect(MAX_PHOTO_EDGE).toBe(1024);
    expect(PHOTO_JPEG_QUALITY).toBe(0.8);
    expect(calls.closed).toBe(1);
  });

  it('an undecodable file (unsupported format) is null, not an exception', async () => {
    const codec: ImageCodec = {
      decode: async () => null,
      encodeJpeg: async () => {
        throw new Error('unreachable');
      },
    };
    expect(await downscalePhoto(file(), codec)).toBeNull();
  });

  it('a throwing codec is null and still releases the image', async () => {
    const { calls, codec } = fakeCodec();
    const boom: ImageCodec = {
      decode: codec.decode,
      encodeJpeg: async () => {
        throw new Error('canvas lost');
      },
    };
    expect(await downscalePhoto(file(), boom)).toBeNull();
    expect(calls.closed).toBe(1);
  });
});

describe('createFilePhotoCapture (the camera permission is the picker itself on the web)', () => {
  it('cancelled or denied: calm null, the codec is never touched', async () => {
    const { codec, calls } = fakeCodec();
    const capture = createFilePhotoCapture('camera', { pick: async () => null, codec });
    expect(await capture.capture()).toBeNull();
    expect(calls.decode).toBe(0);
  });

  it('a picker that throws is the same calm null', async () => {
    const { codec } = fakeCodec();
    const capture = createFilePhotoCapture('camera', {
      pick: async () => {
        throw new Error('NotAllowedError');
      },
      codec,
    });
    expect(await capture.capture()).toBeNull();
  });

  it('granted: the picked file comes back downscaled; the source is passed to the picker', async () => {
    const { codec, calls } = fakeCodec(800, 600);
    const pick = vi.fn(async () => file());
    const capture = createFilePhotoCapture('files', { pick, codec });
    expect(Array.from((await capture.capture()) ?? [])).toEqual([1, 2, 3]);
    expect(pick).toHaveBeenCalledWith('files');
    expect(calls.encode).toEqual([{ w: 800, h: 600, q: 0.8 }]);
  });

  it('keeps nothing: a second capture decodes again, there is no "last photo"', async () => {
    const { codec, calls } = fakeCodec();
    const capture = createFilePhotoCapture('camera', { pick: async () => file(), codec });
    await capture.capture();
    await capture.capture();
    expect(calls.decode).toBe(2);
  });
});

describe('pickPhotoFile', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  /** `pickPhotoFile` appends its input to the body before clicking it. */
  const openedInput = (): HTMLInputElement => {
    const input = document.querySelector<HTMLInputElement>('input[type=file]');
    if (!input) throw new Error('no input was opened');
    return input;
  };

  it('camera opens an image input with capture=environment; change resolves the file', async () => {
    const p = pickPhotoFile('camera');
    const input = openedInput();
    expect(input.type).toBe('file');
    expect(input.accept).toBe('image/*');
    expect(input.getAttribute('capture')).toBe('environment');
    const f = file();
    Object.defineProperty(input, 'files', { value: [f] });
    input.dispatchEvent(new Event('change'));
    expect(await p).toBe(f);
    expect(document.querySelector('input[type=file]')).toBeNull();
  });

  it('files has no capture attribute', async () => {
    const p = pickPhotoFile('files');
    const input = openedInput();
    expect(input.hasAttribute('capture')).toBe(false);
    input.dispatchEvent(new Event('cancel'));
    expect(await p).toBeNull();
  });

  it('where no cancel event exists, regaining focus without a file counts as a cancel', async () => {
    vi.useFakeTimers();
    const p = pickPhotoFile('camera');
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(1600);
    expect(await p).toBeNull();
  });
});
