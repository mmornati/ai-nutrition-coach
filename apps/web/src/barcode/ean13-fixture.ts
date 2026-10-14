/**
 * An EAN-13 renderer for tests and the e2e harness: encodes a code to its 95 bar modules and draws
 * it as a grayscale image (and a Y4M clip for Chromium's fake camera). Test-support only; nothing
 * in the shipped app imports it.
 */
const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const G = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
];
const R = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
];
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

/** The EAN-13 check digit of the first 12 digits. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** A valid 13-digit code from 12 digits (the check digit is appended). */
export function ean13(first12: string): string {
  if (!/^\d{12}$/.test(first12)) throw new Error('need 12 digits');
  return `${first12}${ean13CheckDigit(first12)}`;
}

/** The 95 modules ('1' = bar) of a valid 13-digit code. */
export function ean13Modules(code: string): string {
  if (!/^\d{13}$/.test(code) || Number(code[12]) !== ean13CheckDigit(code.slice(0, 12))) {
    throw new Error(`not a valid EAN-13: ${code}`);
  }
  const parity = PARITY[Number(code[0])] as string;
  let out = '101';
  for (let i = 0; i < 6; i++) {
    const digit = Number(code[i + 1]);
    out += (parity[i] === 'L' ? L : G)[digit];
  }
  out += '01010';
  for (let i = 7; i < 13; i++) out += R[Number(code[i])];
  return `${out}101`;
}

export interface RenderOptions {
  readonly width: number;
  readonly height: number;
  /** Pixels per module. */
  readonly moduleWidth: number;
  readonly black?: number;
  readonly white?: number;
}

/** A `width x height` luma plane: white background, the code centred, bars 60% of the height. */
export function renderEan13Luma(code: string, o: RenderOptions): Uint8Array {
  const black = o.black ?? 0;
  const white = o.white ?? 255;
  const modules = ean13Modules(code);
  const plane = new Uint8Array(o.width * o.height).fill(white);
  const codeWidth = modules.length * o.moduleWidth;
  const x0 = Math.floor((o.width - codeWidth) / 2);
  const barHeight = Math.floor(o.height * 0.6);
  const y0 = Math.floor((o.height - barHeight) / 2);
  for (let m = 0; m < modules.length; m++) {
    if (modules[m] !== '1') continue;
    for (let y = y0; y < y0 + barHeight; y++) {
      for (let dx = 0; dx < o.moduleWidth; dx++)
        plane[y * o.width + x0 + m * o.moduleWidth + dx] = black;
    }
  }
  return plane;
}

/** RGBA pixels for an `ImageData`. */
export function lumaToRgba(luma: Uint8Array): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(luma.length * 4);
  for (let i = 0; i < luma.length; i++) {
    const v = luma[i] as number;
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

/**
 * A Y4M (4:2:0) clip of `frames` identical frames showing the code, for Chromium's
 * `--use-file-for-fake-video-capture`. Limited-range luma (16..235) as camera video is.
 */
export function ean13Y4m(code: string, frames = 6, width = 640, height = 480): Uint8Array {
  const luma = renderEan13Luma(code, { width, height, moduleWidth: 4, black: 16, white: 235 });
  const chroma = new Uint8Array((width / 2) * (height / 2)).fill(128);
  const header = new TextEncoder().encode(
    `YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`,
  );
  const frameHeader = new TextEncoder().encode('FRAME\n');
  const frameSize = frameHeader.length + luma.length + chroma.length * 2;
  const out = new Uint8Array(header.length + frameSize * frames);
  out.set(header, 0);
  for (let f = 0; f < frames; f++) {
    let at = header.length + f * frameSize;
    out.set(frameHeader, at);
    at += frameHeader.length;
    out.set(luma, at);
    at += luma.length;
    out.set(chroma, at);
    at += chroma.length;
    out.set(chroma, at);
  }
  return out;
}
