import { describe, expect, it } from 'vitest';
import {
  ACTIVITIES,
  AGE_BANDS,
  EU_REFERENCE_INTAKES,
  ENERGY_FLOOR_KCAL,
  GOALS,
  MAX_ALLERGY_TAGS,
  PACES,
  checkCustomEnergy,
  customEnergyVerdict,
  dailyGuideFor,
  SEXES,
  dailyTargetsFor,
  sanitizeProfile,
  type Profile,
} from '../src';

const full = (over: Partial<Profile> = {}): Profile => ({
  sex: 'female',
  ageBand: '30-49',
  activity: 'moderate',
  ...over,
});

describe('dailyTargetsFor', () => {
  it('is the EU reference intakes without a profile or with missing fields', () => {
    expect(dailyTargetsFor()).toEqual(EU_REFERENCE_INTAKES);
    expect(dailyTargetsFor({})).toEqual(EU_REFERENCE_INTAKES);
    expect(dailyTargetsFor({ sex: 'male', ageBand: '18-29' })).toEqual(EU_REFERENCE_INTAKES);
    expect(dailyTargetsFor({ sex: 'male', activity: 'high' })).toEqual(EU_REFERENCE_INTAKES);
    expect(dailyTargetsFor({ ageBand: '65+', activity: 'low' })).toEqual(EU_REFERENCE_INTAKES);
    // A goal alone changes nothing.
    expect(dailyTargetsFor({ goal: 'lose', diet: 'vegan' })).toEqual(EU_REFERENCE_INTAKES);
  });

  it('gives known energy values, rounded to 50 kcal', () => {
    const kcal = (p: Profile) => dailyTargetsFor(p).energyKcal;
    expect(kcal(full())).toBe(KNOWN.femaleMid);
    expect(kcal({ sex: 'male', ageBand: '18-29', activity: 'high' })).toBe(KNOWN.maleYoungHigh);
    expect(kcal({ sex: 'female', ageBand: '65+', activity: 'low' })).toBe(KNOWN.femaleOldLow);
    for (const sex of SEXES)
      for (const ageBand of AGE_BANDS)
        for (const activity of ACTIVITIES) expect(kcal({ sex, ageBand, activity }) % 50).toBe(0);
  });

  it('derives the macros from energy: fat 35 %, saturates 10 %, carbohydrate the remainder, fixed fibre and salt', () => {
    const t = dailyTargetsFor(full());
    expect(t.fat).toBe(Math.round((t.energyKcal * 0.35) / 9));
    expect(t.saturatedFat).toBe(Math.round((t.energyKcal * 0.1) / 9));
    // Carbohydrate is what is left of the energy after fat and protein.
    expect(t.carbohydrate).toBe(Math.round((t.energyKcal * 0.65 - t.protein * 4) / 4));
    expect(t.sugars).toBe(Math.round((90 * t.energyKcal) / 2000));
    expect(t.fibre).toBe(25);
    expect(t.salt).toBe(6);
    // The energy of the macros adds up to the guide (within rounding).
    const sum = t.fat * 9 + t.carbohydrate * 4 + t.protein * 4;
    expect(Math.abs(sum - t.energyKcal)).toBeLessThan(15);
  });

  it('protein without a weight follows the EFSA PRI x reference weight; it rises at 65+ and with a deficit', () => {
    expect(dailyTargetsFor(full()).protein).toBe(49); // 0.83 x 58.5
    expect(dailyTargetsFor(full({ sex: 'male' })).protein).toBe(57); // 0.83 x 68.1
    expect(dailyTargetsFor(full({ sex: 'unspecified' })).protein).toBe(53); // 0.83 x 63.3
    expect(dailyTargetsFor(full({ goal: 'gain' })).protein).toBe(49);
    expect(dailyTargetsFor(full({ ageBand: '65+', goal: 'maintain' })).protein).toBe(59); // 1.0 x 58.5
    // 1.2 x 60 kg when a deficit really applies (BMI known); without a height it is held at maintenance.
    expect(dailyGuideFor(full({ goal: 'lose', heightCm: 165 }), 60).targets.protein).toBe(72);
    expect(dailyTargetsFor(full({ goal: 'lose' })).protein).toBe(49);
  });

  it('a body weight makes the energy and the protein personal', () => {
    const none = dailyTargetsFor(full());
    const heavier = dailyTargetsFor(full(), 80);
    expect(heavier.energyKcal).toBeGreaterThan(none.energyKcal);
    expect(heavier.protein).toBe(Math.round(0.83 * 80));
    // Weight-only: Henry (2005) 30-59 female, (9.74 x 80 + 694) x 1.6 = 2365 -> 2350.
    expect(heavier.energyKcal).toBe(2350);
  });

  it('weight and height use the weight-and-height equations', () => {
    // Female 30-59: 8.18 x 70 + 502 x 1.65 - 11.6 = 1389.3; x 1.6 = 2223 -> 2200.
    const g = dailyGuideFor(full({ heightCm: 165 }), 70);
    expect(g.explanation.equation).toBe('weightHeight');
    expect(g.targets.energyKcal).toBe(2200);
    expect(g.explanation.inputs.bmi).toBe(25.7);
    expect(dailyGuideFor(full({ heightCm: 165 })).explanation.equation).toBe('referenceWeight');
    expect(dailyGuideFor(full(), 70).explanation.equation).toBe('weightOnly');
    expect(dailyGuideFor(full()).explanation.inputs.defaults).toEqual(['weight', 'height']);
  });

  it('a standard-pace loss is 500 kcal below maintenance, never more than 25 %, rounded to 50', () => {
    const profile = full({ goal: 'lose', pace: 'standard', heightCm: 165 });
    const base = dailyGuideFor(full({ heightCm: 165 }), 80).targets.energyKcal;
    const lose = dailyGuideFor(profile, 80);
    expect(lose.targets.energyKcal).toBe(base - 500);
    expect(lose.explanation.adjustmentKcal).toBe(-500);
    expect(lose.explanation.maintenanceKcal).toBe(base);
    expect(lose.explanation.notice).toBeNull();
    expect(lose.targets.energyKcal % 50).toBe(0);
    // Gentle is the default pace; faster is -750.
    expect(dailyGuideFor(full({ goal: 'lose', heightCm: 165 }), 80).targets.energyKcal).toBe(
      base - 250,
    );
    // Faster is -750 unless that is more than 25 % of maintenance (2350 -> 600).
    expect(
      dailyGuideFor(full({ goal: 'lose', pace: 'faster', heightCm: 165 }), 80).targets.energyKcal,
    ).toBe(base - Math.min(750, Math.floor((base * 0.25) / 50) * 50));
    const big = dailyGuideFor(
      { sex: 'male', ageBand: '30-49', activity: 'high', heightCm: 185 },
      95,
    );
    const bigLoss = dailyGuideFor(
      {
        sex: 'male',
        ageBand: '30-49',
        activity: 'high',
        goal: 'lose',
        pace: 'faster',
        heightCm: 185,
      },
      95,
    );
    expect(big.targets.energyKcal - bigLoss.targets.energyKcal).toBe(750);
    expect(
      dailyGuideFor(full({ goal: 'lose', heightCm: 165 }), 80).explanation.inputs.defaults,
    ).toEqual(['pace']);
    // The cap: a 1700 kcal maintenance cannot lose 750 (25 % = 425 -> 450).
    const small = dailyGuideFor(
      {
        sex: 'male',
        ageBand: '30-49',
        activity: 'low',
        goal: 'lose',
        pace: 'faster',
        heightCm: 170,
      },
      60,
    );
    const smallBase = dailyGuideFor(
      { sex: 'male', ageBand: '30-49', activity: 'low', heightCm: 170 },
      60,
    ).targets.energyKcal;
    expect(smallBase - small.targets.energyKcal).toBeLessThanOrEqual(
      Math.floor((smallBase * 0.25) / 50) * 50,
    );
  });

  it('a gain adds 250 kcal (400 at the faster pace); maintain and eat better add nothing', () => {
    const h = { heightCm: 165 };
    const base = dailyGuideFor(full(h), 60).targets.energyKcal;
    expect(dailyGuideFor(full({ goal: 'gain', ...h }), 60).targets.energyKcal).toBe(base + 250);
    expect(
      dailyGuideFor(full({ goal: 'gain', pace: 'standard', ...h }), 60).targets.energyKcal,
    ).toBe(base + 250);
    expect(dailyGuideFor(full({ goal: 'gain', pace: 'faster', ...h }), 60).targets.energyKcal).toBe(
      base + 400,
    );
    expect(dailyGuideFor(full({ goal: 'eatBetter', ...h }), 60).targets.energyKcal).toBe(base);
    expect(dailyGuideFor(full({ goal: 'maintain', ...h }), 60).targets.energyKcal).toBe(base);
  });

  it('never goes below the floor: 1500 kcal (male, unspecified) or 1200 kcal (female), and says so', () => {
    const female = dailyGuideFor(
      { sex: 'female', ageBand: '30-49', activity: 'low', goal: 'lose', pace: 'faster' },
      50,
    );
    expect(female.targets.energyKcal).toBeGreaterThanOrEqual(1200);
    const male = dailyGuideFor(
      { sex: 'male', ageBand: '30-49', activity: 'low', goal: 'lose', pace: 'faster' },
      62,
    );
    expect(male.targets.energyKcal).toBeGreaterThanOrEqual(1500);
    for (const sex of SEXES) {
      for (const ageBand of AGE_BANDS) {
        for (const activity of ACTIVITIES) {
          for (const goal of GOALS) {
            for (const pace of PACES) {
              const g = dailyGuideFor({ sex, ageBand, activity, goal, pace }, 50);
              expect(g.targets.energyKcal).toBeGreaterThanOrEqual(ENERGY_FLOOR_KCAL[sex]);
            }
          }
        }
      }
    }
  });

  it('reports flooredAt when a useful part of the deficit still fits above the floor', () => {
    // Female 18-29, low activity, 42 kg, 150 cm (BMI 18.7): maintenance (10.4 x 42 + 615 x 1.5 - 282)
    // x 1.4 = 1508 -> 1500. A standard pace would be 500, capped at 25 % (350): 1150, below the 1200
    // floor. The guide is the floor.
    const g = dailyGuideFor(
      {
        sex: 'female',
        ageBand: '18-29',
        activity: 'low',
        goal: 'lose',
        pace: 'standard',
        heightCm: 150,
      },
      42,
    );
    expect(g.explanation.maintenanceKcal).toBe(1500);
    expect(g.targets.energyKcal).toBe(1200);
    expect(g.explanation.flooredAt).toBe(1200);
    expect(g.explanation.notice).toBeNull();
    expect(g.explanation.adjustmentKcal).toBe(-300);
    expect(g.explanation.raisedByFloor).toBe(false);
  });

  it('holds at maintenance with a notice when the floor leaves no useful room below it', () => {
    // Male 30-49, low activity, 45 kg, 140 cm (BMI 23): maintenance (11.4 x 45 + 541 x 1.4 - 137) x 1.4
    // = 1587 -> 1600, 100 above the 1500 floor.
    const g = dailyGuideFor(
      {
        sex: 'male',
        ageBand: '30-49',
        activity: 'low',
        goal: 'lose',
        pace: 'standard',
        heightCm: 140,
      },
      45,
    );
    expect(g.explanation.maintenanceKcal).toBe(1600);
    expect(g.targets.energyKcal).toBe(1600);
    expect(g.explanation.notice).toBe('belowFloor');
    expect(g.explanation.flooredAt).toBe(1500);
    expect(g.explanation.adjustmentKcal).toBe(0);
    expect(g.explanation.raisedByFloor).toBe(false);
    // No deficit protein either.
    expect(g.explanation.proteinGPerKg).toBe(0.83);
  });

  it('safeguards: lose with BMI under 18.5 stays at maintenance with a notice', () => {
    const p = full({ goal: 'lose', pace: 'standard', heightCm: 170 });
    const g = dailyGuideFor(p, 50); // BMI 17.3
    const maintain = dailyGuideFor(full({ heightCm: 170 }), 50);
    expect(g.explanation.notice).toBe('underweight');
    expect(g.targets.energyKcal).toBe(maintain.targets.energyKcal);
    expect(g.explanation.adjustmentKcal).toBe(0);
    expect(g.targets.protein).toBe(maintain.targets.protein); // no deficit protein either
  });

  it('safeguards: pregnant or breastfeeding stays at maintenance with a notice', () => {
    const g = dailyGuideFor(full({ goal: 'lose', pregnantOrBreastfeeding: true }), 70);
    expect(g.explanation.notice).toBe('pregnancyBreastfeeding');
    expect(g.explanation.adjustmentKcal).toBe(0);
  });

  it('safeguards: 65 and over, BMI under 30 or unknown, stays at maintenance; BMI 30+ may lose', () => {
    const older = {
      sex: 'female',
      ageBand: '65+',
      activity: 'moderate',
      goal: 'lose',
      heightCm: 160,
    } as const;
    expect(dailyGuideFor(older, 60).explanation.notice).toBe('olderAdult');
    expect(dailyGuideFor(older).explanation.notice).toBe('olderAdult');
    const heavy = dailyGuideFor(older, 90); // BMI 35.2
    expect(heavy.explanation.notice).toBeNull();
    expect(heavy.explanation.adjustmentKcal).toBeLessThan(0);
  });

  it('safeguards: gain with BMI 30 or more adds no surplus', () => {
    const g = dailyGuideFor(full({ goal: 'gain', heightCm: 165 }), 90);
    expect(g.explanation.notice).toBe('noSurplus');
    expect(g.explanation.adjustmentKcal).toBe(0);
  });

  it('protein is computed on the weight at BMI 25 when BMI is above 30 and the height is known', () => {
    const g = dailyGuideFor(full({ heightCm: 165 }), 100); // BMI 36.7
    expect(g.explanation.proteinOnBmi25).toBe(true);
    expect(g.targets.protein).toBe(Math.round(0.83 * 25 * 1.65 * 1.65));
    // No height: the actual weight, capped at the weight of BMI 30 at the reference stature (1.63 m).
    expect(dailyGuideFor(full(), 100).targets.protein).toBe(Math.round(0.83 * 30 * 1.63 ** 2));
    expect(dailyGuideFor(full(), 100).explanation.proteinCapped).toBe(true);
    expect(dailyGuideFor(full(), 70).targets.protein).toBe(58);
    expect(dailyGuideFor(full(), 70).explanation.proteinCapped).toBe(false);
  });

  it('a person-set energy figure is the guide; one below the floor is refused and ignored', () => {
    const own = dailyGuideFor(full({ customEnergyKcal: 1800 }), 70);
    expect(own.targets.energyKcal).toBe(1800);
    expect(own.explanation.basis).toBe('custom');
    expect(own.personal).toBe(true);
    const low = dailyGuideFor(full({ customEnergyKcal: 1000 }), 70);
    expect(low.explanation.customRefused).toBe('belowFloor');
    expect(low.targets.energyKcal).toBe(dailyGuideFor(full(), 70).targets.energyKcal);
    expect(checkCustomEnergy(1199, 'female')).toBe('belowFloor');
    expect(checkCustomEnergy(1200, 'female')).toBe('ok');
    expect(checkCustomEnergy(1499, 'male')).toBe('belowFloor');
    expect(checkCustomEnergy(1499, undefined)).toBe('belowFloor');
    expect(checkCustomEnergy(700, 'male')).toBe('outOfRange');
    expect(checkCustomEnergy(6001, 'male')).toBe('outOfRange');
    // Without sex, age band and activity a valid figure still makes the guide personal.
    expect(dailyGuideFor({ customEnergyKcal: 2100 }).targets.energyKcal).toBe(2100);
  });

  it('explains itself: inputs, defaults, the estimate accuracy', () => {
    const e = dailyGuideFor(
      full({ goal: 'lose', pace: 'standard', heightCm: 165 }),
      70,
    ).explanation;
    expect(e.basis).toBe('personal');
    expect(e.restingKcal).toBeGreaterThan(1000);
    expect(e.pal).toBe(1.6);
    expect(e.accuracyPercent).toBe(10);
    expect(e.inputs.weightKg).toBe(70);
    expect(e.inputs.defaults).toEqual([]);
    expect(dailyGuideFor().explanation.basis).toBe('reference');
  });

  it('unspecified sex is the average of both sexes', () => {
    for (const ageBand of AGE_BANDS) {
      for (const activity of ACTIVITIES) {
        const f = dailyTargetsFor({ sex: 'female', ageBand, activity }).energyKcal;
        const m = dailyTargetsFor({ sex: 'male', ageBand, activity }).energyKcal;
        const u = dailyTargetsFor({ sex: 'unspecified', ageBand, activity }).energyKcal;
        expect(Math.abs(u - (f + m) / 2)).toBeLessThanOrEqual(50);
      }
    }
  });

  it('is monotonic in activity (four levels) and within a plausible adult range', () => {
    for (const sex of SEXES) {
      for (const ageBand of AGE_BANDS) {
        const [a, b, c, d] = ACTIVITIES.map(
          (activity) => dailyTargetsFor({ sex, ageBand, activity }).energyKcal,
        );
        expect(a).toBeLessThan(b ?? 0);
        expect(b).toBeLessThan(c ?? 0);
        expect(c).toBeLessThan(d ?? 0);
        expect(a).toBeGreaterThanOrEqual(1500);
        expect(d).toBeLessThanOrEqual(3400);
      }
    }
  });

  it('every combination is frozen with finite positive values', () => {
    for (const sex of SEXES)
      for (const ageBand of AGE_BANDS)
        for (const activity of ACTIVITIES)
          for (const goal of GOALS) {
            const t = dailyTargetsFor({ sex, ageBand, activity, goal });
            expect(Object.isFrozen(t)).toBe(true);
            for (const v of Object.values(t)) expect(v).toBeGreaterThan(0);
          }
  });
});

