// What the coach's prompts say and what leaves the device, per mode (docs/ai-tiers.md, "Coaching").
// Pins the field lists exactly: a field that is not named here must not be sent.
import { describe, expect, it } from 'vitest';
import {
  buildChatMessages,
  buildNoteMessages,
  buildWeekMessages,
  coachSystemPrompt,
  coarseWeightTrend,
  dailyGuideFor,
  databaseFood,
  gramsQuantity,
  plateLog,
  weeklyReview,
  type PlateLog,
  type Profile,
  type WeightTrendShare,
} from '../src/index';

const at = (n: number, h = 12) => new Date(2026, 9, n, h).getTime();
function plate(id: number, when: number, name: string, kcal = 400): PlateLog {
  return plateLog({
    id,
    loggedAtUtc: when,
    entries: [
      {
        id: 1,
        plateLogId: id,
        databaseFood: databaseFood({
          sourceRef: `t:${id}`,
          displayName: name,
          source: 'manual',
          foodGroup: 'protein',
          nutrientsPer100g: { energyKcal: kcal, protein: 20, salt: 0.5, fibre: 2, sugars: 1 },
        }),
        quantity: gramsQuantity(300),
      },
    ],
  });
}
const plates = [13, 14, 15, 16, 17].flatMap((n, i) => [
  plate(10 + i * 2, at(n, 12), 'Pizza', 400),
  plate(11 + i * 2, at(n, 19), 'Salade', 400),
]);
const profile: Profile = {
  goal: 'lose',
  diet: 'vegetarian',
  allergies: ['arachide'],
  sex: 'female',
  ageBand: '30-49',
  activity: 'moderate',
  heightCm: 165,
};
const guide = dailyGuideFor(profile, 72);
const naming = { nameOf: (f: { displayName: string }) => f.displayName };
const trend: WeightTrendShare = { direction: 'lower', changeKg: 1, overWeeks: 4 };
const doc = (m: readonly { content: string }[], i = 1): Record<string, unknown> => {
  const body = m[i]!.content;
  return JSON.parse(body.slice(body.indexOf('{'))) as Record<string, unknown>;
};

describe('the system prompt follows the goal', () => {
  it('lose: may help, with the limits that stay', () => {
    const p = coachSystemPrompt('chat', 'en', { weightHelp: 'lose' });
    expect(p).toContain('chose the goal of losing weight, so you MAY help');
    expect(p).toContain('0.25 to 0.75 kg a week');
    expect(p).toContain('5 to 10 %');
    expect(p).toMatch(/never set or suggest an intake below their daily guide/);
    expect(p).toMatch(/never recommend fasting, skipping meals, meal replacements, a "detox"/);
    expect(p).toMatch(/exercise to make up for eating/);
    expect(p).toMatch(/never comment on their body/);
    expect(p).toMatch(/under 18/);
    expect(p).toMatch(/plateaus/);
  });

  it('gain mirrors it; no goal keeps the restraint and does not push weight loss', () => {
    expect(coachSystemPrompt('note', 'en', { weightHelp: 'gain' })).toContain(
      'goal of gaining weight',
    );
    for (const options of [{}, { weightHelp: null }] as const) {
      const p = coachSystemPrompt('chat', 'en', options);
      expect(p).toContain('has not chosen a weight goal');
      expect(p).toContain('Do not raise weight loss');
      expect(p).not.toContain('MAY help');
    }
  });

  it('the French prompt says the same, with vouvoiement', () => {
    const p = coachSystemPrompt('chat', 'fr', { weightHelp: 'lose' });
    expect(p).toContain('vous POUVEZ l’y aider');
    expect(p).toContain('0,25 à 0,75 kg par semaine');
    expect(p).toContain('ne jamais fixer ni suggérer un apport inférieur');
    expect(coachSystemPrompt('chat', 'fr')).toContain('n’a pas choisi d’objectif de poids');
  });

  it('the trend and step paragraphs appear only when that data is sent', () => {
    expect(coachSystemPrompt('chat', 'en')).not.toContain('weightTrend');
    expect(coachSystemPrompt('chat', 'en', { trendShared: true })).toContain('"weightTrend"');
    expect(coachSystemPrompt('chat', 'en')).not.toContain('"step"');
    expect(coachSystemPrompt('chat', 'en', { stepShared: true })).toContain('"step"');
  });
});

describe('what a note sends, mode by mode', () => {
  const base = {
    ...naming,
    locale: 'en' as const,
    plate: plates[1]!,
    earlierPlates: [plates[0]!],
    slot: 'dinner' as const,
    targets: guide.targets,
    profile,
  };

  it('numbers on, no step, no trend', () => {
    const d = doc(buildNoteMessages({ ...base, numbersOn: true }));
    expect(Object.keys(d).sort()).toEqual(['daySoFar', 'numbers', 'plate', 'profile', 'slot']);
    expect(Object.keys(d['profile'] as object).sort()).toEqual([
      'activity',
      'ageBand',
      'allergies',
      'diet',
      'goal',
      'sex',
    ]);
    expect(Object.keys(d['daySoFar'] as object).sort()).toEqual([
      'dailyGuide',
      'foods',
      'plates',
      'totals',
    ]);
  });

  it('numbers off: no amounts at all', () => {
    const d = doc(buildNoteMessages({ ...base, numbersOn: false }));
    expect(JSON.stringify(d)).not.toMatch(/kcal|grams|dailyGuide|totals/);
  });

  it('with a step and the trend switch on: exactly those two more fields', () => {
    const d = doc(
      buildNoteMessages({
        ...base,
        numbersOn: true,
        step: { id: 'smallerPortion', at: at(15), food: 'Pizza' },
        weightTrend: trend,
        weightHelp: 'lose',
      }),
    );
    expect(Object.keys(d).sort()).toEqual([
      'daySoFar',
      'numbers',
      'plate',
      'profile',
      'slot',
      'step',
      'weightTrend',
    ]);
    expect(d['step']).toEqual({ id: 'smallerPortion', food: 'Pizza' });
    expect(d['weightTrend']).toEqual({ direction: 'lower', changeKg: 1, overWeeks: 4 });
  });

  it('uses the meal the person filed the plate under', () => {
    const filed = plateLog({ ...plates[0]!, slot: 'dinner' });
    expect(
      doc(
        buildNoteMessages({
          ...base,
          plate: filed,
          earlierPlates: [],
          slot: 'dinner',
          numbersOn: true,
        }),
      )['slot'],
    ).toBe('dinner');
  });
});

