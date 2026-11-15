// The geometry of the weight chart, pure and tested. The axis never exaggerates: its span is at
// least 4 kg or 5 % of the body weight (whichever is larger), so a 300 g change reads as small.
import type { TrendPoint } from '@anc/core';

export type RangeKey = 'fourWeeks' | 'threeMonths' | 'oneYear' | 'all';
export const RANGE_KEYS: readonly RangeKey[] = ['fourWeeks', 'threeMonths', 'oneYear', 'all'];

/** The days each range reaches back from today; `null` is everything. */
export const RANGE_DAYS: Readonly<Record<RangeKey, number | null>> = {
  fourWeeks: 28,
  threeMonths: 91,
  oneYear: 365,
  all: null,
};

/**
 * The drawing's own size, in the units of its viewBox. The viewBox is as wide as a 336 px phone
 * (the narrowest layout the app is held to), so a label of `FONT_PX` is drawn at that size there
 * and larger on wider screens, never smaller.
 */
export const CHART = Object.freeze({
  width: 336,
  height: 204,
  left: 40,
  right: 12,
  top: 12,
  bottom: 34,
  /** The smallest rendered text, in px, at 336 px wide (the accessibility floor). */
  fontPx: 12,
  /** At most this many week ticks, so two labels never meet. */
  maxTicks: 5,
});

/** A range longer than this many days is drawn with one dot a week. */
export const LONG_RANGE_DAYS = 180;

/** The rows of the accessible table before "show all". */
export const TABLE_ROWS = 60;

/**
 * One point a week for a long range: the most recent of each seven days counted back from the last
 * point, so the latest weigh-in is always drawn and a five-year history is a few hundred nodes.
 */
export function thinWeekly(points: readonly TrendPoint[]): readonly TrendPoint[] {
  const last = points[points.length - 1];
  if (last === undefined) return points;
  const kept = new Map<number, TrendPoint>();
  for (const p of points) {
    // Later points come after earlier ones, so the most recent of a bucket wins.
    kept.set(Math.floor((last.dayNumber - p.dayNumber) / 7), p);
  }
  return [...kept.values()].sort((a, b) => a.dayNumber - b.dayNumber);
}

/** The smallest vertical span, in kg: 4 kg, or 5 % of the body weight when that is larger. */
export const MIN_SPAN_KG = 4;
export const MIN_SPAN_SHARE = 0.05;

/** The points of the series inside the range ending on `todayNumber` (a calendar day number). */
export function pointsInRange(
  series: readonly TrendPoint[],
  range: RangeKey,
  todayNumber: number,
): readonly TrendPoint[] {
  const days = RANGE_DAYS[range];
  if (days === null) return series;
  return series.filter((p) => p.dayNumber >= todayNumber - days);
}

/** A "nice" step (1, 2, 5 times a power of ten) giving roughly `count` intervals over `span`. */
export function niceStep(span: number, count: number): number {
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normal = raw / magnitude;
  const nice = normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10;
  return nice * magnitude;
}

export interface YAxis {
  readonly min: number;
  readonly max: number;
  readonly ticks: readonly number[];
}

/**
 * The vertical axis for `values` (in the units drawn) given the smallest span allowed in those
 * units: the data is centred, the span is never below `minSpan`, and the ends are whole steps.
 */
export function yAxisFor(values: readonly number[], minSpan: number): YAxis {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max((hi - lo) * 1.2, minSpan);
  const centre = (hi + lo) / 2;
  const step = niceStep(span, 4);
  const min = Math.floor((centre - span / 2) / step + 1e-9) * step;
  const max = Math.ceil((centre + span / 2) / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return { min, max: ticks[ticks.length - 1] ?? max, ticks };
}

/** The smallest span in the units drawn: 4 kg (or its pounds), or 5 % of the mean weight. */
export function minSpanFor(values: readonly number[], kgInUnit: number): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);
  return Math.max(MIN_SPAN_KG * kgInUnit, MIN_SPAN_SHARE * mean);
}

/**
 * Week ticks counted back from the last day: every week, or every few weeks when the range is long
 * enough that every week would not fit (at most `maxTicks` labels). Day numbers, oldest first.
 */
export function weekTicks(
  fromNumber: number,
  toNumber: number,
  maxTicks: number = CHART.maxTicks,
): readonly number[] {
  const weeks = Math.max(Math.floor((toNumber - fromNumber) / 7), 1);
  const every = Math.max(Math.ceil(weeks / (maxTicks - 1)), 1);
  const out: number[] = [];
  for (let d = toNumber; d >= fromNumber; d -= 7 * every) out.unshift(d);
  return out;
}

/** Where a value sits on an axis, 0 to 1. */
export const fraction = (value: number, min: number, max: number): number =>
  max === min ? 0.5 : (value - min) / (max - min);

/** The horizontal domain: the range's start (or the first weigh-in for "all") to today, at least a week wide. */
export function xDomain(
  points: readonly TrendPoint[],
  range: RangeKey,
  todayNumber: number,
): { readonly from: number; readonly to: number } {
  const days = RANGE_DAYS[range];
  const first = points[0]?.dayNumber ?? todayNumber;
  const last = points[points.length - 1]?.dayNumber ?? todayNumber;
  const to = Math.max(todayNumber, last);
  const from = days === null ? first : to - days;
  return { from: Math.min(from, to - 7), to };
}

/** The longest gap, in days, between two consecutive points. */
export function longestGap(points: readonly TrendPoint[]): number {
  let longest = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) longest = Math.max(longest, b.dayNumber - a.dayNumber);
  }
  return longest;
}

/** A gap of this many days or more is drawn dashed and mentioned in words. */
export const GAP_DAYS = 14;

/** The path of one straight segment between two points of the drawing. */
export const segmentPath = (x1: number, y1: number, x2: number, y2: number): string =>
  ['M', x1.toFixed(1), y1.toFixed(1), 'L', x2.toFixed(1), y2.toFixed(1)].join(' ');
