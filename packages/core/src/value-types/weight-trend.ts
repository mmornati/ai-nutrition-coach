// The weight trend (docs/adr/0008). A weigh-in swings by a kilo or so from day to day with water,
// so a trend is drawn through them: an exponentially weighted moving average on CALENDAR days.
// Pure: no clock (the callers pass the days), no I/O. Nothing here is a verdict: it states where
// the smoothed line is and how it moved, and never says whether that is good.

/** Smoothing per calendar day: each day the trend moves 10 % of the way to a new weigh-in. */
export const TREND_ALPHA_PER_DAY = 0.1;

/** Weigh-ins needed to say how the trend moved over a week: two, at least 7 days apart. */
export const CHANGE_WINDOWS = Object.freeze({
  week: Object.freeze({ days: 7, minSpanDays: 7 }),
  fourWeeks: Object.freeze({ days: 28, minSpanDays: 21 }),
});

/**
 * Pace safeguard (docs/adr/0008, Safeguards): a calm fixed line is shown when the trend falls
 * faster than 1 % of body weight per week over the last 14 days, given enough data: the first
 * weigh-in at least 28 days before today (the trend of a first fortnight is mostly water and the
 * start of the average), and at least 3 weigh-ins spanning at least 14 days within the last 28
 * days. The latest weigh-in must be at most 14 days old. A convention from clinical guidance on a
 * sustainable rate of loss, not a threshold the person has "crossed".
 */
export const PACE_SAFEGUARD = Object.freeze({
  /** Percent of body weight per week. */
  thresholdPctPerWeek: 1,
  windowDays: 14,
  /** The first weigh-in is at least this many days before today. */
  minHistoryDays: 28,
  /** Weigh-ins needed within the last `dataDays` days... */
  minWeighIns: 3,
  /** ...spanning at least this many days. */
  minSpanDays: 14,
  dataDays: 28,
  /** The latest weigh-in is at most this many days before today. */
  maxLatestAgeDays: 14,
});

/**
 * Typing slips (182 for 82 kg): a weigh-in that differs by more than 15 % from the median of its
 * neighbours (up to 3 before and 3 after, at least 3 of them) is left out of the trend, the pace,
 * the safeguard and the chart axis. It stays in the person's list, marked, with an edit action.
 */
export const OUTLIER = Object.freeze({ share: 0.15, neighbours: 3, minNeighbours: 3 });

/** Days within which a weigh-in counts as "at the start" of a comparison window. */
export const WINDOW_START_TOLERANCE_DAYS = 3;

/** The calm line may be dismissed for this many days; it returns after that if it still holds. */
export const PACE_NOTICE_DISMISS_DAYS = 14;

/** A latest weigh-in older than this many days gets a quiet line suggesting an update. */
export const STALE_WEIGH_IN_DAYS = 60;

const MS_PER_DAY = 86_400_000;

/** A weigh-in as the trend sees it: a local calendar day (`yyyy-MM-dd`) and kilograms. */
export interface WeighIn {
  readonly day: string;
  readonly value: number;
}

export interface TrendPoint {
  readonly day: string;
  /** Whole days since 1970-01-01 of the calendar day (no time zone in it). */
  readonly dayNumber: number;
  /** The weigh-in itself, kg. */
  readonly value: number;
  /** The smoothed value on that day, kg. */
  readonly trend: number;
}

/** Whole calendar days since 1970-01-01 for a `yyyy-MM-dd` text; `NaN` when it is not one. */
export function dayNumberOf(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (m === null) return Number.NaN;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY);
}

/** The `yyyy-MM-dd` text of a day number. */
export const dayTextOf = (dayNumber: number): string =>
  new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);

/** Calendar days from `from` to `to` (negative when `to` is earlier). */
export const daysBetweenDays = (from: string, to: string): number =>
  dayNumberOf(to) - dayNumberOf(from);

/** One value per valid day, oldest first (a second value for the same day replaces the first). */
function dedupe(weighIns: readonly WeighIn[]): WeighIn[] {
  const byDay = new Map<string, number>();
  for (const w of weighIns) {
    if (Number.isFinite(w.value) && Number.isFinite(dayNumberOf(w.day))) byDay.set(w.day, w.value);
  }
  return [...byDay.keys()].sort().map((day) => ({ day, value: byDay.get(day) as number }));
}

