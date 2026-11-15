import { bodyMassIndex } from './body-metrics';
import {
  CUSTOM_ENERGY_RANGE_KCAL,
  type Activity,
  type AgeBand,
  type Pace,
  type Profile,
  type Sex,
} from '../entities/profile';
import { EU_REFERENCE_INTAKES, type Nutrients } from './nutrients';

// The daily guide (docs/adr/0008). Pure: no clock, no DOM. Every constant below names its source.
// The result is an ESTIMATE, usually within about 10 %, and is framed as "your daily guide", never
// as a limit, a budget or an allowance.

/** A daily guide: energy in kcal, the rest in grams. */
export type DailyTargets = Required<Nutrients>;

/**
 * Reference body weights (kg) used when no weight is known: the average adult reference weights of
 * the EFSA Dietary Reference Values (2013 energy opinion; 2012 protein opinion): 68.1 kg for men,
 * 58.5 kg for women. 'unspecified' uses the average of both.
 */
export const REFERENCE_WEIGHT_KG = Object.freeze({ male: 68.1, female: 58.5 });

/**
 * Reference adult statures (m) behind those reference weights (EFSA 2013 energy opinion: 1.76 m for
 * men, 1.63 m for women, i.e. a BMI of 22 at the reference weight). Used only to bound the protein
 * figure when no height is known (`proteinBasisKg`).
 */
export const REFERENCE_HEIGHT_M = Object.freeze({ male: 1.76, female: 1.63 });

/**
 * Physical activity level (EFSA 2013 energy opinion): about 1.4 low, 1.6 moderate, 1.8 high and
 * 2.0 very high.
 */
export const PAL = Object.freeze({ low: 1.4, moderate: 1.6, high: 1.8, veryHigh: 2.0 });

/** EFSA PRI for protein for adults: 0.83 g per kg of body weight per day (EFSA 2012). */
export const PROTEIN_G_PER_KG = 0.83;
/** 65 and over: 1.0 g/kg (ESPEN / PROT-AGE expert consensus; above the EFSA PRI on purpose). */
export const PROTEIN_G_PER_KG_OLDER = 1.0;
/** While an energy deficit is applied: 1.2 g/kg (protects lean mass; ACSM / PROT-AGE practice). */
export const PROTEIN_G_PER_KG_DEFICIT = 1.2;

/**
 * Protein bounds, so no input can make the figure absurd. At least 40 g (never binds for an adult
 * above about 48 kg at the EFSA PRI); at most 160 g; and never more than 30 % of energy, so that
 * carbohydrate (what remains after fat at 35 % and protein) never falls below 35 % of energy.
 */
export const PROTEIN_MIN_G = 40;
export const PROTEIN_MAX_G = 160;
export const PROTEIN_MAX_ENERGY_SHARE = 0.3;

/**
 * Energy is never guided below this. CONVENTIONS from clinical practice (the long-standing 1500 /
 * 1200 kcal floors of weight-management guidance, e.g. AHA/ACC/TOS 2013, NIH), NOT clinical
 * thresholds: they are a guard against aggressive deficits. 1200 for women, 1500 for men and for
 * 'unspecified' sex.
 */
export const ENERGY_FLOOR_KCAL = Object.freeze({ male: 1500, female: 1200, unspecified: 1500 });
/** Back-compat name for the higher floor. */
export const MIN_ENERGY_KCAL = ENERGY_FLOOR_KCAL.male;

/**
 * Daily energy deficit by pace (kcal/day). About 250 / 500 / 750 kcal a day is roughly 0.25 / 0.5 /
 * 0.75 kg a week at first (the 7700 kcal-per-kg rule of thumb overstates it as the body adapts: NIH
 * Body Weight Planner, Hall et al. 2011); a rule of thumb, not a prediction.
 */
export const DEFICIT_KCAL_BY_PACE = Object.freeze({ gentle: 250, standard: 500, faster: 750 });
/**
 * The smallest deficit worth applying (the gentle step). When the floor leaves less room than this
 * below maintenance, no deficit is applied at all and the guide says why (`belowFloor`).
 */