describe('safeguards need a KNOWN body (a deficit: BMI known and at least 18.5)', () => {
  const held = (p: Profile, kg?: number) => {
    const g = dailyGuideFor(p, kg);
    const maintenance = dailyGuideFor({ ...p, goal: 'maintain' }, kg).targets.energyKcal;
    return { g, maintenance };
  };

  it('no height (or no weight) with the goal to lose holds at maintenance with a notice', () => {
    for (const p of [
      full({ goal: 'lose', pace: 'faster' }),
      full({ goal: 'lose', heightCm: 165 }),
    ]) {
      const { g, maintenance } = held(p, p.heightCm === undefined ? 70 : undefined);
      expect(g.explanation.notice).toBe('bodyUnknown');
      expect(g.explanation.adjustmentKcal).toBe(0);
      expect(g.targets.energyKcal).toBe(maintenance);
      expect(g.explanation.proteinGPerKg).toBe(0.83);
    }
  });

  it('the three underweight examples without a height are held at maintenance', () => {
    const cases: [Profile, number][] = [
      [{ sex: 'female', ageBand: '18-29', activity: 'low', goal: 'lose', pace: 'standard' }, 40],
      [{ sex: 'female', ageBand: '30-49', activity: 'moderate', goal: 'lose', pace: 'faster' }, 42],
      [{ sex: 'male', ageBand: '18-29', activity: 'moderate', goal: 'lose', pace: 'faster' }, 48],
    ];
    for (const [p, kg] of cases) {
      const { g, maintenance } = held(p, kg);
      expect(g.explanation.notice).toBe('bodyUnknown');
      expect(g.targets.energyKcal).toBe(maintenance);
      expect(g.targets.energyKcal).toBeGreaterThan(ENERGY_FLOOR_KCAL[p.sex ?? 'unspecified'] - 1);
    }
  });

  it('a surplus needs a known BMI under 30: unknown holds, 30 or more holds', () => {
    const base = dailyGuideFor(full(), 60).targets.energyKcal;
    const unknown = dailyGuideFor(full({ goal: 'gain' }), 60);
    expect(unknown.explanation.notice).toBe('bodyUnknown');
    expect(unknown.targets.energyKcal).toBe(base);
    const known = dailyGuideFor(full({ goal: 'gain', heightCm: 170 }), 60);
    expect(known.explanation.notice).toBeNull();
    expect(known.explanation.adjustmentKcal).toBe(250);
  });
});