describe('what the chat sends, mode by mode', () => {
  const context = {
    ...naming,
    numbersOn: true,
    plates,
    targets: guide.targets,
    profile,
    personalGuide: true,
    weightHelp: 'lose' as const,
  };
  const turns = [{ role: 'user' as const, text: 'how do I lose weight with what I eat?' }];

  it('default switches: the week, the rounded guide, the energy average against it, the top energy foods', () => {
    const d = doc(buildChatMessages({ locale: 'en', context, turns }));
    expect(Object.keys(d).sort()).toEqual([
      'dailyGuide',
      'days',
      'numbers',
      'profile',
      'topEnergyFoods',
      'topFoods',
      'weekEnergy',
    ]);
    const energy = d['weekEnergy'] as { avgKcal: number; guideKcal: number; days: number };
    expect(energy.guideKcal % 100).toBe(0);
    expect(energy.avgKcal % 50).toBe(0);
    expect(energy.days).toBe(5);
    expect(d['topEnergyFoods']).toEqual(['Pizza', 'Salade']);
  });

  it('the weight trend and the step appear only when passed (the caller checks the switches)', () => {
    const off = JSON.stringify(doc(buildChatMessages({ locale: 'en', context, turns })));
    expect(off).not.toContain('weightTrend');
    const on = doc(
      buildChatMessages({
        locale: 'en',
        context: { ...context, weightTrend: trend, step: { id: 'vegAtLunch', at: at(15) } },
        turns,
      }),
    );
    expect(on['weightTrend']).toEqual({ direction: 'lower', changeKg: 1, overWeeks: 4 });
    expect(on['step']).toEqual({ id: 'vegAtLunch' });
  });

  it('never a weigh-in, a height, a BMI or a waist, in any mode', () => {
    const text = buildChatMessages({
      locale: 'en',
      context: { ...context, weightTrend: trend },
      turns,
    })
      .map((m) => m.content)
      .join('\n');
    for (const forbidden of ['heightCm', '165', 'bmi', 'waist', 'weighIn', 'weightKg', '72']) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('with numbers off there is no energy average and no guide', () => {
    const d = doc(
      buildChatMessages({ locale: 'en', context: { ...context, numbersOn: false }, turns }),
    );
    expect(d['weekEnergy']).toBeUndefined();
    expect(d['dailyGuide']).toBeUndefined();
    expect(d['topEnergyFoods']).toBeDefined(); // names only
  });

  it('a non-personal guide is never compared with', () => {
    const d = doc(
      buildChatMessages({ locale: 'en', context: { ...context, personalGuide: false }, turns }),
    );
    expect(d['weekEnergy']).toBeUndefined();
  });
});

describe('what the week paragraph sends', () => {
  const review = weeklyReview({
    plates,
    today: at(20, 9),
    targets: guide.targets,
    goal: { goal: 'lose', guideKcal: guide.targets.energyKcal },
  });
  const input = {
    locale: 'en' as const,
    review,
    targets: guide.targets,
    profile,
    weightHelp: 'lose' as const,
  };

  it('numbers on: the review, the averages, the rounded guide, the energy, the top foods', () => {
    const d = doc(buildWeekMessages({ ...input, numbersOn: true }));
    expect(Object.keys(d).sort()).toEqual([
      'dailyAverages',
      'dailyGuide',
      'daysLogged',
      'daysWithData',
      'daysWithGroup',
      'numbers',
      'profile',
      'ruleBasedReview',
      'topEnergyFoods',
      'weekEnergy',
    ]);
  });

  it('numbers off: neither averages, guide nor energy', () => {
    const d = doc(buildWeekMessages({ ...input, numbersOn: false }));
    expect(Object.keys(d).sort()).toEqual([
      'daysLogged',
      'daysWithData',
      'daysWithGroup',
      'numbers',
      'profile',
      'ruleBasedReview',
      'topEnergyFoods',
    ]);
  });

  it('with the trend switch: one more field', () => {
    const d = doc(buildWeekMessages({ ...input, numbersOn: false, weightTrend: trend }));
    expect(d['weightTrend']).toBeDefined();
  });
});

describe('the coarse weight trend', () => {
  it('rounds to half a kilo, about four weeks only', () => {
    expect(coarseWeightTrend({ days: 28, kg: -0.8, fromKg: 80 })).toEqual({
      direction: 'lower',
      changeKg: 1,
      overWeeks: 4,
    });
    expect(coarseWeightTrend({ days: 28, kg: 0.7, fromKg: 80 })).toEqual({
      direction: 'higher',
      changeKg: 0.5,
      overWeeks: 4,
    });
    expect(coarseWeightTrend({ days: 28, kg: 0.2, fromKg: 80 })?.direction).toBe('steady');
    expect(coarseWeightTrend({ days: 14, kg: -2, fromKg: 80 })).toBeNull();
    expect(coarseWeightTrend({ days: 90, kg: -2, fromKg: 80 })).toBeNull();
    expect(coarseWeightTrend(null)).toBeNull();
  });
});