export const MIN_USEFUL_DEFICIT_KCAL = DEFICIT_KCAL_BY_PACE.gentle;
/** A deficit is never more than this share of maintenance (CONVENTION; NICE NG246 advises a modest deficit). */
export const MAX_DEFICIT_SHARE = 0.25;
/** The surplus for a gain goal: 250 kcal (gentle, standard) or 400 kcal (faster). Convention. */
export const SURPLUS_KCAL_BY_PACE = Object.freeze({ gentle: 250, standard: 250, faster: 400 });
/** The pace used when none was chosen. */
export const DEFAULT_PACE: Pace = 'gentle';

/** Macro shares of energy (EFSA 2010 / 2013 DRVs: fat 20-35 % E, saturates as low as possible, kept at 10 % E). */
export const FAT_SHARE = 0.35;
export const SATURATED_FAT_SHARE = 0.1;
/** Fibre: the EFSA adequate intake of 25 g; 30 g is the aim some guidelines name (explanation text only). */
export const FIBRE_G = 25;
export const FIBRE_AIM_G = 30;
/** BMI thresholds used by the safeguards (WHO 2000; NICE NG246; CDC). */
export const BMI_UNDERWEIGHT_BELOW = 18.5;
export const BMI_OBESITY_FROM = 30;
/** The BMI at which the reference weight for protein is taken when BMI is above 30 (a healthy-range anchor). */
export const PROTEIN_REFERENCE_BMI = 25;
/** The stated accuracy of the energy estimate. */
export const ESTIMATE_ACCURACY_PERCENT = 10;
/** The step the energy is rounded to. */
export const ENERGY_STEP_KCAL = 50;

type Equation = 'weightHeight' | 'weightOnly' | 'referenceWeight';

type Coefficients = readonly [number, number];
type HeightCoefficients = readonly [number, number, number];

/**
 * Resting energy (kcal/day) from weight (kg), Henry (2005) "Basal metabolic rate studies in humans:
 * measurement and development of new equations", Public Health Nutr 8(7A):1133-52 (the basis EFSA
 * used for its 2013 average requirements). WEIGHT-ONLY (Oxford) equations by sex and age range
 * (18-29, 30-59, 60+): slope x W + intercept. The profile's 30-49 band uses the 30-59 equation and
 * 65+ the 60+ one. The 50-64 band straddles Henry's 30-59 and 60+ ranges (60-64 belongs to 60+), so
 * it uses the MEAN of the two equations (`restingKcal`).
 */
const BMR_WEIGHT: Readonly<Record<'male' | 'female', Readonly<Record<AgeBand, Coefficients>>>> = {
  male: {
    '18-29': [16.0, 545],
    '30-49': [14.2, 593],
    '50-64': [14.2, 593], // not read: the mean of 30-59 and 60+
    '65+': [13.5, 514],
  },
  female: {
    '18-29': [13.1, 558],
    '30-49': [9.74, 694],
    '50-64': [9.74, 694], // not read: the mean of 30-59 and 60+
    '65+': [10.1, 569],
  },
};

/**
 * Henry (2005) WEIGHT-AND-HEIGHT equations, converted from MJ/day to kcal/day (x 239): a x W + b x H
 * + c with W in kg and H in metres, by sex and age range (18-29, 30-59, 60+), same band mapping.
 */
const BMR_WEIGHT_HEIGHT: Readonly<
  Record<'male' | 'female', Readonly<Record<AgeBand, HeightCoefficients>>>
> = {
  male: {
    '18-29': [14.4, 313, 113],
    '30-49': [11.4, 541, -137],
    '50-64': [11.4, 541, -137], // not read: the mean of 30-59 and 60+
    '65+': [11.4, 541, -256],
  },
  female: {
    '18-29': [10.4, 615, -282],
    '30-49': [8.18, 502, -11.6],
    '50-64': [8.18, 502, -11.6], // not read: the mean of 30-59 and 60+
    '65+': [8.52, 421, 10.7],
  },
};

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

function restingForBand(
  sex: 'male' | 'female',
  ageBand: AgeBand,
  weightKg: number,
  heightCm: number | undefined,
  equation: Equation,
): number {
  if (equation === 'weightHeight' && heightCm !== undefined) {
    const [a, b, c] = BMR_WEIGHT_HEIGHT[sex][ageBand];
    return a * weightKg + b * (heightCm / 100) + c;
  }
  const [slope, intercept] = BMR_WEIGHT[sex][ageBand];
  return slope * weightKg + intercept;
}

