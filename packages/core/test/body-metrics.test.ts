import { describe, expect, it } from 'vitest';
import {
  LOWER_BMI_CUTOFFS,
  WHO_BMI_RANGES,
  WHTR_RANGES,
  bodyMassIndex,
  measurementUid,
  rangeOf,
  waistToHeightRatio,
  whtrApplies,
} from '../src';

describe('body metrics', () => {
  it('computes BMI to one decimal and refuses what it cannot', () => {
    expect(bodyMassIndex(70, 170)).toBe(24.2);
    expect(bodyMassIndex(100, 165)).toBe(36.7);
    expect(bodyMassIndex(undefined, 170)).toBeNull();
    expect(bodyMassIndex(70, undefined)).toBeNull();
    expect(bodyMassIndex(0, 170)).toBeNull();
    expect(bodyMassIndex(70, 99)).toBeNull();
    expect(bodyMassIndex(Number.NaN, 170)).toBeNull();
  });

  it('computes the waist-to-height ratio to two decimals', () => {
    expect(waistToHeightRatio(85, 170)).toBe(0.5);
    expect(waistToHeightRatio(80, 175)).toBe(0.46);
    expect(waistToHeightRatio(undefined, 170)).toBeNull();
    expect(waistToHeightRatio(80, 400)).toBeNull();
  });

  it('keeps the published reference ranges as data, never as a label', () => {
    expect(WHO_BMI_RANGES.map((r) => [r.from, r.to])).toEqual([
      [null, 18.5],
      [18.5, 25],
      [25, 30],
      [30, null],
    ]);
    expect(rangeOf(WHO_BMI_RANGES, 24.9)?.id).toBe('healthy');
    expect(rangeOf(WHO_BMI_RANGES, 25)?.id).toBe('over');
    expect(WHTR_RANGES.map((r) => [r.from, r.to])).toEqual([
      [0.4, 0.5],
      [0.5, 0.6],
      [0.6, null],
    ]);
    expect(rangeOf(WHTR_RANGES, 0.35)).toBeNull();
    expect(LOWER_BMI_CUTOFFS).toEqual({ increasedRisk: 23, highRisk: 27.5 });
  });

  it('the waist-to-height ratio is only meaningful under BMI 35', () => {
    expect(whtrApplies(null)).toBe(true);
    expect(whtrApplies(34.9)).toBe(true);
    expect(whtrApplies(35)).toBe(false);
  });

  it('a measurement uid is stable', () => {
    expect(measurementUid('weight', '2026-11-15')).toBe(measurementUid('weight', '2026-11-15'));
  });
});
