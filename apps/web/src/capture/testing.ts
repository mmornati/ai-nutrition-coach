/** Byte fixtures for the capture tests (ported from the earlier test support). Test-only. */

export const codes = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

/**
 * A minimal JPEG: SOI, JFIF, an APP1 "Exif" segment carrying a GPS-looking payload, a COM, a DQT,
 * SOS, entropy data, EOI.
 */
export function jpegWithExif(): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    // APP0 JFIF
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    // APP1 Exif: length 0x0014 (20 bytes incl. length) -> 18 payload bytes
    0xff,
    0xe1,
    0x00,
    0x14,
    ...codes('Exif\u0000\u0000GPS:48.8584N').slice(0, 18),
    // COM
    0xff,
    0xfe,
    0x00,
    0x06,
    0x68,
    0x69,
    0x21,
    0x21,
    // DQT
    0xff,
    0xdb,
    0x00,
    0x04,
    0x00,
    0x01,
    // SOS + data + EOI
    0xff,
    0xda,
    0x00,
    0x04,
    0x00,
    0x00,
    0x12,
    0x34,
    0xff,
    0x00,
    0x56,
    0xff,
    0xd9,
  ]);
}

export function png(withMetadata = true): Uint8Array {
  const chunk = (type: string, data: number[]): number[] => [
    (data.length >>> 24) & 0xff,
    (data.length >>> 16) & 0xff,
    (data.length >>> 8) & 0xff,
    data.length & 0xff,
    ...codes(type),
    ...data,
    0,
    0,
    0,
    0, // CRC (not validated by the stripper)
  ];
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', new Array<number>(13).fill(1)),
    ...(withMetadata ? chunk('eXIf', codes('GPS-SECRET')) : []),
    ...(withMetadata ? chunk('tEXt', codes('Comment\u0000secret')) : []),
    ...chunk('IDAT', [1, 2, 3, 4]),
    ...chunk('IEND', []),
  ]);
}

export function webp(withExif = true): Uint8Array {
  const le = (n: number): number[] => [
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 24) & 0xff,
  ];
  const chunk = (type: string, data: number[]): number[] => [
    ...codes(type),
    ...le(data.length),
    ...data,
    ...(data.length % 2 === 1 ? [0] : []),
  ];
  const vp8x = chunk('VP8X', [withExif ? 0x08 : 0x00, 0, 0, 0, 1, 0, 0, 1, 0, 0]);
  const body = [
    ...codes('WEBP'),
    ...vp8x,
    ...chunk('VP8 ', [9, 9, 9, 9]),
    ...(withExif ? chunk('EXIF', codes('GPS-SECRET')) : []),
  ];
  return Uint8Array.from([...codes('RIFF'), ...le(body.length), ...body]);
}

export function heic(): Uint8Array {
  return Uint8Array.from([0, 0, 0, 0x18, ...codes('ftypheic'), 0, 0, 0, 0, 1, 2, 3, 4]);
}

export function contains(hay: Uint8Array, needle: readonly number[]): boolean {
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}
