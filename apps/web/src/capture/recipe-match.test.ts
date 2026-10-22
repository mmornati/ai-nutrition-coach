// Which catalogue food a recipe line means, on the REAL catalogue (the seeds and the CIQUAL table):
// the language of the recipe, the head noun, raw weights for rice and the like, a floor under which
// nothing is picked silently, piece weights for bare counts, and the matched name that stays visible.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CiqualTable } from '../catalog/ciqual';
import { CiqualIndex } from '../catalog/ciqual-index';
import { OfflineFirstFoodCatalog } from '../catalog/offline-first-catalog';
import { seedFoods } from '../catalog/seed-foods';
import {
  COOKED_SEEDS,
  detectRecipeLanguage,
  lineWords,
  matchIngredient,
  MATCH_FLOOR,
  scoreCandidate,
  type RecipeLanguage,
} from './recipe-match';
import { parseIngredientLine, prefillFromAi, recipeFromText } from './recipe-paste';

const table = JSON.parse(
  readFileSync(join(__dirname, '../../public/catalog/ciqual-2025.json'), 'utf8'),
) as CiqualTable;
const index = CiqualIndex.fromTable(table);

function realCatalog(): OfflineFirstFoodCatalog {
  return new OfflineFirstFoodCatalog({
    ciqual: async () => table,
    onlineLookupAllowed: async () => false,
  });
}

/** The name the matcher picks for an ingredient name, or what it says instead. */
async function pick(term: string, language: RecipeLanguage): Promise<string> {
  const found = await matchIngredient(term, realCatalog(), language);
  if (found.kind === 'matched') return found.match.food.displayName;
  return found.kind === 'unsure'
    ? `? ${found.suggestions.map((s) => s.food.displayName).join(' | ')}`
    : '(none)';
}

describe('detectRecipeLanguage', () => {
  it('reads French from accents, headings, units and glue words', () => {
    expect(detectRecipeLanguage('Ingrédients\n200 g de farine\n3 œufs', 'en')).toBe('fr');
    expect(detectRecipeLanguage('Pour 4 personnes\n1 pincée de sel', 'en')).toBe('fr');
    expect(detectRecipeLanguage('200 g de riz\n50 cl de lait', 'en')).toBe('fr');
  });
  it('reads English from headings, units and glue words', () => {
    expect(detectRecipeLanguage('Ingredients\n2 cups of flour\nServes 4', 'fr')).toBe('en');
    expect(detectRecipeLanguage('1 tablespoon butter and the eggs', 'fr')).toBe('en');
  });
  it('falls back to the app language when nothing tells', () => {
    expect(detectRecipeLanguage('200 g', 'fr')).toBe('fr');
    expect(detectRecipeLanguage('200 g', 'en')).toBe('en');
    expect(detectRecipeLanguage('Ingredients', 'fr')).toBe('fr');
  });
});

describe('matching on the real catalogue: French', () => {
  it.each([
    ['lait', /^Lait$/],
    ['farine', /^Farine de blé/],
    ['beurre', /^Beurre$/],
    ['oeufs', /^(Œufs|Oeuf cru)/],
    ['huile d’olive', /^Huile d’olive$/],
    ['sucre', /^Sucre blanc$/],
    ['oignons', /^Oignon, cru$/],
  ])('%s', async (term, expected) => {
    expect(await pick(term, 'fr')).toMatch(expected);
  });

  it('"lait" is milk, not coconut milk', async () => {
    expect(await pick('lait', 'fr')).not.toMatch(/coco/i);
  });

  it('"riz" is RAW rice (a recipe lists dry weights), not cooked wholegrain rice', async () => {
    const name = await pick('riz', 'fr');
    expect(name).toBe('Riz blanc, cru');
    expect(await pick('riz cuit', 'fr')).toMatch(/cuit/);
  });

  it('"pâtes" and "pommes de terre" are raw / dry too, unless the line says cuit', async () => {
    expect(await pick('pâtes', 'fr')).toMatch(/cru|sec/i);
    expect(await pick('pommes de terre', 'fr')).toMatch(/Pomme de terre.*cru/i);
    expect(await pick('lentilles cuites', 'fr')).toMatch(/cuit/i);
  });
});