describe('a custom figure never overrides a safeguard below maintenance', () => {
  const cases: [string, Profile, number | undefined][] = [
    [
      'pregnant or breastfeeding',
      full({ goal: 'lose', pregnantOrBreastfeeding: true, heightCm: 165 }),
      70,
    ],
    ['underweight', full({ goal: 'lose', heightCm: 170 }), 50],
    ['65 and over', full({ ageBand: '65+', goal: 'lose', heightCm: 165 }), 62],
    ['BMI unknown', full({ goal: 'lose' }), 70],
  ];
  for (const [name, base, kg] of cases) {
    it(`${name}: below maintenance is refused and ignored; at or above is accepted`, () => {
      const plain = dailyGuideFor(base, kg);
      const maintenance = plain.explanation.maintenanceKcal as number;
      const lower = Math.max(maintenance - 200, ENERGY_FLOOR_KCAL.female);
      expect(lower).toBeLessThan(maintenance);
      const refused = dailyGuideFor({ ...base, customEnergyKcal: lower }, kg);
      expect(refused.explanation.customRefused).toBe(plain.explanation.notice);
      expect(refused.explanation.basis).toBe('personal');
      expect(refused.explanation.notice).toBe(plain.explanation.notice);
      expect(refused.targets).toEqual(plain.targets);
      expect(customEnergyVerdict(lower, base, kg)).toBe(plain.explanation.notice);
      const accepted = dailyGuideFor({ ...base, customEnergyKcal: maintenance + 100 }, kg);
      expect(accepted.explanation.customRefused).toBeNull();
      expect(accepted.targets.energyKcal).toBe(maintenance + 100);
      expect(accepted.explanation.notice).toBe(plain.explanation.notice);
      expect(customEnergyVerdict(maintenance, base, kg)).toBe('ok');
    });
  }

  it('outside the safeguards a figure at or above the floor is accepted', () => {
    const p = full({ goal: 'lose', heightCm: 165, customEnergyKcal: 1300 });
    const g = dailyGuideFor(p, 70);
    expect(g.explanation.customRefused).toBeNull();
    expect(g.targets.energyKcal).toBe(1300);
    expect(customEnergyVerdict(1300, p, 70)).toBe('ok');
    expect(customEnergyVerdict(1100, p, 70)).toBe('belowFloor');
    expect(customEnergyVerdict(7000, p, 70)).toBe('outOfRange');
  });

  it('a man cannot be held by the pregnancy flag, and a stored flag is not kept for him', () => {
    const p = full({ sex: 'male', goal: 'lose', heightCm: 175, pregnantOrBreastfeeding: true });
    expect(dailyGuideFor(p, 85).explanation.notice).toBeNull();
    expect(dailyGuideFor(p, 85).explanation.adjustmentKcal).toBeLessThan(0);
    expect(sanitizeProfile({ sex: 'male', pregnantOrBreastfeeding: true })).toEqual({
      sex: 'male',
    });
    expect(sanitizeProfile({ sex: 'female', pregnantOrBreastfeeding: true })).toEqual({
      sex: 'female',
      pregnantOrBreastfeeding: true,
    });
  });
});

