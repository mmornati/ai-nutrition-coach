/**
 * What leaves the device when a photo is sent to an AI endpoint (N1). Byte-level port of
 * `packages/integrations/lib/src/ai/photo_sanitizer.dart`.
 *
 * Two guarantees, enforced HERE, at the single egress point, not left to the browser:
 *
 *  1. the MIME type is the real one, read from the file's magic bytes;
 *  2. embedded metadata (EXIF with GPS position, device model and timestamps, XMP, IPTC,
 *     comments) is removed.
 *
 * A canvas re-encode is NOT trusted to drop metadata (some pipelines copy it back, and none
 * documents it as a guarantee), so the strip is explicit:
 *
 *  - JPEG: drop APP1 (EXIF/XMP), APP2 unless it is an ICC profile (MPF), APP3..APP13 (meta,
 *    IPTC) and COM segments, including those between progressive scans, and everything after
 *    EOI; pixel data is copied untouched.
 *  - PNG: drop `eXIf`, `tEXt`, `zTXt`, `iTXt`, `tIME` chunks.
 *  - WebP: drop the `EXIF` and `XMP ` chunks, clear their VP8X flags, fix the RIFF size.
 *  - HEIC / HEIF: the metadata lives inside the container's `meta` box with absolute offsets;
 *    stripping it safely needs a real ISO BMFF writer. Fail CLOSED: refuse to send it.
 *  - anything else, or a malformed file: refuse.
 *
 * Pure TypeScript (no DOM). A refusal is a typed result, never an exception.
 */

export type PhotoFormat = 'jpeg' | 'png' | 'webp' | 'heic';

export const PHOTO_MIME: Readonly<Record<PhotoFormat, string>> = Object.freeze({
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
});

const HEIC_BRANDS: ReadonlySet<string> = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);

const asciiAt = (b: Uint8Array, offset: number, s: string): boolean => {
  if (offset + s.length > b.length) return false;
  for (let i = 0; i < s.length; i++) {
    if (b[offset + i] !== s.charCodeAt(i)) return false;
  }
  return true;
};

const asciiString = (b: Uint8Array, start: number, end: number): string => {
  let out = '';
  for (let i = start; i < end; i++) out += String.fromCharCode(b[i] as number);
  return out;
};

/** The format of `bytes` by magic number, or `null` when unrecognised. */
export function detectPhotoFormat(bytes: Uint8Array): PhotoFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (bytes.length >= 12 && asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP')) {
    return 'webp';
  }
  if (bytes.length >= 12 && asciiAt(bytes, 4, 'ftyp')) {
    if (HEIC_BRANDS.has(asciiString(bytes, 8, 12))) return 'heic';
  }
  return null;
}

export type UnsendablePhotoReason =
  /** Not a JPEG / PNG / WebP / HEIC at all. */
  | 'unrecognisedFormat'
  /** A format whose metadata cannot be removed safely here (HEIC). */
  | 'metadataNotRemovable'
  /** Truncated or structurally invalid. */
  | 'malformed';

/** Outcome of {@link sanitizePhotoForUpload}. */
export type PhotoSanitizeResult =
  /** Safe to upload: `bytes` carry no metadata, `mime` is the true type. */
  | { readonly kind: 'sanitized'; readonly bytes: Uint8Array; readonly mime: string }
  /** Refused: the photo is NOT sent. The rung maps this to a calm failure. */
  | { readonly kind: 'unsendable'; readonly reason: UnsendablePhotoReason };

/** Strip metadata from `bytes` and report the real MIME type. */
export function sanitizePhotoForUpload(bytes: Uint8Array): PhotoSanitizeResult {
  const format = detectPhotoFormat(bytes);
  if (format === null) return { kind: 'unsendable', reason: 'unrecognisedFormat' };
  let stripped: Uint8Array | null;
  switch (format) {
    case 'jpeg':
      stripped = stripJpegMetadata(bytes);
      break;
    case 'png':
      stripped = stripPngMetadata(bytes);
      break;
    case 'webp':
      stripped = stripWebpMetadata(bytes);
      break;
    case 'heic':
      stripped = null;
      break;
  }
  if (stripped !== null) return { kind: 'sanitized', bytes: stripped, mime: PHOTO_MIME[format] };
  return {
    kind: 'unsendable',
    reason: format === 'heic' ? 'metadataNotRemovable' : 'malformed',
  };
}

/** Growable byte sink (the Dart `BytesBuilder`). */
class ByteSink {
  private readonly parts: Uint8Array[] = [];
  private size = 0;
  add(bytes: ArrayLike<number>): void {
    const part = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
    this.parts.push(part);
    this.size += part.length;
  }
  get length(): number {
    return this.size;
  }
  take(): Uint8Array {
    const out = new Uint8Array(this.size);
    let offset = 0;
    for (const p of this.parts) {
      out.set(p, offset);
      offset += p.length;
    }
    return out;
  }
}

const ICC_TAG: readonly number[] = [
  0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00,
]; // "ICC_PROFILE\0"

/**
 * Whether the APPn/COM segment with `marker`, whose payload starts at `payloadStart` (length
 * `payloadLen`), is dropped. Dropped: APP1 (EXIF, XMP), APP3..APP13 (meta, IPTC), COM, and APP2
 * unless it is a real ICC profile (APP2 also carries MPF, the multi-picture index that points at
 * embedded secondary images). Kept: APP0 (JFIF), APP14 (Adobe colour transform), APP15 and every
 * structural segment.
 */
