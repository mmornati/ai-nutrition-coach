import type { AgeBand, Profile } from '../entities/profile';
import { EU_REFERENCE_INTAKES, type Nutrients } from './nutrients';

/** A daily guide: energy in kcal, the rest in grams. */
export type DailyTargets = Required<Nutrients>;

/**
 * Reference body weights (kg) used for the energy and protein figures: the average adult
 * reference weights of the EFSA Dietary Reference Values (2013 energy opinion; 2012 protein
 * opinion): 68.1 kg for men, 58.5 kg for women. 'unspecified' uses the average of both.
 */
export const REFERENCE_WEIGHT_KG = Object.freeze({ male: 68.1, female: 58.5 });

/** Physical activity level (EFSA 2013): about 1.4 low, 1.6 moderate, 1.8 high. */
export const PAL = Object.freeze({ low: 1.4, moderate: 1.6, high: 1.8 });

/** EFSA PRI for protein for adults: 0.83 g per kg of body weight per day (EFSA 2012). */
export const PROTEIN_G_PER_KG = 0.83;

/** Energy is never guided below this, whatever the goal (no aggressive deficits). */
export const MIN_ENERGY_KCAL = 1500;

/** Calm goal adjustment: 10 % either way, nothing larger. */
const GOAL_FACTOR = { eatBetter: 1, maintain: 1, lose: 0.9, gain: 1.1 } as const;

/**
 * Basal metabolic rate (kcal/day) from body weight: Henry (2005) weight-only (Oxford)
 * equations, the basis EFSA used for its 2013 average-requirement tables (Henry CJK, Public Health
 * Nutr 2005;8(7A):1133-52), by sex and age range
 * (18-29, 30-59, 60+). The profile's 50-64 band uses the 30-59 equation, 65+ the 60+ one.
 */
const BMR: Readonly<
  Record<'male' | 'female', Readonly<Record<AgeBand, readonly [number, number]>>>
> = {
  male: {
    '18-29': [16.0, 545],
    '30-49': [14.2, 593],
    '50-64': [14.2, 593],
    '65+': [13.5, 514],
  },
  female: {
    '18-29': [13.1, 558],
    '30-49': [9.74, 694],
    '50-64': [9.74, 694],
    '65+': [10.1, 569],
  },
};

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

function averageRequirementKcal(
  sex: 'male' | 'female',
  ageBand: AgeBand,
  activity: keyof typeof PAL,
): number {
  const [slope, intercept] = BMR[sex][ageBand];
  return (slope * REFERENCE_WEIGHT_KG[sex] + intercept) * PAL[activity];
}

/**
 * Daily guide for a profile. Without a profile, or without sex, age band AND activity, it is the
 * EU Reference Intakes unchanged (a goal alone changes nothing).
 *
 * Energy: EFSA average requirement at the reference weight x PAL, rounded to 50 kcal ('unspecified'
 * sex: average of both), then the goal: lose -10 %, gain +10 %, never below 1500 kcal.
 * Macros scale from that energy: fat 35 % E, saturates 10 % E (both /9), carbohydrate 50 % E (/4),
 * sugars the EU 90 g scaled by energy/2000. Protein is the EFSA PRI x reference weight and does not
 * follow the goal. Fibre 25 g and salt 6 g are fixed. Grams are whole numbers.
 */
export function dailyTargetsFor(profile?: Profile): DailyTargets {
  const { sex, ageBand, activity, goal } = profile ?? {};
  if (sex === undefined || ageBand === undefined || activity === undefined) {
    return EU_REFERENCE_INTAKES;
  }
  const base =
    sex === 'unspecified'
      ? (averageRequirementKcal('male', ageBand, activity) +
          averageRequirementKcal('female', ageBand, activity)) /
        2
      : averageRequirementKcal(sex, ageBand, activity);
  const weight =
    sex === 'unspecified'
      ? (REFERENCE_WEIGHT_KG.male + REFERENCE_WEIGHT_KG.female) / 2
      : REFERENCE_WEIGHT_KG[sex];
  const adjusted = roundTo(base, 50) * GOAL_FACTOR[goal ?? 'maintain'];
  const energyKcal = Math.max(MIN_ENERGY_KCAL, roundTo(adjusted, 50));
  return Object.freeze({
    energyKcal,
    fat: Math.round((energyKcal * 0.35) / 9),
    saturatedFat: Math.round((energyKcal * 0.1) / 9),
    carbohydrate: Math.round((energyKcal * 0.5) / 4),
    sugars: Math.round((EU_REFERENCE_INTAKES.sugars * energyKcal) / 2000),
    protein: Math.round(PROTEIN_G_PER_KG * weight),
    fibre: EU_REFERENCE_INTAKES.fibre,
    salt: EU_REFERENCE_INTAKES.salt,
  });
}