describe('floors, caps and the 50-64 band', () => {
  it('the deficit cap is floored to the 50 below, so it never exceeds 25 %', () => {
    for (let kg = 45; kg <= 130; kg += 1) {
      for (const sex of ['female', 'male'] as const) {
        for (const pace of PACES) {
          const p: Profile = {
            sex,
            ageBand: '30-49',
            activity: 'low',
            heightCm: 170,
            goal: 'lose',
            pace,
          };
          const g = dailyGuideFor(p, kg);
          const m = g.explanation.maintenanceKcal as number;
          if (g.explanation.adjustmentKcal < 0 && g.explanation.flooredAt === null) {
            expect(-g.explanation.adjustmentKcal).toBeLessThanOrEqual(m * 0.25);
          }
        }
      }
    }
  });

  it('when the floor lifts the guide above maintenance it says so, whatever the goal', () => {
    const base = {
      sex: 'male',
      ageBand: '50-64',
      activity: 'low',
      heightCm: 135,
    } as const;
    for (const goal of ['maintain', 'eatBetter', 'lose'] as const) {
      const g = dailyGuideFor({ ...base, goal }, 35);
      expect(g.explanation.maintenanceKcal).toBeLessThan(1500);
      expect(g.targets.energyKcal).toBe(1500);
      expect(g.explanation.raisedByFloor).toBe(true);
      expect(g.explanation.flooredAt).toBe(1500);
    }
    expect(dailyGuideFor({ ...base, goal: 'lose' }, 35).explanation.notice).toBe('belowFloor');
    expect(dailyGuideFor({ ...base, goal: 'maintain' }, 35).explanation.notice).toBeNull();
  });

  it('50-64 is the mean of Henry 30-59 and 60+ (weight-only and weight-and-height)', () => {
    const e = (ageBand: NonNullable<Profile['ageBand']>, heightCm?: number) =>
      dailyGuideFor(
        { sex: 'female', ageBand, activity: 'moderate', ...(heightCm ? { heightCm } : {}) },
        70,
      ).explanation.restingKcal as number;
    expect(Math.abs(e('50-64') - (e('30-49') + e('65+')) / 2)).toBeLessThanOrEqual(10);
    expect(Math.abs(e('50-64', 165) - (e('30-49', 165) + e('65+', 165)) / 2)).toBeLessThanOrEqual(
      10,
    );
    // Female weight-only: (9.74 x 70 + 694 + 10.1 x 70 + 569) / 2 = 1325.
    expect(e('50-64')).toBe(1330);
  });
});

