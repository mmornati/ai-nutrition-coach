import { describe, expect, it } from 'vitest';
import {
  cmToFeetInches,
  feetInchesToCm,
  kgToLb,
  lbToKg,
  MAX_INCHES_PART,
  parseTypedNumber,
  splitFeetAndInches,
  waistForDisplay,
  weightForDisplay,
} from './body-input';

describe('typed numbers', () => {
  it('accepts a decimal point or a decimal comma, and nothing else', () => {
    expect(parseTypedNumber('70.5')).toBe(70.5);
    expect(parseTypedNumber('70,5')).toBe(70.5);
    expect(parseTypedNumber(' 70 ')).toBe(70);
    for (const bad of ['', 'abc', '7o', '70,5,1', '-5', '1e3', '70 kg', '7 0,5x', ',5']) {
      expect(parseTypedNumber(bad), bad).toBeNull();
    }
  });
});

describe('units', () => {
  it('converts weights both ways: kg to two decimals, lb to one, so a typed lb comes back', () => {
    expect(kgToLb(70)).toBe(154.3);
    expect(lbToKg(154.3)).toBe(69.99);
    expect(lbToKg(150)).toBe(68.04);
    expect(kgToLb(lbToKg(150))).toBe(150);
    for (let tenths = 441; tenths <= 8820; tenths += 1) {
      const lb = tenths / 10;
      expect(kgToLb(lbToKg(lb)), String(lb)).toBe(lb);
    }
    expect(weightForDisplay(70, 'metric')).toBe(70);
    expect(weightForDisplay(70, 'imperial')).toBe(154.3);
  });

  it('splits a height typed whole into the feet field', () => {
    for (const text of [
      '5\'11"',
      "5' 11",
      '5 ft 11',
      '5ft11in',
      '5′11″',
      ' 5 ft 11 in ',
      '5\'11.5"',
    ]) {
      expect(splitFeetAndInches(text), text).not.toBeNull();
    }
    expect(splitFeetAndInches('5\'11"')).toEqual({ feet: '5', inches: '11' });
    expect(splitFeetAndInches('5 ft 11')).toEqual({ feet: '5', inches: '11' });
    expect(splitFeetAndInches("5'")).toEqual({ feet: '5', inches: '' });
    expect(splitFeetAndInches('5\'11,5"')).toEqual({ feet: '5', inches: '11,5' });
    for (const bad of ['5', '5.5', 'abc', '', "5'x", '170 cm']) {
      expect(splitFeetAndInches(bad), bad).toBeNull();
    }
    expect(MAX_INCHES_PART).toBe(11.9);
  });

  it('converts heights between cm and feet and inches', () => {
    expect(cmToFeetInches(170)).toEqual({ feet: 5, inches: 6.9 });
    expect(cmToFeetInches(182.9)).toEqual({ feet: 6, inches: 0 });
    expect(feetInchesToCm(5, 7)).toBe(170.2);
    expect(waistForDisplay(81.3, 'imperial')).toBe(32);
  });
});