describe('matching on the real catalogue: English', () => {
  it.each([
    ['milk', /^Milk$/],
    ['flour', /^Wheat flour|flour, wheat|^Flour/i],
    ['butter', /^Butter$/],
    ['eggs', /^(Eggs|Egg, raw)/],
    ['olive oil', /^Olive Oil$/],
    ['sugar', /^Sugar, white$/],
    ['onions', /^Onion, raw$/],
  ])('%s', async (term, expected) => {
    expect(await pick(term, 'en')).toMatch(expected);
  });

  it('"rice" is raw rice, "cooked rice" is cooked', async () => {
    expect(await pick('rice', 'en')).toMatch(/Rice, white, raw|Rice, .*raw/);
    expect(await pick('cooked rice', 'en')).toMatch(/cooked/);
  });

  it('the recipe language drives the search, not the app language: a French line in an English app', async () => {
    // The catalogue asked in French finds the seed Lait; asked in the app's English it finds coconut milk first.
    const plain = await realCatalog().search('lait', { limit: 3 });
    expect(plain.kind === 'rankedMatches' && plain.matches[0]?.food.sourceRef).not.toBe(
      'seed:milk',
    );
    expect(await pick('lait', 'fr')).toBe('Lait');
  });
});

describe('the score', () => {
  const lait = (name: string) =>
    ({ food: { displayName: name, sourceRef: `x:${name}` }, confidence: 1, presets: [] }) as never;

  it('prefers the shorter name that starts with the head noun and penalises a different main food', () => {
    const words = lineWords('lait');
    const plain = scoreCandidate(words, lait('Lait demi-écrémé'));
    const coco = scoreCandidate(words, lait('Lait de coco'));
    const exact = scoreCandidate(words, lait('Lait'));
    expect(exact).toBeGreaterThan(plain);
    expect(plain).toBeGreaterThan(coco);
    expect(coco).toBeLessThan(MATCH_FLOOR);
  });

  it('does not penalise the different food when the line has it', () => {
    expect(scoreCandidate(lineWords('lait de coco'), lait('Lait de coco'))).toBeGreaterThan(
      MATCH_FLOOR,
    );
  });

  it('is 0 for a name with none of the line’s words', () => {
    expect(scoreCandidate(lineWords('lait'), lait('Pain blanc'))).toBe(0);
  });
});

describe('seeds that hold cooked values', () => {
  it('every seed the matcher treats as cooked is a "cuit" / "cooked" CIQUAL row', () => {
    for (const ref of COOKED_SEEDS) {
      const seed = seedFoods.find((s) => s.sourceRef === ref);
      expect(seed, ref).toBeDefined();
      const entry = index.byCode(seed?.ciqual ?? '');
      expect(`${entry?.nameFr} ${entry?.nameEn}`, ref).toMatch(/cuit|cooked|boiled/i);
    }
  });
});

describe('recipes end to end on the real catalogue', () => {
  const FRENCH = [
    'Gâteau de riz',
    'Pour 6 personnes',
    'Ingrédients',
    '200 g de riz',
    '1 l de lait',
    '3 œufs',
    '100 g de sucre',
    '50 g de beurre',
    '2 c. à soupe d’huile d’olive',
    '2 oignons',
    'Préparation',
  ].join('\n');

  it('picks plain foods for a French recipe in an English app, and shows each pick with its line', async () => {
    const prefill = await recipeFromText(FRENCH, realCatalog(), 'en');
    const got = prefill.ingredients.map((i) => [i.from, i.draft.databaseFood.displayName]);
    expect(got).toEqual([
      ['200 g de riz', 'Riz blanc, cru'],
      ['1 l de lait', 'Lait'],
      ['3 œufs', expect.stringMatching(/^(Œufs|Oeuf cru)/)],
      ['100 g de sucre', 'Sucre blanc'],
      ['50 g de beurre', 'Beurre'],
      ['2 c. à soupe d’huile d’olive', 'Huile d’olive'],
      ['2 oignons', 'Oignon, cru'],
    ]);
    expect(prefill.notAdded).toEqual([]);
  });

  it('weighs bare counts with a piece: 3 eggs is 165 g and 2 onions 220 g, both estimates', async () => {
    const prefill = await recipeFromText(FRENCH, realCatalog(), 'en');
    const grams = (from: string) =>
      prefill.ingredients.find((i) => i.from === from)?.draft.quantity;
    expect(grams('3 œufs')).toMatchObject({ grams: 165, gramsEstimated: true });
    expect(grams('2 oignons')).toMatchObject({ grams: 220, gramsEstimated: true });
    expect(grams('200 g de riz')).toMatchObject({ grams: 200, gramsEstimated: false });
  });

  it('works the same in English', async () => {
    const prefill = await recipeFromText(
      'Ingredients\n200 g rice\n1 cup of milk\n3 eggs\n100 g sugar\n2 onions',
      realCatalog(),
      'fr',
    );
    expect(prefill.ingredients.map((i) => i.draft.databaseFood.displayName)).toEqual([
      expect.stringMatching(/Rice, .*raw/),
      'Milk',
      expect.stringMatching(/^(Eggs|Egg, raw)/),
      'Sugar, white',
      'Onion, raw',
    ]);
    expect(prefill.ingredients[2]?.draft.quantity.grams).toBe(165);
  });
});

