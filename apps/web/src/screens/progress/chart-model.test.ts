import { describe, expect, it } from 'vitest';
import { weightTrend } from '@anc/core';
import {
  GAP_DAYS,
  longestGap,
  minSpanFor,
  niceStep,
  pointsInRange,
  weekTicks,
  xDomain,
  yAxisFor,
} from './chart-model';

const pts = (days: readonly string[], f: (i: number) => number) =>
  weightTrend(days.map((day, i) => ({ day, value: f(i) })));

describe('yAxisFor', () => {
  it('never zooms in on a small change: at least 4 kg of span for an 80 kg body', () => {
    const values = [81.2, 80.9, 80.9];
    const axis = yAxisFor(values, minSpanFor(values, 1));
    expect(axis.max - axis.min).toBeGreaterThanOrEqual(4);
    expect(axis.min).toBeLessThanOrEqual(80.9);
    expect(axis.max).toBeGreaterThanOrEqual(81.2);
  });

  it('uses 5 % of the body weight when that is more than 4 kg', () => {
    const values = [118, 119];
    expect(minSpanFor(values, 1)).toBeCloseTo(5.925, 6);
    const axis = yAxisFor(values, minSpanFor(values, 1));
    expect(axis.max - axis.min).toBeGreaterThanOrEqual(5.9);
  });

  it('keeps every value inside the axis and gives whole-step ticks', () => {
    const values = [70, 75.5, 82];
    const axis = yAxisFor(values, minSpanFor(values, 1));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(axis.min);
      expect(v).toBeLessThanOrEqual(axis.max);
    }
    expect(axis.ticks[0]).toBe(axis.min);
    expect(axis.ticks.at(-1)).toBe(axis.max);
    expect(axis.ticks.length).toBeGreaterThanOrEqual(3);
  });

  it('works for a single value and in pounds', () => {
    const axis = yAxisFor([180], minSpanFor([180], 2.2046));
    expect(axis.max - axis.min).toBeGreaterThanOrEqual(8.8);
  });

  it('niceStep picks 1, 2, 5 times a power of ten', () => {
    expect(niceStep(4, 4)).toBe(1);
    expect(niceStep(8, 4)).toBe(2);
    expect(niceStep(18, 4)).toBe(5);
    expect(niceStep(0.8, 4)).toBe(0.2);
  });
});

describe('ranges and ticks', () => {
  const days = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-10'];
  const series = pts(days, () => 80);
  const today = series[3]?.dayNumber ?? 0;

  it('filters the series to the range ending today', () => {
    expect(pointsInRange(series, 'fourWeeks', today)).toHaveLength(1);
    expect(pointsInRange(series, 'threeMonths', today)).toHaveLength(3);
    expect(pointsInRange(series, 'all', today)).toHaveLength(4);
  });

  it('draws the horizontal axis from the start of the range to today, at least a week wide', () => {
    expect(xDomain(series, 'fourWeeks', today)).toEqual({ from: today - 28, to: today });
    expect(xDomain(series, 'all', today)).toEqual({ from: series[0]?.dayNumber, to: today });
    const one = pts(['2026-04-10'], () => 80);
    const d = xDomain(one, 'all', one[0]?.dayNumber ?? 0);
    expect(d.to - d.from).toBe(7);
  });

  it('ticks by week, counted back from the last day, and thins them on a long range', () => {
    expect(weekTicks(today - 28, today)).toEqual([0, 1, 2, 3, 4].map((i) => today - 28 + 7 * i));
    expect(weekTicks(today - 365, today).length).toBeLessThanOrEqual(6);
  });

  it('finds the longest gap', () => {
    expect(longestGap(series)).toBe(40);
    expect(GAP_DAYS).toBe(14);
    expect(longestGap([])).toBe(0);
  });
});