function dropJpegSegment(
  b: Uint8Array,
  marker: number,
  payloadStart: number,
  payloadLen: number,
): boolean {
  if (marker === 0xe1 || (marker >= 0xe3 && marker <= 0xed) || marker === 0xfe) return true;
  if (marker === 0xe2) {
    if (payloadLen < ICC_TAG.length) return true;
    for (let k = 0; k < ICC_TAG.length; k++) {
      if (b[payloadStart + k] !== ICC_TAG[k]) return true;
    }
  }
  return false;
}

/**
 * Returns `bytes` without metadata, or `null` if malformed.
 *
 * Walks the WHOLE file structurally: after each start-of-scan it steps through the entropy-coded
 * data (skipping `FF00` stuffing, `RSTn` and fill bytes) to the next real marker and re-enters the
 * segment loop, so segments between the scans of a progressive JPEG are filtered too. It stops at
 * the first EOI and DROPS EVERYTHING AFTER IT: trailers (Samsung, motion-photo MP4, MPF
 * secondary images, a second copy of the EXIF) are not part of the image. Every index is
 * bounds-checked and every iteration advances.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  const n = bytes.length;
  if (n < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const out = new ByteSink();
  out.add([0xff, 0xd8]);
  let i = 2;
  for (;;) {
    if (i >= n || bytes[i] !== 0xff) return null;
    // Any number of 0xFF fill bytes may precede the marker code.
    while (i < n && bytes[i] === 0xff) i++;
    if (i >= n) return null;
    const marker = bytes[i] as number;
    const markerStart = i - 1;
    i++;
    if (marker === 0x00) return null; // stuffing outside a scan
    if (marker === 0xd9) {
      out.add([0xff, 0xd9]);
      return out.take(); // trailer after EOI is dropped
    }
    // Standalone markers (TEM, RSTn, a stray SOI) carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      out.add(bytes.subarray(markerStart, i));
      continue;
    }
    if (i + 2 > n) return null;
    const length = ((bytes[i] as number) << 8) | (bytes[i + 1] as number);
    if (length < 2 || i + length > n) return null;
    if (marker === 0xda) {
      // SOS header, then the entropy-coded data up to the next marker.
      let j = i + length;
      for (;;) {
        if (j + 1 >= n) return null; // truncated inside the scan
        if (bytes[j] !== 0xff) {
          j++;
          continue;
        }
        const next = bytes[j + 1] as number;
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          j += 2; // stuffed byte / restart marker: still scan data
        } else if (next === 0xff) {
          j++; // fill byte
        } else {
          break; // a real marker starts at j
        }
      }
      out.add(bytes.subarray(markerStart, j));
      i = j;
      continue;
    }
    if (!dropJpegSegment(bytes, marker, i + 2, length - 2)) {
      out.add(bytes.subarray(markerStart, i + length));
    }
    i += length;
  }
}

const PNG_METADATA_CHUNKS: ReadonlySet<string> = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

/** Returns `bytes` without metadata chunks, or `null` if malformed. */
export function stripPngMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 8 + 12) return null;
  const out = new ByteSink();
  out.add(bytes.subarray(0, 8));
  let i = 8;
  let sawEnd = false;
  while (i + 12 <= bytes.length) {
    // `>>> 0`: a chunk length is unsigned; without it a length >= 2^31 would go negative.
    const length =
      (((bytes[i] as number) << 24) |
        ((bytes[i + 1] as number) << 16) |
        ((bytes[i + 2] as number) << 8) |
        (bytes[i + 3] as number)) >>>
      0;
    const end = i + 12 + length;
    if (end > bytes.length) return null;
    const type = asciiString(bytes, i + 4, i + 8);
    if (!PNG_METADATA_CHUNKS.has(type)) out.add(bytes.subarray(i, end));
    i = end;
    if (type === 'IEND') {
      sawEnd = true;
      break;
    }
  }
  return sawEnd ? out.take() : null;
}

const le32 = (b: Uint8Array, at: number): number =>
  ((b[at] as number) |
    ((b[at + 1] as number) << 8) |
    ((b[at + 2] as number) << 16) |
    ((b[at + 3] as number) << 24)) >>>
  0;

/** Returns `bytes` without EXIF / XMP chunks, or `null` if malformed. */
export function stripWebpMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 12) return null;
  const riffSize = le32(bytes, 4);
  if (riffSize + 8 > bytes.length) return null;
  const limit = riffSize + 8;
  const body = new ByteSink();
  let i = 12;
  while (i + 8 <= limit) {
    const type = asciiString(bytes, i, i + 4);
    const size = le32(bytes, i + 4);
    const padded = size + (size & 1);
    const end = i + 8 + padded;
    if (end > limit) return null;
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = Uint8Array.from(bytes.subarray(i, end));
      if (type === 'VP8X' && size >= 10) {
        chunk[8] = (chunk[8] as number) & ~0x0c; // clear the XMP (0x04) and EXIF (0x08) flags
      }
      body.add(chunk);
    }
    i = end;
  }
  const payload = body.take();
  const total = 4 + payload.length; // "WEBP" + chunks
  const out = new ByteSink();
  out.add([0x52, 0x49, 0x46, 0x46]); // RIFF
  out.add([total & 0xff, (total >>> 8) & 0xff, (total >>> 16) & 0xff, (total >>> 24) & 0xff]);
  out.add([0x57, 0x45, 0x42, 0x50]); // WEBP
  out.add(payload);
  return out.take();
}
