// The sentences about the weight trend, in words and never as a verdict: "lower than", "higher
// than", "about the same as". No "on track", no "behind", no arrow, no goal.
import type { UnitSystem, WeightProgress } from '@anc/core';
import { fill, type Strings } from '../../i18n';
import type { Locale } from '../../i18n/locale';
import { formatDay } from '../settings/ProfileBodySection';
import { amountText, changeIsZero, percentText, weightText } from './weight-format';

interface Ctx {
  readonly units: UnitSystem;
  readonly locale: Locale;
  readonly all: Strings;
}

/** "Trend: 81,6 kg, about 0,4 kg lower than four weeks ago." and its sparse-data forms. */
export function trendSentence(progress: WeightProgress, { units, locale, all }: Ctx): string {
  const s = all.progress;
  const latest = progress.latest;
  if (latest === null) return s.noWeighIns;
  if (progress.series.length === 1) {
    return fill(s.oneWeighIn, {
      date: formatDay(latest.day, locale),
      value: weightText(latest.value, units, locale, all.profile),
    });
  }
  const value = weightText(latest.trend, units, locale, all.profile);
  const change = progress.changeFourWeeks ?? progress.changeWeek;
  if (change === null) return fill(s.trendOnly, { value });
  const ago =
    change.days === 28
      ? s.agoFourWeeks
      : change.days === 7
        ? s.agoWeek
        : fill(s.agoDays, { count: change.days });
  if (changeIsZero(change.kg, units)) return fill(s.trendSame, { value, ago });
  return fill(change.kg < 0 ? s.trendLower : s.trendHigher, {
    value,
    amount: amountText(change.kg, units, locale, all.profile),
    ago,
  });
}

/** The pace over the span it was measured on, or `null` without enough weigh-ins. */
export function paceSentence(progress: WeightProgress, { units, locale, all }: Ctx): string | null {
  const pace = progress.pace;
  if (pace === null) return null;
  const s = all.progress;
  if (changeIsZero(pace.kgPerWeek, units)) return fill(s.paceSame, { count: pace.overDays });
  return fill(pace.kgPerWeek < 0 ? s.paceLower : s.paceHigher, {
    count: pace.overDays,
    amount: amountText(pace.kgPerWeek, units, locale, all.profile),
    pct: percentText(pace.pctPerWeek, locale),
  });
}