function restingKcal(
  sex: 'male' | 'female',
  ageBand: AgeBand,
  weightKg: number,
  heightCm: number | undefined,
  equation: Equation,
): number {
  // 50-64 straddles Henry's 30-59 and 60+ ranges: the mean of the two equations (documented in ADR 0008).
  if (ageBand === '50-64') {
    return (
      (restingForBand(sex, '30-49', weightKg, heightCm, equation) +
        restingForBand(sex, '65+', weightKg, heightCm, equation)) /
      2
    );
  }
  return restingForBand(sex, ageBand, weightKg, heightCm, equation);
}

/** What the guide shows instead of a deficit or a surplus, and why: calm, fixed lines in the UI. */
export type GuideNotice =
  /** Goal lose, BMI under 18.5. */
  | 'underweight'
  /** Goal lose, pregnant or breastfeeding. */
  | 'pregnancyBreastfeeding'
  /** Goal lose, 65 and over, BMI under 30 or unknown. */
  | 'olderAdult'
  /** Goal lose, a deficit would only be reachable below the floor. */
  | 'belowFloor'
  /** Goal gain, BMI 30 or more: no surplus. */
  | 'noSurplus'
  /** Goal lose or gain and the BMI is not known (no height or no weight): held at maintenance. */
  | 'bodyUnknown';

/** Why a person-set figure was not used: out of range, below the floor, or a safeguard that holds the guide. */
export type CustomRefusal = 'outOfRange' | 'belowFloor' | GuideNotice;

/** Which of the person's inputs were used and which were defaults. */
export interface GuideInputs {
  readonly sex: Sex | undefined;
  readonly ageBand: AgeBand | undefined;
  readonly activity: Activity | undefined;
  /** The weight used, when one was known. */
  readonly weightKg: number | undefined;
  readonly heightCm: number | undefined;
  readonly bmi: number | null;
  /** Names of the inputs that fell back to a default (e.g. `weight`). */
  readonly defaults: readonly ('weight' | 'height' | 'pace')[];
}

/** The structured "How this is worked out" (docs/adr/0008). The UI writes it out in words. */
export interface GuideExplanation {
  readonly basis: 'reference' | 'personal' | 'custom';
  readonly equation: Equation | null;
  /** Resting energy (BMR), rounded to 10 kcal; `null` for the reference intakes or a custom figure. */
  readonly restingKcal: number | null;
  readonly pal: number | null;
  /** Energy that keeps weight steady, rounded to 50 kcal. */
  readonly maintenanceKcal: number | null;
  /** Signed daily adjustment applied to maintenance (a deficit is negative). */
  readonly adjustmentKcal: number;
  readonly pace: Pace | null;
  /** The floor that applied (kcal): the guide was raised to it, or no deficit fits above it. */
  readonly flooredAt: number | null;
  /** The guide is above maintenance only because of the floor (not because of the goal and pace). */
  readonly raisedByFloor: boolean;
  readonly notice: GuideNotice | null;
  /** The person's own figure was set but not used, and why (see `CustomRefusal`); otherwise `null`. */
  readonly customRefused: CustomRefusal | null;
  readonly inputs: GuideInputs;
  readonly proteinGPerKg: number;
  /** The weight the protein figure is computed on (kg). */
  readonly proteinBasisKg: number;
  /** Whether that basis is the weight at BMI 25 (BMI above 30 and a known height). */
  readonly proteinOnBmi25: boolean;
  /** No height is known and the weight is above the weight at BMI 30 for the reference stature: capped there. */
  readonly proteinCapped: boolean;
  readonly accuracyPercent: number;
}

export interface DailyGuide {
  readonly targets: DailyTargets;
  /** True when the guide is the person's, not the EU reference intakes. */
  readonly personal: boolean;
  readonly explanation: GuideExplanation;
}

const floorFor = (sex: Sex | undefined): number => ENERGY_FLOOR_KCAL[sex ?? 'unspecified'];

