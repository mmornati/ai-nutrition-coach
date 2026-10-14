// A tiny y4m video of one EAN-13 (white frame, black bars, 4 px modules) for Chromium's fake
// camera. Written at run time; nothing binary is committed.
import { writeFileSync } from 'node:fs';

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function writeBarcodeY4m(file, code, frames = 12) {
  const d = [...code].map(Number);
  let bits = '101';
  for (let i = 0; i < 6; i++) bits += (PARITY[d[0]][i] === 'L' ? L : G)[d[1 + i]];
  bits += '01010';
  for (let i = 0; i < 6; i++) bits += R[d[7 + i]];
  bits += '101';
  const W = 640;
  const H = 480;
  const MOD = 4;
  const left = Math.floor((W - bits.length * MOD) / 2);
  const y = Buffer.alloc(W * H, 235);
  for (let row = 130; row < 350; row++) {
    for (let m = 0; m < bits.length; m++) {
      if (bits[m] === '1') y.fill(16, row * W + left + m * MOD, row * W + left + (m + 1) * MOD);
    }
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128);
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < frames; f++) parts.push(Buffer.from('FRAME\n'), y, chroma, chroma);
  writeFileSync(file, Buffer.concat(parts));
}