const median = (values: readonly number[]): number => {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1
    ? (v[mid] as number)
    : ((v[mid - 1] as number) + (v[mid] as number)) / 2;
};

/** The days of the weigh-ins left out of the trend as typing slips (see `OUTLIER`). */
export function outlierDays(weighIns: readonly WeighIn[]): ReadonlySet<string> {
  const all = dedupe(weighIns);
  const out = new Set<string>();
  all.forEach((w, i) => {
    const near = [
      ...all.slice(Math.max(0, i - OUTLIER.neighbours), i),
      ...all.slice(i + 1, i + 1 + OUTLIER.neighbours),
    ];
    if (near.length < OUTLIER.minNeighbours) return;
    const m = median(near.map((n) => n.value));
    if (m > 0 && Math.abs(w.value - m) / m > OUTLIER.share) out.add(w.day);
  });
  return out;
}

/**
 * The trend through the weigh-ins, oldest first, one point per weigh-in day (a second value for
 * the same day replaces the first). The first value is its own trend. After a gap of `g` days the
 * previous trend is carried across the missing days (no point is invented for them) and a new
 * weigh-in pulls it by `1 - (1 - alpha)^g`, the weight of `g` daily steps, so a month away does
 * not make the next weigh-in count as one day of evidence. Typing slips (`outlierDays`) are left out.
 */
export function weightTrend(
  weighIns: readonly WeighIn[],
  alpha: number = TREND_ALPHA_PER_DAY,
): readonly TrendPoint[] {
  const skipped = outlierDays(weighIns);
  const out: TrendPoint[] = [];
  for (const { day, value } of dedupe(weighIns)) {
    if (skipped.has(day)) continue;
    const dayNumber = dayNumberOf(day);
    const previous = out[out.length - 1];
    const trend =
      previous === undefined
        ? value
        : previous.trend +
          (1 - Math.pow(1 - alpha, dayNumber - previous.dayNumber)) * (value - previous.trend);
    out.push({ day, dayNumber, value, trend });
  }
  return out;
}

/** The trend on a day: the carried value of the latest weigh-in on or before it; `null` before the first. */
export function trendOn(series: readonly TrendPoint[], day: string): number | null {
  const n = dayNumberOf(day);
  let found: TrendPoint | undefined;
  for (const p of series) {
    if (p.dayNumber <= n) found = p;
    else break;
  }
  return found === undefined ? null : found.trend;
}

export interface TrendChange {
  /** The days the change spans: the window, or less when the first weigh-in is more recent. */
  readonly days: number;
  /** Trend now minus trend at the start of the span, kg (negative is lower). */
  readonly kg: number;
  /** The trend at the start of the span, kg. */
  readonly fromKg: number;
}

/**
 * How the trend moved over the last `window.days` days up to the latest weigh-in: `null` unless
 * there are at least two weigh-ins spanning `window.minSpanDays`. The span is the real one between
 * the points compared: when the first weigh-in is more recent than the window it is the first
 * weigh-in; when a weigh-in lies within 3 days of the window's start the window itself; otherwise
 * the nearest earlier weigh-in, however far back, and `days` says how far.
 */
export function trendChange(
  series: readonly TrendPoint[],
  window: { readonly days: number; readonly minSpanDays: number },
): TrendChange | null {
  const first = series[0];
  const last = series[series.length - 1];
  if (first === undefined || last === undefined || series.length < 2) return null;
  const span = last.dayNumber - first.dayNumber;
  if (span < window.minSpanDays) return null;
  if (span <= window.days) return { days: span, kg: last.trend - first.trend, fromKg: first.trend };
  const startDay = last.dayNumber - window.days;
  const before = series.slice(0, -1);
  const near = before.some((p) => Math.abs(p.dayNumber - startDay) <= WINDOW_START_TOLERANCE_DAYS);
  if (near) {
    const from = trendOn(before, dayTextOf(startDay));
    if (from === null) return null;
    return { days: window.days, kg: last.trend - from, fromKg: from };
  }
  let earlier: TrendPoint | undefined;
  for (const p of before) {
    if (p.dayNumber < startDay) earlier = p;
  }
  if (earlier === undefined) return null;
  return {
    days: last.dayNumber - earlier.dayNumber,
    kg: last.trend - earlier.trend,
    fromKg: earlier.trend,
  };
}

