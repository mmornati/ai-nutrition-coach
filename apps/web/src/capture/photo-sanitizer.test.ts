// N1: what leaves the device: real MIME type, metadata removed, refuse when that cannot be
// guaranteed. Ported one-to-one from packages/integrations/test/photo_sanitizer_test.dart.
import { describe, expect, it } from 'vitest';
import { detectPhotoFormat, sanitizePhotoForUpload, PHOTO_MIME } from './photo-sanitizer';
import { codes, contains, heic, jpegWithExif, png, webp } from './testing';

function sanitized(bytes: Uint8Array) {
  const r = sanitizePhotoForUpload(bytes);
  if (r.kind !== 'sanitized') throw new Error(`expected sanitized, got ${r.reason}`);
  return r;
}

describe('detectPhotoFormat', () => {
  it('JPEG / PNG / WebP / HEIC by magic bytes', () => {
    expect(detectPhotoFormat(jpegWithExif())).toBe('jpeg');
    expect(detectPhotoFormat(png())).toBe('png');
    expect(detectPhotoFormat(webp())).toBe('webp');
    const heicWithMif1 = Uint8Array.from([
      0,
      0,
      0,
      0x18,
      ...codes('ftypheic'),
      0,
      0,
      0,
      0,
      ...codes('mif1heic'),
    ]);
    expect(detectPhotoFormat(heicWithMif1)).toBe('heic');
    expect(PHOTO_MIME.heic).toBe('image/heic');
  });

  it('unknown / empty / too short -> null', () => {
    expect(detectPhotoFormat(new Uint8Array(0))).toBeNull();
    expect(detectPhotoFormat(Uint8Array.from([1, 2, 3, 4]))).toBeNull();
    expect(detectPhotoFormat(Uint8Array.from([0xff, 0xd8]))).toBeNull();
    // ftyp with a non-image brand (an MP4)
    const mp4 = Uint8Array.from([0, 0, 0, 0x18, ...codes('ftypisom'), 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectPhotoFormat(mp4)).toBeNull();
  });
});

describe('sanitizePhotoForUpload', () => {
  it('JPEG: EXIF/GPS, XMP-class and COM segments are gone; pixels and JFIF stay; MIME is image/jpeg', () => {
    const input = jpegWithExif();
    expect(contains(input, codes('GPS'))).toBe(true); // fixture

    const out = sanitized(input);
    expect(out.mime).toBe('image/jpeg');
    expect(contains(out.bytes, codes('GPS'))).toBe(false);
    expect(contains(out.bytes, codes('Exif'))).toBe(false);
    expect(contains(out.bytes, [0xff, 0xe1])).toBe(false); // no APP1
    expect(contains(out.bytes, [0xff, 0xfe])).toBe(false); // no COM
    expect(contains(out.bytes, codes('JFIF'))).toBe(true);
    expect(contains(out.bytes, [0xff, 0xdb])).toBe(true); // DQT kept
    expect(contains(out.bytes, [0x12, 0x34, 0xff, 0x00, 0x56])).toBe(true);
    expect(out.bytes[0]).toBe(0xff);
    expect(out.bytes[1]).toBe(0xd8);
    expect(out.bytes.at(-1)).toBe(0xd9);
    expect(out.bytes.length).toBeLessThan(input.length);
  });

  it('JPEG without metadata passes through byte-for-byte equal', () => {
    const once = sanitized(jpegWithExif()).bytes;
    const twice = sanitized(once).bytes;
    expect(Array.from(twice)).toEqual(Array.from(once));
  });

  it('JPEG that is truncated or has a bad segment length is REFUSED', () => {
    const input = jpegWithExif();
    const truncated = input.subarray(0, 30);
    expect(sanitizePhotoForUpload(truncated)).toEqual({ kind: 'unsendable', reason: 'malformed' });
    const badLen = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3]);
    expect(sanitizePhotoForUpload(badLen).kind).toBe('unsendable');
  });

  it('JPEG: everything AFTER EOI is dropped (EXIF trailer, MPF image, motion-photo MP4)', () => {
    const trailer = [
      0xff,
      0xd8,
      0xff,
      0xe1,
      0x00,
      0x0a,
      ...codes('Exif\u0000\u0000TR'),
      ...codes('GPS-TRAILER'),
      0,
      0,
      0,
      0x18,
      ...codes('ftypmp42'),
    ];
    const input = Uint8Array.from([...jpegWithExif(), ...trailer]);
    expect(contains(input, codes('GPS-TRAILER'))).toBe(true); // fixture
    const out = sanitized(input).bytes;
    expect(out.at(-1)).toBe(0xd9);
    expect(contains(out, codes('GPS-TRAILER'))).toBe(false);
    expect(contains(out, codes('ftyp'))).toBe(false);
    // identical to the file without the trailer
    expect(Array.from(out)).toEqual(Array.from(sanitized(jpegWithExif()).bytes));
  });

  it('JPEG: APP2 is kept only for ICC_PROFILE; MPF is dropped', () => {
    const app2 = (payload: number[]): number[] => [
      0xff,
      0xe2,
      (payload.length + 2) >> 8,
      (payload.length + 2) & 0xff,
      ...payload,
    ];
    const icc = [...codes('ICC_PROFILE'), 0, 1, 1, 9, 9];
    const mpf = [...codes('MPF'), 0, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];
    const file = (seg: number[]): Uint8Array =>
      Uint8Array.from([0xff, 0xd8, ...seg, 0xff, 0xda, 0, 4, 0, 0, 1, 2, 0xff, 0xd9]);
    expect(contains(sanitized(file(app2(icc))).bytes, codes('ICC_PROFILE'))).toBe(true);
    expect(contains(sanitized(file(app2(mpf))).bytes, codes('MPF'))).toBe(false);
    // A short APP2 (shorter than the ICC tag) is dropped, not read out of bounds.
    expect(contains(sanitized(file(app2([1, 2]))).bytes, [0xff, 0xe2])).toBe(false);
  });

  it('JPEG: progressive file: APP1/COM between scans are filtered, scan data (FF00, RSTn, fill FFs) is preserved', () => {
    const input = Uint8Array.from([
      0xff,
      0xd8,
      0xff,
      0xc2,
      0,
      4,
      0,
      0, // SOF2 (progressive)
      0xff,
      0xda,
      0,
      4,
      0,
      0, // scan 1
      0x11,
      0xff,
      0x00,
      0x22,
      0xff,
      0xd0,
      0x33,
      0xff,
      0xff, // data, fill
      0xff,
      0xe1,
      0,
      12,
      ...codes('Exif\u0000\u0000GPS-'), // between scans
      0xff,
      0xfe,
      0,
      4,
      0x68,
      0x69, // COM between scans
      0xff,
      0xda,
      0,
      4,
      0,
      0, // scan 2
      0x44,
      0x55,
      0xff,
      0xd9,
      ...codes('GPS-AFTER'),
    ]);
    const out = sanitized(input).bytes;
    expect(contains(out, codes('GPS'))).toBe(false);
    expect(contains(out, [0xff, 0xe1])).toBe(false);
    expect(contains(out, [0xff, 0xfe])).toBe(false);
    expect(contains(out, [0x11, 0xff, 0x00, 0x22, 0xff, 0xd0, 0x33])).toBe(true);
    expect(contains(out, [0x44, 0x55, 0xff, 0xd9])).toBe(true);
    expect(out.at(-1)).toBe(0xd9);
  });

  it('JPEG: malformed structures return a refusal, never loop or read out of bounds', () => {
    const bad: number[][] = [
      [0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01], // length < 2
      [0xff, 0xd8, 0xff, 0xe1, 0xff], // length cut off
      [0xff, 0xd8, 0xff, 0xda, 0, 4, 0, 0, 1, 2, 3], // no marker after scan
      [0xff, 0xd8, 0xff, 0xda, 0, 4, 0, 0, 0xff], // ends on FF
      [0xff, 0xd8, 0x12, 0x34, 0x56, 0x78], // not a marker
      [0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9], // stuffing outside scan
      [0xff, 0xd8, 0xff, 0xff, 0xff, 0xff], // only fill bytes
      [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x20, 1, 2], // length past the end
    ];
    for (const b of bad) {
      expect(sanitizePhotoForUpload(Uint8Array.from(b)).kind, JSON.stringify(b)).toBe('unsendable');
    }
  });

  it('PNG: eXIf / tEXt chunks removed, image chunks kept, MIME png', () => {
    const out = sanitized(png());
    expect(out.mime).toBe('image/png');
    expect(contains(out.bytes, codes('eXIf'))).toBe(false);
    expect(contains(out.bytes, codes('GPS-SECRET'))).toBe(false);
    expect(contains(out.bytes, codes('tEXt'))).toBe(false);
    expect(contains(out.bytes, codes('IHDR'))).toBe(true);
    expect(contains(out.bytes, codes('IDAT'))).toBe(true);
    expect(contains(out.bytes, codes('IEND'))).toBe(true);
  });

  it('PNG: zTXt / iTXt / tIME are removed too', () => {
    const chunk = (type: string, data: number[]): number[] => [
      0,
      0,
      0,
      data.length,
      ...codes(type),
      ...data,
      0,
      0,
      0,
      0,
    ];
    const input = Uint8Array.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...chunk('IHDR', new Array<number>(13).fill(1)),
      ...chunk('zTXt', codes('zz')),
      ...chunk('iTXt', codes('ii')),
      ...chunk('tIME', codes('tt')),
      ...chunk('IDAT', [1]),
      ...chunk('IEND', []),
    ]);
    const out = sanitized(input).bytes;
    for (const t of ['zTXt', 'iTXt', 'tIME']) expect(contains(out, codes(t))).toBe(false);
    expect(contains(out, codes('IDAT'))).toBe(true);
  });

  it('PNG without IEND is refused', () => {
    const p = png(false);
    const cut = p.subarray(0, p.length - 12);
    expect(sanitizePhotoForUpload(cut).kind).toBe('unsendable');
  });

  it('PNG with a chunk length past the end (or >= 2^31) is refused', () => {
    const p = Uint8Array.from(png(false));
    p[8] = 0xff; // IHDR length = 0xFF000D: far past the end
    expect(sanitizePhotoForUpload(p).kind).toBe('unsendable');
  });

  it('WebP: EXIF chunk and the VP8X EXIF flag removed; RIFF size fixed', () => {
    const out = sanitized(webp());
    expect(out.mime).toBe('image/webp');
    expect(contains(out.bytes, codes('EXIF'))).toBe(false);
    expect(contains(out.bytes, codes('GPS-SECRET'))).toBe(false);
    expect(contains(out.bytes, codes('VP8 '))).toBe(true);
    const b = out.bytes;
    const riff = (b[4]! | (b[5]! << 8) | (b[6]! << 16) | (b[7]! << 24)) >>> 0;
    expect(riff + 8).toBe(b.length);
    // VP8X flags byte: chunk header (8) after "RIFF....WEBP" (12).
    expect(b[12 + 8]! & 0x0c).toBe(0);
  });

  it('WebP: a chunk running past the RIFF size is refused', () => {
    const w = Uint8Array.from(webp());
    w[16] = 0xff; // VP8X chunk size -> huge
    expect(sanitizePhotoForUpload(w).kind).toBe('unsendable');
  });

  it('HEIC is refused (metadata cannot be removed safely)', () => {
    expect(sanitizePhotoForUpload(heic())).toEqual({
      kind: 'unsendable',
      reason: 'metadataNotRemovable',
    });
  });

  it('unrecognised bytes are refused, never sent labelled as JPEG', () => {
    expect(sanitizePhotoForUpload(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toEqual({
      kind: 'unsendable',
      reason: 'unrecognisedFormat',
    });
  });
});