describe('below the floor: suggestions instead of a silent pick', () => {
  it('lists the line "not matched" with up to three suggestions that carry its weight', async () => {
    const prefill = await recipeFromText(
      'Ingredients\n150 g of coconut milk powder',
      realCatalog(),
      'en',
    );
    const lines = [
      ...prefill.ingredients.map((i) => i.from),
      ...prefill.notAdded.map((n) => n.raw),
    ];
    expect(lines).toEqual(['150 g of coconut milk powder']);
    for (const line of prefill.notAdded) {
      expect(line.suggestions.length).toBeLessThanOrEqual(3);
      for (const s of line.suggestions) {
        expect(s.draft.quantity.grams).toBe(150);
        expect(s.from).toBe(line.raw);
      }
    }
  });

  it('a loose candidate is offered as a suggestion (best three, best first), never picked', async () => {
    const loose = (name: string, ref: string) => ({
      food: {
        sourceRef: ref,
        displayName: name,
        source: 'seed' as const,
        foodGroup: 'other' as const,
      },
      confidence: 0.9,
      presets: [],
    });
    const catalog = {
      async search() {
        return {
          kind: 'rankedMatches' as const,
          matches: [
            loose('Soupe de poisson à la crème fraîche et aux champignons', 'a'),
            loose('Soupe de légumes', 'b'),
            loose('Potage au poisson, soupe', 'c'),
            loose('Sauce soupe maison', 'd'),
            loose('Pain blanc', 'e'),
          ],
        };
      },
      async lookupBySourceRef() {
        return null;
      },
      async lookupByBarcode() {
        return { kind: 'rankedMatches' as const, matches: [] };
      },
    };
    const found = await matchIngredient('soupe poisson miso tofu', catalog, 'fr');
    expect(found.kind).toBe('unsure');
    if (found.kind === 'unsure') {
      expect(found.suggestions.length).toBeLessThanOrEqual(3);
      expect(found.suggestions.map((m) => m.food.sourceRef)).not.toContain('e');
    }
    const prefill = await recipeFromText(
      'Ingredients\n150 g de soupe poisson miso tofu',
      catalog,
      'fr',
    );
    expect(prefill.ingredients).toEqual([]);
    const line = prefill.notAdded[0];
    expect(line?.raw).toBe('150 g de soupe poisson miso tofu');
    expect(line?.suggestions.length).toBeGreaterThan(0);
    expect(line?.suggestions.length).toBeLessThanOrEqual(3);
    expect(line?.suggestions.every((s) => s.draft.quantity.grams === 150)).toBe(true);
  });

  it('a line nothing matches has no suggestions', async () => {
    const prefill = await recipeFromText('Ingredients\n1 pincée de xyzzy', realCatalog(), 'fr');
    expect(prefill.notAdded).toEqual([{ raw: '1 pincée de xyzzy', suggestions: [] }]);
  });

  it('every pick made is at or above the floor (the documented 0.60)', async () => {
    expect(MATCH_FLOOR).toBe(0.6);
    for (const term of ['lait', 'riz', 'farine', 'beurre', 'oeufs', 'sucre']) {
      const found = await matchIngredient(term, realCatalog(), 'fr');
      expect(found.kind).toBe('matched');
      if (found.kind === 'matched') expect(found.score).toBeGreaterThanOrEqual(MATCH_FLOOR);
    }
  });
});

describe('counts', () => {
  it('a bare count is read as a count, not a weight', () => {
    expect(parseIngredientLine('3 œufs')).toMatchObject({ term: 'œufs', count: 3 });
    expect(parseIngredientLine('2 x 3 oignons')).toMatchObject({ count: 6 });
    expect(parseIngredientLine('200 g de riz')?.count).toBeUndefined();
  });

  it('a count of something with no piece weight stays unweighed (listed, no suggestion)', async () => {
    const prefill = await recipeFromText(
      'Ingredients\n2 tranches de saumon fumé',
      realCatalog(),
      'fr',
    );
    expect(prefill.ingredients).toEqual([]);
    expect(prefill.notAdded.map((n) => n.raw)).toEqual(['2 tranches de saumon fumé']);
  });
});

describe('the AI path uses the same matcher', () => {
  it('matches the AI’s names by the same rules and keeps its weights and flags', async () => {
    const prefill = await prefillFromAi(
      {
        ingredients: [
          { name: 'rice', grams: 180, estimated: false },
          { name: 'coconut milk powder', grams: 30, estimated: true },
        ],
      },
      realCatalog(),
      'en',
    );
    expect(prefill.ingredients[0]?.draft.databaseFood.displayName).toMatch(/Rice, .*raw/);
    expect(prefill.ingredients[0]?.draft.quantity).toMatchObject({
      grams: 180,
      gramsEstimated: false,
    });
    expect(prefill.ingredients[0]?.from).toBe('rice');
  });
});
