import { describe, expect, it } from 'vitest';
import {
  ACTIVITIES,
  AGE_BANDS,
  EU_REFERENCE_INTAKES,
  GOALS,
  MAX_ALLERGY_TAGS,
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

  it('scales the macros from energy', () => {
    const t = dailyTargetsFor(full());
    expect(t.fat).toBe(Math.round((t.energyKcal * 0.35) / 9));
    expect(t.saturatedFat).toBe(Math.round((t.energyKcal * 0.1) / 9));
    expect(t.carbohydrate).toBe(Math.round((t.energyKcal * 0.5) / 4));
    expect(t.sugars).toBe(Math.round((90 * t.energyKcal) / 2000));
    expect(t.fibre).toBe(25);
    expect(t.salt).toBe(6);
  });

  it('protein follows the EFSA PRI x reference weight, not the goal', () => {
    expect(dailyTargetsFor(full()).protein).toBe(49); // 0.83 x 58.5
    expect(dailyTargetsFor(full({ sex: 'male' })).protein).toBe(57); // 0.83 x 68.1
    expect(dailyTargetsFor(full({ sex: 'unspecified' })).protein).toBe(53); // 0.83 x 63.3
    for (const goal of GOALS) expect(dailyTargetsFor(full({ goal })).protein).toBe(49);
  });

  it('adjusts energy 10 % for lose and gain, salt and fibre unchanged', () => {
    const base = dailyTargetsFor(full({ goal: 'maintain' }));
    expect(dailyTargetsFor(full({ goal: 'eatBetter' }))).toEqual(base);
    expect(dailyTargetsFor(full())).toEqual(base);
    const lose = dailyTargetsFor(full({ goal: 'lose' }));
    const gain = dailyTargetsFor(full({ goal: 'gain' }));
    expect(lose.energyKcal).toBe(Math.round((base.energyKcal * 0.9) / 50) * 50);
    expect(gain.energyKcal).toBe(Math.round((base.energyKcal * 1.1) / 50) * 50);
    expect(lose.salt).toBe(6);
    expect(gain.fibre).toBe(25);
  });

  it('never goes below 1500 kcal, even for a loss goal', () => {
    const t = dailyTargetsFor({ sex: 'female', ageBand: '65+', activity: 'low', goal: 'lose' });
    expect(t.energyKcal).toBe(1500);
    expect(t.fat).toBe(58);
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

  it('is monotonic in activity and within a plausible adult range', () => {
    for (const sex of SEXES) {
      for (const ageBand of AGE_BANDS) {
        const [a, b, c] = ACTIVITIES.map(
          (activity) => dailyTargetsFor({ sex, ageBand, activity }).energyKcal,
        );
        expect(a).toBeLessThan(b ?? 0);
        expect(b).toBeLessThan(c ?? 0);
        expect(a).toBeGreaterThanOrEqual(1500);
        expect(c).toBeLessThanOrEqual(3200);
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
