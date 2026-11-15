import { describe, expect, it } from 'vitest';
import {
  CHANGE_WINDOWS,
  PACE_NOTICE_DISMISS_DAYS,
  PACE_SAFEGUARD,
  STALE_WEIGH_IN_DAYS,
  dayNumberOf,
  daysBetweenDays,
  fastFallSafeguard,
  outlierDays,
  paceNoticeDismissed,
  trendChange,
  trendOn,
  trendPace,
  weightProgress,
  weightTrend,
  weighInIsStale,
  type WeighIn,
} from '../src';

const day = (offset: number): string => {
  const d = new Date(Date.UTC(2026, 0, 1 + offset));
  return d.toISOString().slice(0, 10);
};
/** One weigh-in per listed day offset, with the value from `f`. */
const series = (offsets: readonly number[], f: (o: number) => number): WeighIn[] =>
  offsets.map((o) => ({ day: day(o), value: f(o) }));

describe('weightTrend', () => {
  it('is empty without weigh-ins and its own value for the first one', () => {
    expect(weightTrend([])).toEqual([]);
    const one = weightTrend([{ day: '2026-01-05', value: 80 }]);
    expect(one).toHaveLength(1);
    expect(one[0]?.trend).toBe(80);
  });

  it('moves 10 % of the way per calendar day', () => {
    const t = weightTrend([
      { day: '2026-01-01', value: 80 },
      { day: '2026-01-02', value: 81 },
    ]);
    expect(t[1]?.trend).toBeCloseTo(80.1, 10);
  });

  it('carries the trend across gaps without inventing points', () => {
    const t = weightTrend([
      { day: '2026-01-01', value: 80 },
      { day: '2026-01-11', value: 90 },
    ]);
    expect(t).toHaveLength(2);
    // Ten daily steps: 1 - 0.9^10 of the way.
    expect(t[1]?.trend).toBeCloseTo(80 + (1 - Math.pow(0.9, 10)) * 10, 10);
  });

  it('gives the same trend for a gap as for the same days with the value repeated daily', () => {
    const gap = weightTrend([
      { day: '2026-01-01', value: 80 },
      { day: '2026-01-04', value: 83 },
    ]);
    const daily = weightTrend([
      { day: '2026-01-01', value: 80 },
      { day: '2026-01-02', value: 83 },
      { day: '2026-01-03', value: 83 },
      { day: '2026-01-04', value: 83 },
    ]);
    expect(gap[1]?.trend).toBeCloseTo(daily[3]?.trend ?? 0, 10);
  });

  it('sorts, keeps one value per day (the last) and ignores bad input', () => {
    const t = weightTrend([
      { day: '2026-01-03', value: 80 },
      { day: '2026-01-01', value: 90 },
      { day: '2026-01-01', value: 82 },
      { day: 'nope', value: 70 },
      { day: '2026-01-02', value: Number.NaN },
    ]);
    expect(t.map((p) => p.day)).toEqual(['2026-01-01', '2026-01-03']);
    expect(t[0]?.value).toBe(82);
  });

  it('counts calendar days across a daylight-saving change', () => {
    expect(daysBetweenDays('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetweenDays('2026-10-24', '2026-10-26')).toBe(2);
    expect(dayNumberOf('2026-02-30')).not.toBeNaN(); // normalised by Date; callers validate days
  });
});

describe('trendOn and trendChange', () => {
  const s = weightTrend(series([0, 7, 14, 21, 28], (o) => 90 - o / 7));
  it('carries the latest trend on or before a day', () => {
    expect(trendOn(s, day(-1))).toBeNull();
    expect(trendOn(s, day(0))).toBe(90);
    expect(trendOn(s, day(10))).toBe(s[1]?.trend);
  });

  it('needs two weigh-ins spanning the window minimum', () => {
    expect(trendChange(weightTrend(series([0], () => 80)), CHANGE_WINDOWS.week)).toBeNull();
    expect(trendChange(weightTrend(series([0, 6], () => 80)), CHANGE_WINDOWS.week)).toBeNull();
    expect(trendChange(weightTrend(series([0, 7], () => 80)), CHANGE_WINDOWS.week)).not.toBeNull();
    expect(
      trendChange(weightTrend(series([0, 20], () => 80)), CHANGE_WINDOWS.fourWeeks),
    ).toBeNull();
    expect(
      trendChange(weightTrend(series([0, 21], () => 80)), CHANGE_WINDOWS.fourWeeks),
    ).not.toBeNull();
  });

  it('reports the span actually used when the data is shorter than the window', () => {
    const c = trendChange(
      weightTrend(series([0, 7, 22], (o) => 80 - o / 10)),
      CHANGE_WINDOWS.fourWeeks,
    );
    expect(c?.days).toBe(22);
    expect(c?.kg).toBeLessThan(0);
  });

  it('measures the full window when there is more data than the window', () => {
    const c = trendChange(s, CHANGE_WINDOWS.fourWeeks);
    expect(c?.days).toBe(28);
    expect(c?.fromKg).toBe(90);
    expect((c?.kg ?? 0) < 0).toBe(true);
  });
});

describe('trendPace and weightProgress', () => {
  it('is null without enough data', () => {
    expect(trendPace([])).toBeNull();
    expect(trendPace(weightTrend(series([0, 3], () => 80)))).toBeNull();
  });

  it('gives kg and percent per week', () => {
    // A steady 0.5 kg a week fall: the trend settles at about that pace.
    const w = series(
      Array.from({ length: 57 }, (_, i) => i),
      (o) => 90 - (o * 0.5) / 7,
    );
    const p = trendPace(weightTrend(w));
    expect(p?.overDays).toBe(28);
    expect(p?.kgPerWeek).toBeLessThan(0);
    expect(p?.kgPerWeek).toBeCloseTo(-0.5, 1);
    expect(p?.pctPerWeek).toBeCloseTo(
      ((p?.kgPerWeek ?? 0) / (weightTrend(w).at(-1)?.trend ?? 1)) * 100,
      6,
    );
  });

  it('bundles the series, latest, changes and pace', () => {
    const p = weightProgress(series([0, 10, 25], () => 80));
    expect(p.latest?.day).toBe(day(25));
    expect(p.changeWeek?.kg).toBeCloseTo(0, 10);
    expect(p.changeFourWeeks?.days).toBe(25);
    expect(weightProgress([]).latest).toBeNull();
  });
});

describe('fastFallSafeguard (ADR 0008)', () => {
  const daily = (n: number, fallPerWeekKg: number) =>
    weightTrend(
      series(
        Array.from({ length: n }, (_, i) => i),
        (o) => 90 - (o * fallPerWeekKg) / 7,
      ),
    );
  /** Today is the day after the last of `n` daily weigh-ins. */
  const todayAfter = (n: number): string => day(n - 1);

  it('names its thresholds', () => {
    expect(PACE_SAFEGUARD).toEqual({
      thresholdPctPerWeek: 1,
      windowDays: 14,
      minHistoryDays: 28,
      minWeighIns: 3,
      minSpanDays: 14,
      dataDays: 28,
      maxLatestAgeDays: 14,
    });
    expect(PACE_NOTICE_DISMISS_DAYS).toBe(14);
    expect(STALE_WEIGH_IN_DAYS).toBe(60);
  });

  it('holds for a sustained fall faster than 1 % a week', () => {
    expect(fastFallSafeguard(daily(40, 1.5), todayAfter(40))).toBe(true);
  });

  it('is quiet for a gentler fall, a steady weight or a rise', () => {
    expect(fastFallSafeguard(daily(40, 0.4), todayAfter(40))).toBe(false);
    expect(fastFallSafeguard(daily(40, 0), todayAfter(40))).toBe(false);
    expect(fastFallSafeguard(daily(40, -1.5), todayAfter(40))).toBe(false);
  });

  it('needs the first weigh-in at least 28 days before today', () => {
    expect(fastFallSafeguard(daily(28, 1.5), todayAfter(28))).toBe(false); // 27 days of history
    expect(fastFallSafeguard(daily(29, 1.5), todayAfter(29))).toBe(true); // 28 days
    expect(fastFallSafeguard([], day(0))).toBe(false);
  });

  /** A diet start: some water in the first days, then a steady gentle fall. */
  const dietStart = (start: number, waterKg: number, perWeekKg: number) =>
    weightTrend(
      series(
        Array.from({ length: 60 }, (_, i) => i),
        (o) => start - waterKg * Math.min(o / 5, 1) - (Math.max(o - 5, 0) * perWeekKg) / 7,
      ),
    );

  it('is quiet on a normal diet start: 100 kg losing 2.5 kg of water, then 0.5 kg a week', () => {
    const w = dietStart(100, 2.5, 0.5);
    for (let today = 0; today < 60; today++) {
      expect(
        fastFallSafeguard(
          w.filter((p) => p.dayNumber <= dayNumberOf(day(today))),
          day(today),
        ),
      ).toBe(false);
    }
  });

  it('is quiet on a normal diet start at 60 kg: 1.5 kg of water, then 0.3 kg a week', () => {
    const w = dietStart(60, 1.5, 0.3);
    for (let today = 0; today < 60; today++) {
      expect(
        fastFallSafeguard(
          w.filter((p) => p.dayNumber <= dayNumberOf(day(today))),
          day(today),
        ),
      ).toBe(false);
    }
  });

  it('holds for one weigh-in a week falling 1.7 % a week', () => {
    const w = weightTrend(series([0, 7, 14, 21, 28, 35], (o) => 90 * Math.pow(1 - 0.017, o / 7)));
    expect(fastFallSafeguard(w, day(35))).toBe(true);
  });

  it('needs 3 weigh-ins spanning 14 days within the last 28', () => {
    const fall = (o: number) => 90 - o * 0.4;
    // Two weigh-ins in the last 28 days.
    expect(fastFallSafeguard(weightTrend(series([0, 20, 35], fall)), day(35))).toBe(false);
    // Three, but only 10 days apart.
    expect(fastFallSafeguard(weightTrend(series([0, 25, 30, 35], fall)), day(35))).toBe(false);
    // Three spanning 14 days.
    expect(
      fastFallSafeguard(weightTrend(series([0, 21, 28, 35], (o) => 90 - (o / 7) * 1.5)), day(35)),
    ).toBe(true);
  });

  it('is quiet when the latest weigh-in is more than 14 days old', () => {
    const w = daily(40, 1.5);
    expect(fastFallSafeguard(w, day(39 + 14))).toBe(true);
    expect(fastFallSafeguard(w, day(39 + 15))).toBe(false);
  });
});

describe('typing slips (outliers)', () => {
  const base = (o: number) => 82 - o * 0.05;
  it('leaves out a first weigh-in typed as 182 and an out-of-place 28', () => {
    const w = [...series([0], () => 182), ...series([1, 2, 3, 4, 5], base)];
    expect(outlierDays(w)).toEqual(new Set([day(0)]));
    const t = weightTrend(w);
    expect(t[0]?.day).toBe(day(1));
    expect(Math.max(...t.map((p) => p.value))).toBeLessThan(83);
    const w28 = [...series([0, 1, 2], base), ...series([3], () => 28), ...series([4, 5, 6], base)];
    expect(outlierDays(w28)).toEqual(new Set([day(3)]));
    expect(weightProgress(w28).ignoredDays.has(day(3))).toBe(true);
  });

  it('does not let a slip wreck the pace or trigger the notice', () => {
    const w = [
      ...series([0], () => 182),
      ...series(
        Array.from({ length: 40 }, (_, i) => i + 1),
        () => 82,
      ),
    ];
    expect(fastFallSafeguard(weightTrend(w), day(41))).toBe(false);
    expect(weightProgress(w).pace?.kgPerWeek).toBeCloseTo(0, 10);
  });

  it('needs three neighbours and a gap of more than 15 %', () => {
    expect(outlierDays(series([0, 1], (o) => (o === 0 ? 182 : 82))).size).toBe(0);
    expect(outlierDays([...series([0], () => 95), ...series([1, 2, 3], () => 82)]).size).toBe(1);
    expect(outlierDays([...series([0], () => 94), ...series([1, 2, 3], () => 82)]).size).toBe(0);
  });
});

describe('after a gap', () => {
  const w = weightTrend([
    { day: day(0), value: 80 },
    { day: day(60), value: 75 },
  ]);
  it('says the real number of days between the points compared', () => {
    const c = trendChange(w, CHANGE_WINDOWS.fourWeeks);
    expect(c?.days).toBe(60);
    const p = trendPace(w);
    expect(p?.overDays).toBe(60);
    expect(p?.kgPerWeek).toBeCloseTo((-5 / 60) * 7, 2);
  });

  it('uses the window when a weigh-in lies within 3 days of its start', () => {
    const near = weightTrend(series([0, 29, 57], (o) => 80 - o / 10));
    const c = trendChange(near, CHANGE_WINDOWS.fourWeeks);
    expect(c?.days).toBe(28);
  });

  it('is null with fewer than two weigh-ins to compare', () => {
    expect(trendChange(weightTrend(series([60], () => 80)), CHANGE_WINDOWS.fourWeeks)).toBeNull();
    expect(trendPace(weightTrend(series([60], () => 80)))).toBeNull();
  });
});

describe('paceNoticeDismissed and weighInIsStale', () => {
  const now = Date.UTC(2026, 5, 20, 12);
  const dayMs = 86_400_000;
  it('hides the notice for 14 days after a dismissal', () => {
    expect(paceNoticeDismissed(null, now)).toBe(false);
    expect(paceNoticeDismissed(undefined, now)).toBe(false);
    expect(paceNoticeDismissed(now - 13 * dayMs, now)).toBe(true);
    expect(paceNoticeDismissed(now - 14 * dayMs, now)).toBe(false);
    expect(paceNoticeDismissed(now + dayMs, now)).toBe(false);
  });
  it('calls a weigh-in stale after 60 days', () => {
    expect(weighInIsStale('2026-01-01', '2026-03-02')).toBe(false); // 60 days
    expect(weighInIsStale('2026-01-01', '2026-03-03')).toBe(true); // 61 days
  });
});