export interface TrendPace {
  /** Change of the trend per week, kg (negative is lower). */
  readonly kgPerWeek: number;
  /** The same as a percentage of the current trend weight. */
  readonly pctPerWeek: number;
  /** The days it was measured over. */
  readonly overDays: number;
}

/** The weekly pace: from the last four weeks when there is enough data, else from the last week. */
export function trendPace(series: readonly TrendPoint[]): TrendPace | null {
  const last = series[series.length - 1];
  if (last === undefined) return null;
  const change =
    trendChange(series, CHANGE_WINDOWS.fourWeeks) ?? trendChange(series, CHANGE_WINDOWS.week);
  if (change === null || change.days <= 0) return null;
  const kgPerWeek = (change.kg / change.days) * 7;
  return { kgPerWeek, pctPerWeek: (kgPerWeek / last.trend) * 100, overDays: change.days };
}

export interface WeightProgress {
  readonly series: readonly TrendPoint[];
  readonly latest: TrendPoint | null;
  readonly changeWeek: TrendChange | null;
  readonly changeFourWeeks: TrendChange | null;
  readonly pace: TrendPace | null;
  /** Days of the weigh-ins left out of the trend as typing slips. */
  readonly ignoredDays: ReadonlySet<string>;
}

/** Everything the Trends screen says about the weights, from the weigh-ins alone. */
export function weightProgress(weighIns: readonly WeighIn[]): WeightProgress {
  const series = weightTrend(weighIns);
  return {
    series,
    latest: series[series.length - 1] ?? null,
    changeWeek: trendChange(series, CHANGE_WINDOWS.week),
    changeFourWeeks: trendChange(series, CHANGE_WINDOWS.fourWeeks),
    pace: trendPace(series),
    ignoredDays: outlierDays(weighIns),
  };
}

/**
 * Whether the trend has fallen faster than the safeguard's pace (`PACE_SAFEGUARD`): the trend at
 * the start of the last 14 days against the trend at the latest weigh-in. It needs the first
 * weigh-in at least 28 days before `today`, at least 3 weigh-ins spanning 14 days within the 28
 * days up to the latest, and a latest weigh-in at most 14 days before `today` (`yyyy-MM-dd`).
 * Independent of the goal.
 */
export function fastFallSafeguard(series: readonly TrendPoint[], today: string): boolean {
  const last = series[series.length - 1];
  const first = series[0];
  const todayNumber = dayNumberOf(today);
  if (last === undefined || first === undefined || !Number.isFinite(todayNumber)) return false;
  const p = PACE_SAFEGUARD;
  if (todayNumber - last.dayNumber > p.maxLatestAgeDays) return false;
  if (todayNumber - first.dayNumber < p.minHistoryDays) return false;
  const recent = series.filter((x) => x.dayNumber >= last.dayNumber - p.dataDays);
  const oldest = recent[0];
  if (oldest === undefined || recent.length < p.minWeighIns) return false;
  if (last.dayNumber - oldest.dayNumber < p.minSpanDays) return false;
  const from = trendOn(series, dayTextOf(last.dayNumber - p.windowDays));
  if (from === null) return false;
  const fallPerWeek = ((from - last.trend) / p.windowDays) * 7;
  return (fallPerWeek / last.trend) * 100 > p.thresholdPctPerWeek;
}

/**
 * Whether the pace line is hidden: dismissed less than `PACE_NOTICE_DISMISS_DAYS` ago.
 * `dismissedAtUtc` is epoch ms (or `null`/absent); `now` is the injected clock's instant.
 */
export function paceNoticeDismissed(
  dismissedAtUtc: number | null | undefined,
  now: number,
): boolean {
  if (dismissedAtUtc === null || dismissedAtUtc === undefined) return false;
  if (!Number.isFinite(dismissedAtUtc) || dismissedAtUtc > now) return false;
  return now - dismissedAtUtc < PACE_NOTICE_DISMISS_DAYS * MS_PER_DAY;
}

/** The latest weigh-in is more than `STALE_WEIGH_IN_DAYS` days before `today` (both `yyyy-MM-dd`). */
export const weighInIsStale = (latestDay: string, today: string): boolean =>
  daysBetweenDays(latestDay, today) > STALE_WEIGH_IN_DAYS;
