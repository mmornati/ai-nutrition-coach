import { describe, expect, it } from 'vitest';
import { ean13, ean13CheckDigit, ean13Modules, ean13Y4m, renderEan13Luma } from './ean13-fixture';

describe('EAN-13 fixture', () => {
  it('check digits match known codes', () => {
    expect(ean13CheckDigit('301762042200')).toBe(3); // Nutella 3017620422003
    expect(ean13('400638133393')).toBe('4006381333931');
  });

  it('95 modules, guard patterns at the ends and the middle', () => {
    const m = ean13Modules('3017620422003');
    expect(m).toHaveLength(95);
    expect(m.startsWith('101')).toBe(true);
    expect(m.endsWith('101')).toBe(true);
    expect(m.slice(45, 50)).toBe('01010');
  });

  it('rejects a wrong check digit', () => {
    expect(() => ean13Modules('3017620422004')).toThrow();
  });

  it('renders black bars on white and a well-formed Y4M', () => {
    const luma = renderEan13Luma('3017620422003', { width: 640, height: 480, moduleWidth: 4 });
    expect(luma.length).toBe(640 * 480);
    expect(new Set(luma)).toEqual(new Set([0, 255]));
    const y4m = ean13Y4m('3017620422003', 2);
    const text = new TextDecoder().decode(y4m.subarray(0, 60));
    expect(text.startsWith('YUV4MPEG2 W640 H480 F30:1')).toBe(true);
    const header = text.indexOf('\n') + 1;
    expect(y4m.length).toBe(header + 2 * (6 + 640 * 480 + 2 * 320 * 240));
  });
});
