// Every sentence the template coach can say that names a food respects the diet and the allergies
// (lot 6, item 2): each template x each diet x each allergen family, in English and French. The
// forbidden words below are written independently of the option table in the core, so a food
// that sneaks into a template string (or into the option table) is caught here.
import { describe, expect, it } from 'vitest';
import {
  coachSuggestionFor,
  databaseFood,
  FOOD_OPTION_IDS,
  FOOD_SLOTS,
  gramsQuantity,
  plateLog,
  slotParams,
  type Diet,
  type Profile,
} from '@anc/core';
import { coachCopy, coachCopyVars, fillFoodSlots, slotText, slotsOfTemplate } from './coach-copy';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import { type Strings } from '../i18n';
import type { Locale } from '../i18n/locale';

const FOLD = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/œ/g, 'oe');

type Family =
  'meat' | 'fish' | 'shellfish' | 'dairy' | 'egg' | 'nuts' | 'peanut' | 'gluten' | 'soy';

const FORBIDDEN: Readonly<Record<Family, readonly string[]>> = {
  meat: [
    'meat',
    'chicken',
    'beef',
    'pork',
    'ham',
    'sausage',
    'bacon',
    'viande',
    'poulet',
    'boeuf',
    'porc',
    'jambon',
    'saucisse',
    'lardons',
  ],
  fish: [
    'fish',
    'tuna',
    'salmon',
    'sardine',
    'sardines',
    'mackerel',
    'poisson',
    'thon',
    'saumon',
    'maquereau',
  ],
  shellfish: [
    'shrimp',
    'prawn',
    'prawns',
    'crab',
    'mussel',
    'mussels',
    'crevette',
    'crevettes',
    'moule',
    'moules',
    'crabe',
  ],
  dairy: [
    'milk',
    'cheese',
    'yogurt',
    'yoghurt',
    'butter',
    'cream',
    'dairy',
    'lait',
    'fromage',
    'yaourt',
    'beurre',
    'creme',
    'laitier',
    'laitiers',
  ],
  egg: ['egg', 'eggs', 'oeuf', 'oeufs', 'omelette'],
  nuts: ['nut', 'nuts', 'almond', 'hazelnut', 'walnut', 'noix', 'amande', 'noisette'],
  peanut: ['peanut', 'peanuts', 'cacahuete', 'cacahuetes', 'arachide'],
  gluten: [
    'bread',
    'pasta',
    'wheat',
    'flour',
    'oats',
    'oat',
    'pain',
    'pates',
    'ble',
    'farine',
    'avoine',
    'flocons',
    'biscuit',
    'cereal',
    'semoule',
    'couscous',
  ],
  soy: ['soy', 'tofu', 'soja'],
};

const DIET_FAMILIES: Readonly<Record<Diet, readonly Family[]>> = {
  omnivore: [],
  pescatarian: ['meat'],
  vegetarian: ['meat', 'fish', 'shellfish'],
  vegan: ['meat', 'fish', 'shellfish', 'dairy', 'egg'],
};

/** An allergy tag a person might type, by family, in both languages. */
const TAGS: Readonly<Record<Family, readonly string[]>> = {
  meat: [],
  fish: ['fish', 'poisson'],
  shellfish: ['shellfish', 'crustacés'],
  dairy: ['milk', 'dairy', 'lactose', 'lait', 'produits laitiers'],
  egg: ['egg', 'oeufs'],
  nuts: ['nuts', 'tree nuts', 'fruits à coque'],
  peanut: ['peanut', 'arachide', 'cacahuète'],
  gluten: ['gluten', 'wheat', 'blé'],
  soy: ['soy', 'soja'],
};
/** A nut allergy also rules out peanut-like foods (documented in the core's family table). */
const IMPLIED: Readonly<Partial<Record<Family, readonly Family[]>>> = { nuts: ['peanut'] };

interface Case {
  readonly name: string;
  readonly profile: Profile;
  readonly blocked: ReadonlySet<Family>;
}

const cases: Case[] = [
  { name: 'omnivore, no allergy', profile: {}, blocked: new Set() },
  ...(Object.keys(DIET_FAMILIES) as Diet[]).map((diet) => ({
    name: `diet ${diet}`,
    profile: { diet } as Profile,
    blocked: new Set(DIET_FAMILIES[diet]),
  })),
  ...(Object.entries(TAGS) as [Family, readonly string[]][]).flatMap(([family, tags]) =>
    tags.map((tag) => ({
      name: `allergy "${tag}"`,
      profile: { allergies: [tag] } as Profile,
      blocked: new Set<Family>([family, ...(IMPLIED[family] ?? [])]),
    })),
  ),
  // A diet and an allergy together.
  {
    name: 'vegetarian + peanut',
    profile: { diet: 'vegetarian', allergies: ['arachide'] },
    blocked: new Set<Family>(['meat', 'fish', 'shellfish', 'peanut']),
  },
  {
    name: 'pescatarian + milk + gluten',
    profile: { diet: 'pescatarian', allergies: ['lait', 'gluten'] },
    blocked: new Set<Family>(['meat', 'dairy', 'gluten']),
  },
];