/** Whether a person-set daily energy figure is acceptable, and why not. */
export function checkCustomEnergy(
  kcal: number,
  sex: Sex | undefined,
): 'ok' | 'belowFloor' | 'outOfRange' {
  if (
    !Number.isInteger(kcal) ||
    kcal < CUSTOM_ENERGY_RANGE_KCAL.min ||
    kcal > CUSTOM_ENERGY_RANGE_KCAL.max
  ) {
    return 'outOfRange';
  }
  return kcal < floorFor(sex) ? 'belowFloor' : 'ok';
}

function referenceExplanation(inputs: GuideInputs): GuideExplanation {
  return {
    basis: 'reference',
    equation: null,
    restingKcal: null,
    pal: null,
    maintenanceKcal: null,
    adjustmentKcal: 0,
    pace: null,
    flooredAt: null,
    raisedByFloor: false,
    notice: null,
    customRefused: null,
    inputs,
    proteinGPerKg: PROTEIN_G_PER_KG,
    proteinBasisKg: 0,
    proteinOnBmi25: false,
    proteinCapped: false,
    accuracyPercent: ESTIMATE_ACCURACY_PERCENT,
  };
}

/**
 * The daily guide for a profile and, when known, the latest weight in kg. Without a profile, or
 * without sex, age band AND activity (and no valid person-set energy figure), it is the EU
 * Reference Intakes unchanged (a goal alone changes nothing).
 *
 * Energy: Henry (2005) resting energy (weight-and-height equations when both are known,
 * weight-only when only the weight is, the EFSA reference weight when neither) x PAL, rounded to
 * 50 kcal ('unspecified' sex: the average of both sexes). Then the goal, by pace: a deficit of 250 /
 * 500 / 750 kcal (never more than 25 % of maintenance, never below the floor) or a surplus of 250 /
 * 400 kcal. Safeguards hold the guide at maintenance and say why (see `GuideNotice`).
 */