describe('protein stays plausible over every weight', () => {
  const heights = [undefined, 100, 150, 165, 185, 220, 250] as const;
  it('is at most 2 g per kg of actual weight and 160 g, at least 40 g, with carbohydrate at 35 % of energy or more', () => {
    for (const sex of SEXES) {
      for (const ageBand of AGE_BANDS) {
        for (const goal of GOALS) {
          for (const heightCm of heights) {
            for (let kg = 40; kg <= 400; kg += 10) {
              const g = dailyGuideFor(
                {
                  sex,
                  ageBand,
                  activity: 'moderate',
                  goal,
                  pace: 'faster',
                  ...(heightCm ? { heightCm } : {}),
                },
                kg,
              );
              const t = g.targets;
              expect(t.protein).toBeLessThanOrEqual(2 * kg);
              expect(t.protein).toBeLessThanOrEqual(160);
              expect(t.protein).toBeGreaterThanOrEqual(40);
              expect(t.carbohydrate * 4).toBeGreaterThanOrEqual(0.35 * t.energyKcal);
            }
          }
        }
      }
    }
  });

  it('300 kg without a height is capped at the weight of BMI 30 (about 110 g at most from the base rule)', () => {
    const g = dailyGuideFor(full(), 300);
    expect(g.explanation.proteinCapped).toBe(true);
    expect(g.targets.protein).toBe(Math.round(0.83 * 30 * 1.63 ** 2));
    const m = dailyGuideFor(full({ sex: 'male', ageBand: '65+' }), 300);
    expect(m.targets.protein).toBe(Math.round(1.0 * 30 * 1.76 ** 2));
    expect(m.targets.protein).toBeLessThanOrEqual(120);
    const u = dailyGuideFor(full({ sex: 'unspecified' }), 300);
    expect(u.explanation.proteinBasisKg).toBe(
      Math.round(((30 * 1.76 ** 2 + 30 * 1.63 ** 2) / 2) * 10) / 10,
    );
  });
});