const LOCALES: readonly [Locale, Strings][] = [
  ['en', en],
  ['fr', fr],
];

/**
 * Templates that only ever appear in a situation the generator rules out, so their wording about a
 * food family is never shown to a person who avoids it (each gate lists the families that switch it
 * off; the core tests pin the gates themselves):
 *  - dairyLight and variedWeek name dairy: not said when the dairy options are all blocked;
 *  - the observations about cured and red meat, fish and nuts only exist for people whose diet and
 *    allergies allow them (core: `qualityObservation`), and a step about fish or nuts likewise.
 */
const GATES: readonly { readonly path: RegExp; readonly blockedBy: readonly Family[] }[] = [
  { path: /dairyLight|positives\.variedWeek/, blockedBy: ['dairy'] },
  {
    path: /\.(?:processedMeatOften|redMeatOften)(?:\.(?:one|other))?$/,
    blockedBy: ['meat', 'fish', 'shellfish'],
  },
  { path: /fishLow|fishWeek/, blockedBy: ['fish', 'shellfish', 'meat'] },
  { path: /nutsNone|nutsWeek/, blockedBy: ['nuts', 'peanut'] },
];

function templatesOf(all: Strings): [string, string][] {
  const out: [string, string][] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') out.push([path, node]);
    else if (node !== null && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(all.coachQuestions, 'coachQuestions');
  walk(all.week.review.positives, 'week.review.positives');
  walk(all.week.review.suggestions, 'week.review.suggestions');
  walk(all.week.review.suggestionsNoNumbers, 'week.review.suggestionsNoNumbers');
  walk(all.week.review.quality, 'week.review.quality');
  walk(all.week.review.stepReview, 'week.review.stepReview');
  walk(all.coachStep.names, 'coachStep.names');
  return out;
}

function render(all: Strings, locale: Locale, template: string, profile: Profile): string {
  const vars: Record<string, string> = {
    ...coachCopyVars(
      {
        food: 'Item',
        food2: 'Item',
        g: 10,
        kcal: 500,
        pct: 20,
        est: 0,
        days: 3,
        of: 5,
        n: 1,
        matched: 2,
        avg: 1900,
        guide: 1900,
      },
      locale,
    ),
    step: 'something',
    share: 'about a fifth',
  };
  return fillFoodSlots(all, template, vars, slotParams(slotsOfTemplate(template), profile), locale);
}

describe('every template that names a food respects the diet and the allergies', () => {
  for (const [locale, all] of LOCALES) {
    const templates = templatesOf(all);

    it(`${locale}: there are templates to check, and the plain case does name foods`, () => {
      expect(templates.length).toBeGreaterThan(100);
      const plain = templates.map(([, t]) => FOLD(render(all, locale, t, {}))).join(' ');
      expect(plain).toMatch(/eggs|oeufs/);
      expect(plain).toMatch(/yogurt|yaourt/);
    });

    for (const c of cases) {
      it(`${locale}: ${c.name}`, () => {
        const offenders: string[] = [];
        for (const [path, template] of templates) {
          const gated = GATES.some(
            (g) => g.path.test(path) && g.blockedBy.some((family) => c.blocked.has(family)),
          );
          if (gated) continue;
          const text = FOLD(render(all, locale, template, c.profile));
          for (const family of c.blocked) {
            for (const word of FORBIDDEN[family]) {
              if (new RegExp(`(?<![a-z])${word}(?![a-z])`).test(text)) {
                offenders.push(`${path} -> "${word}" (${family})`);
              }
            }
          }
        }
        expect(offenders).toEqual([]);
      });
    }
  }

  it('the interface has a word for every option and a phrase for every slot, in both languages', () => {
    for (const [, all] of LOCALES) {
      for (const id of FOOD_OPTION_IDS) expect(all.coachFoods[id]).toBeTruthy();
      for (const slot of FOOD_SLOTS) expect(all.coachSlotFallback[slot]).toBeTruthy();
    }
  });

  it('when every option of a slot is blocked the neutral phrase stands in', () => {
    const vegan: Profile = { diet: 'vegan' };
    expect(slotText(en, 'dairy', slotParams(['dairy'], vegan)['dairy'], 'en')).toBe(
      en.coachSlotFallback.dairy,
    );
    expect(slotText(fr, 'dairy', slotParams(['dairy'], vegan)['dairy'], 'fr')).toBe(
      fr.coachSlotFallback.dairy,
    );
  });

  it('a note reads the same in the other language: the options ride in the stored key', () => {
    const key = 'post.resolve.vegRich?protein=beans.tofu';
    expect(coachCopy(en, key, {}, 'en')).toBe(
      'Lots of veg here. Is there some protein nearby, like beans or tofu?',
    );
    expect(coachCopy(fr, key, {}, 'fr')).toBe(
      'Beaucoup de légumes ici. Auriez-vous des protéines sous la main, comme des haricots ou du tofu ?',
    );
  });

  it('the dairy pattern is not said to someone with no dairy option', () => {
    const lunch = new Date(2026, 8, 3, 12).getTime();
    const plate = plateLog({
      id: 1,
      loggedAtUtc: lunch,
      entries: [
        {
          id: 1,
          plateLogId: 1,
          databaseFood: databaseFood({
            sourceRef: 'x',
            displayName: 'Rice',
            source: 'manual',
            foodGroup: 'starch',
          }),
          quantity: gramsQuantity(100),
        },
      ],
    });
    const earlier = plateLog({
      id: 2,
      loggedAtUtc: lunch - 3_600_000,
      entries: [
        {
          id: 1,
          plateLogId: 2,
          databaseFood: databaseFood({
            sourceRef: 'y',
            displayName: 'Salad',
            source: 'manual',
            foodGroup: 'vegFruit',
          }),
          quantity: gramsQuantity(100),
        },
        {
          id: 2,
          plateLogId: 2,
          databaseFood: databaseFood({
            sourceRef: 'z',
            displayName: 'Beans',
            source: 'manual',
            foodGroup: 'protein',
          }),
          quantity: gramsQuantity(100),
        },
      ],
    });
    const none = coachSuggestionFor(plate, { dayPlates: [earlier], profile: {} });
    // Whatever an omnivore hears, a vegan or a milk-allergic person never hears about dairy.
    for (const profile of [{ diet: 'vegan' } as Profile, { allergies: ['lait'] } as Profile]) {
      expect(coachSuggestionFor(plate, { dayPlates: [earlier], profile })?.pattern).not.toBe(
        'dairyLight',
      );
    }
    expect(none).not.toBeUndefined();
  });
});

describe('when every option of every slot is blocked (the all-pools-blocked case)', () => {
  /** A vegan who avoids soy, gluten, nuts, pulses and the two words that close the last options. */
  const nothing: Profile = {
    diet: 'vegan',
    allergies: ['soy', 'gluten', 'nuts', 'pulses', 'fruit', 'rice'],
  };

  it('every slot of the profile really is empty', () => {
    for (const slot of FOOD_SLOTS) expect(slotParams([slot], nothing)[slot]).toBe('none');
  });

  for (const [locale, all] of LOCALES) {
    it(`${locale}: every template that names a food reads as a food-free, well-formed sentence`, () => {
      const names = Object.values(all.coachFoods).map((n) =>
        FOLD(n).replace(/^(?:des |du |un |de la |de l')/, ''),
      );
      const bad: string[] = [];
      let checked = 0;
      for (const [path, template] of templatesOf(all)) {
        if (slotsOfTemplate(template).length === 0) continue;
        checked++;
        const text = render(all, locale, template, nothing);
        const folded = FOLD(text);
        for (const name of names) {
          if (new RegExp(`(?<![a-z])${name}(?![a-z])`).test(folded)) bad.push(`${path}: "${name}"`);
        }
        // An article of the template must never sit in front of the neutral phrase's own article.
        if (/\b(?:some|quelques?) (?:a|an|something|une?|des|du|quelque)\b/i.test(text))
          bad.push(`${path}: double article`);
        if (/\{|\}|undefined/.test(text)) bad.push(`${path}: unfilled`);
        if (/\s{2,}/.test(text) || /^[a-zà-ÿ]/.test(text.trim()))
          bad.push(`${path}: shape "${text}"`);
      }
      expect(checked).toBeGreaterThan(20);
      expect(bad).toEqual([]);
    });
  }

  it('reads grammatically where "some {slot}" used to stand (en and fr)', () => {
    const none = { protein: 'none', dairy: 'none', snack: 'none' };
    expect(coachCopy(en, 'post.resolve.dairyLight', none, 'en')).toBe(
      'Would a dairy food you enjoy fit with this?',
    );
    expect(coachCopy(en, 'depth.followUp.vegRich', none, 'en')).toBe(
      'A protein you enjoy turns a veg plate into a meal in a few minutes.',
    );
    expect(coachCopy(en, 'depth.followUp.proteinMissingDay', none, 'en')).toBe(
      'Keeping a protein you enjoy at hand makes it quick to add.',
    );
    expect(coachCopy(fr, 'depth.followUp.vegRich', none, 'fr')).toBe(
      'Ajouter une source de protéines qui vous convient fait d’une assiette de légumes un vrai repas en quelques minutes.',
    );
  });

  it('an older note, with no stored options, shows the food-free phrase, not a generic pool', () => {
    const key = 'post.resolve.vegRich';
    expect(coachCopy(en, key, {}, 'en')).toBe(
      'Lots of veg here. Is there some protein nearby, like a protein you enjoy?',
    );
    for (const f of ['eggs', 'beans', 'tofu', 'fish', 'lentils']) {
      expect(coachCopy(en, key, {}, 'en')).not.toContain(f);
    }
    expect(slotText(en, 'protein', undefined, 'en')).toBe(en.coachSlotFallback.protein);
  });
});