export function dailyGuideFor(profile?: Profile, weightKg?: number): DailyGuide {
  const { sex, ageBand, activity, goal, heightCm, pace, customEnergyKcal } = profile ?? {};
  const weight =
    weightKg !== undefined && Number.isFinite(weightKg) && weightKg > 0 ? weightKg : undefined;
  const bmi = bodyMassIndex(weight, heightCm);
  const inputs: GuideInputs = {
    sex,
    ageBand,
    activity,
    weightKg: weight,
    heightCm,
    bmi,
    defaults: [
      ...(weight === undefined ? (['weight'] as const) : []),
      ...(heightCm === undefined ? (['height'] as const) : []),
      ...((goal === 'lose' || goal === 'gain') && pace === undefined ? (['pace'] as const) : []),
    ],
  };
  const complete = sex !== undefined && ageBand !== undefined && activity !== undefined;
  // Pregnancy or breastfeeding is not a thing for a man: the flag is ignored for sex "male".
  const pregnant = profile?.pregnantOrBreastfeeding === true && sex !== 'male';

  // Resting energy and maintenance (only when sex, age band and activity are all known).
  let equation: Equation = 'referenceWeight';
  let resting: number | null = null;
  let maintenance: number | null = null;
  let palUsed: number | null = null;
  if (complete) {
    equation =
      weight === undefined
        ? 'referenceWeight'
        : heightCm === undefined
          ? 'weightOnly'
          : 'weightHeight';
    const bmrFor = (s: 'male' | 'female'): number =>
      restingKcal(s, ageBand, weight ?? REFERENCE_WEIGHT_KG[s], heightCm, equation);
    resting = sex === 'unspecified' ? (bmrFor('male') + bmrFor('female')) / 2 : bmrFor(sex);
    palUsed = PAL[activity];
    maintenance = roundTo(resting * palUsed, ENERGY_STEP_KCAL);
  }

  // The safeguards that hold the guide at maintenance. A deficit needs a BMI that is KNOWN and at
  // least 18.5; a surplus needs one that is known and under 30. `needsBody`: with no BMI, a weight
  // goal is held (a person without height or weight is not assumed to be of a healthy build).
  const holdReason = (needsBody: boolean): GuideNotice | null => {
    if (pregnant) return 'pregnancyBreastfeeding';
    if (bmi !== null && bmi < BMI_UNDERWEIGHT_BELOW) return 'underweight';
    if (ageBand === '65+' && (bmi === null || bmi < BMI_OBESITY_FROM)) return 'olderAdult';
    if (needsBody && bmi === null) return 'bodyUnknown';
    return null;
  };

  // A person-set figure: accepted in range and at or above the floor; and, where a safeguard would
  // hold the guide at maintenance, only when it is not below maintenance.
  let customRefused: CustomRefusal | null = null;
  let customOk = false;
  if (customEnergyKcal !== undefined) {
    const verdict = checkCustomEnergy(customEnergyKcal, sex);
    if (verdict !== 'ok') customRefused = verdict;
    else {
      const held = complete ? holdReason(goal === 'lose') : null;
      if (held !== null && maintenance !== null && customEnergyKcal < maintenance) {
        customRefused = held;
      } else customOk = true;
    }
  }
  if (!complete && !customOk) {
    return {
      targets: EU_REFERENCE_INTAKES,
      personal: false,
      explanation: { ...referenceExplanation(inputs), customRefused },
    };
  }

  const referenceKg = (s: 'male' | 'female' | 'unspecified'): number =>
    s === 'unspecified'
      ? (REFERENCE_WEIGHT_KG.male + REFERENCE_WEIGHT_KG.female) / 2
      : REFERENCE_WEIGHT_KG[s];
  const floor = floorFor(sex);
  let energyKcal: number;
  let adjustment = 0;
  let flooredAt: number | null = null;
  let notice: GuideNotice | null = null;
  const chosenPace = pace ?? DEFAULT_PACE;
  if (customOk) {
    energyKcal = customEnergyKcal as number;
    if (goal === 'lose') notice = complete ? holdReason(true) : null;
  } else {
    const base = maintenance as number;
    energyKcal = base;
    if (goal === 'lose') {
      const held = holdReason(true);
      if (held !== null) notice = held;
      else {
        // Never more than 25 % of maintenance, floored to the 50 below so the cap itself is respected.
        const deficit = Math.min(
          DEFICIT_KCAL_BY_PACE[chosenPace],
          Math.floor((base * MAX_DEFICIT_SHARE) / ENERGY_STEP_KCAL) * ENERGY_STEP_KCAL,
        );
        const target = roundTo(base - deficit, ENERGY_STEP_KCAL);
        if (target >= floor) {
          energyKcal = target;
          adjustment = target - base;
        } else if (base - floor >= MIN_USEFUL_DEFICIT_KCAL) {
          // A useful part of the deficit still fits above the floor: the guide is the floor.
          energyKcal = Math.ceil(floor / ENERGY_STEP_KCAL) * ENERGY_STEP_KCAL;
          adjustment = energyKcal - base;
          flooredAt = floor;
        } else {
          // Maintenance is at (or within a gentle step of) the floor: no useful deficit fits. Stay at maintenance.
          flooredAt = floor;
          notice = 'belowFloor';
        }
      }
    } else if (goal === 'gain') {
      if (bmi === null) notice = 'bodyUnknown';
      else if (bmi >= BMI_OBESITY_FROM) notice = 'noSurplus';
      else {
        adjustment = SURPLUS_KCAL_BY_PACE[chosenPace];
        energyKcal = base + adjustment;
      }
    }
    // Never below the floor, whatever the goal.
    if (energyKcal < floor) {
      energyKcal = Math.ceil(floor / ENERGY_STEP_KCAL) * ENERGY_STEP_KCAL;
      flooredAt = floor;
      adjustment = energyKcal - base;
    }
  }
  // A refused custom figure always shows the reason that held the guide.
  if (
    notice === null &&
    customRefused !== null &&
    customRefused !== 'belowFloor' &&
    customRefused !== 'outOfRange'
  ) {
    notice = customRefused;
  }
  const raisedByFloor =
    !customOk && flooredAt !== null && maintenance !== null && energyKcal > maintenance;

  // Protein: on the actual weight; the reference weight when none is known. With a height and a BMI
  // above 30, on the weight at BMI 25. With NO height, on the actual weight capped at the weight of
  // BMI 30 at the sex's reference stature (the mean of both for "unspecified"), so a large weight
  // without a height cannot inflate it. Then bounded (PROTEIN_MIN_G, PROTEIN_MAX_G, 30 % of energy).
  const reference = referenceKg(sex ?? 'unspecified');
  const weightAtBmi30 = (s: 'male' | 'female'): number =>
    BMI_OBESITY_FROM * REFERENCE_HEIGHT_M[s] ** 2;
  const capKg =
    sex === 'male' || sex === 'female'
      ? weightAtBmi30(sex)
      : (weightAtBmi30('male') + weightAtBmi30('female')) / 2;
  const onBmi25 =
    weight !== undefined && heightCm !== undefined && bmi !== null && bmi > BMI_OBESITY_FROM;
  const proteinCapped = weight !== undefined && heightCm === undefined && weight > capKg;
  const proteinBasisKg = onBmi25
    ? PROTEIN_REFERENCE_BMI * ((heightCm as number) / 100) ** 2
    : weight === undefined
      ? reference
      : proteinCapped
        ? capKg
        : weight;
  const proteinGPerKg =
    adjustment < 0
      ? PROTEIN_G_PER_KG_DEFICIT
      : ageBand === '65+'
        ? PROTEIN_G_PER_KG_OLDER
        : PROTEIN_G_PER_KG;
  const protein = Math.min(
    Math.max(Math.round(proteinGPerKg * proteinBasisKg), PROTEIN_MIN_G),
    PROTEIN_MAX_G,
    // Leave room for rounding: carbohydrate stays at 35 % of energy or more.
    Math.floor(energyKcal * (PROTEIN_MAX_ENERGY_SHARE / 4) - 0.5),
  );
  const fat = Math.round((energyKcal * FAT_SHARE) / 9);
  // Carbohydrate is what remains of the energy after fat and protein.
  const carbohydrate = Math.max(0, Math.round((energyKcal * (1 - FAT_SHARE) - protein * 4) / 4));
  const targets: DailyTargets = Object.freeze({
    energyKcal,
    fat,
    saturatedFat: Math.round((energyKcal * SATURATED_FAT_SHARE) / 9),
    carbohydrate,
    sugars: Math.round((EU_REFERENCE_INTAKES.sugars * energyKcal) / 2000),
    protein,
    fibre: FIBRE_G,
    salt: EU_REFERENCE_INTAKES.salt,
  });
  return {
    targets,
    personal: true,
    explanation: {
      basis: customOk ? 'custom' : 'personal',
      equation: complete ? equation : null,
      restingKcal: resting === null ? null : roundTo(resting, 10),
      pal: palUsed,
      maintenanceKcal: maintenance,
      adjustmentKcal: adjustment,
      pace: goal === 'lose' || goal === 'gain' ? chosenPace : null,
      flooredAt,
      raisedByFloor,
      notice,
      customRefused,
      inputs,
      proteinGPerKg,
      proteinBasisKg: Math.round(proteinBasisKg * 10) / 10,
      proteinOnBmi25: onBmi25,
      proteinCapped,
      accuracyPercent: ESTIMATE_ACCURACY_PERCENT,
    },
  };
}

/**
 * Whether a person-set daily energy figure would be used for this profile and weight: `'ok'`, or
 * why not (out of range, below the floor, or the safeguard that holds the guide at maintenance).
 * The form uses it to refuse a figure with a calm explanation; the guide ignores a refused one.
 */
export function customEnergyVerdict(
  kcal: number,
  profile: Profile | undefined,
  weightKg?: number,
): 'ok' | CustomRefusal {
  const basic = checkCustomEnergy(kcal, profile?.sex);
  if (basic !== 'ok') return basic;
  return (
    dailyGuideFor({ ...profile, customEnergyKcal: kcal }, weightKg).explanation.customRefused ??
    'ok'
  );
}

/** The daily guide's numbers (the EU reference intakes, identity-equal, when it is not personal). */
export const dailyTargetsFor = (profile?: Profile, weightKg?: number): DailyTargets =>
  dailyGuideFor(profile, weightKg).targets;