// Filled from the computed table (Henry 2005 BMR at EFSA reference weights x PAL, 50 kcal).
const KNOWN = { femaleMid: 2000, maleYoungHigh: 2950, femaleOldLow: 1600 };

describe('sanitizeProfile', () => {
  it('keeps known values and drops the rest', () => {
    expect(
      sanitizeProfile({
        ageBand: '30-49',
        sex: 'male',
        activity: 'high',
        goal: 'lose',
        diet: 'vegan',
        allergies: ['peanut'],
        name: 'Ada',
        weight: 70,
        birthDate: '1990-01-01',
      }),
    ).toEqual({
      ageBand: '30-49',
      sex: 'male',
      activity: 'high',
      goal: 'lose',
      diet: 'vegan',
      allergies: ['peanut'],
    });
  });

  it('keeps the schema v5 fields, in range, and still drops the birth date and a weight', () => {
    expect(
      sanitizeProfile({
        heightCm: 172.46,
        units: 'imperial',
        pace: 'standard',
        customEnergyKcal: 2100,
        pregnantOrBreastfeeding: true,
        activity: 'veryHigh',
        birthDate: '1990-01-01',
        weightKg: 70,
      }),
    ).toEqual({
      heightCm: 172.5,
      units: 'imperial',
      pace: 'standard',
      customEnergyKcal: 2100,
      pregnantOrBreastfeeding: true,
      activity: 'veryHigh',
    });
    expect(
      sanitizeProfile({ heightCm: 99, customEnergyKcal: 700, pace: 'fast', units: 'x' }),
    ).toBeUndefined();
    expect(sanitizeProfile({ heightCm: 251 })).toBeUndefined();
    expect(sanitizeProfile({ customEnergyKcal: 6001 })).toBeUndefined();
    expect(sanitizeProfile({ customEnergyKcal: 2000.5 })).toBeUndefined();
    expect(sanitizeProfile({ pregnantOrBreastfeeding: false })).toBeUndefined();
    expect(sanitizeProfile({ heightCm: '170' })).toBeUndefined();
    expect(JSON.stringify(sanitizeProfile({ sex: 'male', birthDate: '1990-01-01' }))).not.toContain(
      'birth',
    );
  });

  it('rejects unknown values and non-objects', () => {
    expect(sanitizeProfile({ ageBand: '12-17', sex: 'x', goal: 7 })).toBeUndefined();
    expect(sanitizeProfile(null)).toBeUndefined();
    expect(sanitizeProfile([])).toBeUndefined();
    expect(sanitizeProfile('x')).toBeUndefined();
    expect(sanitizeProfile({ ageBand: '18-29', diet: 'raw' })).toEqual({ ageBand: '18-29' });
  });

  it('cleans, de-duplicates and caps the allergy tags', () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`);
    expect(sanitizeProfile({ allergies: many })?.allergies).toHaveLength(MAX_ALLERGY_TAGS);
    expect(
      sanitizeProfile({ allergies: [' Peanut ', 'peanut', '', 3, 'x'.repeat(41), 'a\nb'] })
        ?.allergies,
    ).toEqual(['Peanut', 'a b']);
    expect(sanitizeProfile({ allergies: 'peanut' })).toBeUndefined();
  });
});
