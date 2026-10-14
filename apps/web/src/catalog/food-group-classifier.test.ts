// `classifyFoodGroup`: OFF category tags and food names. Ported one-to-one from
// Ported from the earlier client.
import { describe, expect, it } from 'vitest';
import { classifyFoodByName, classifyFoodGroup } from './food-group-classifier';
import { seedName } from './food-display';
import { seedFoods } from './seed-foods';

describe('the reported misclassifications', () => {
  it('peanut butter is PROTEIN, not dairy (it contains "butter")', () => {
    expect(classifyFoodGroup(['Peanut butter'])).toBe('protein');
    expect(classifyFoodGroup(['en:spreads', 'en:nut-butters', 'en:peanut-butters'])).toBe(
      'protein',
    );
    expect(classifyFoodGroup(['almond butter'])).toBe('protein');
    expect(classifyFoodGroup(['tahini'])).toBe('protein');
  });

  it('plain butter is still dairy', () => {
    expect(classifyFoodGroup(['en:butters'])).toBe('dairy');
    expect(classifyFoodGroup(['Butter'])).toBe('dairy');
  });

  it('almond / oat / soy milk sit in the dairy quadrant (dairy alternative)', () => {
    expect(classifyFoodGroup(['Almond milk'])).toBe('dairy');
    expect(
      classifyFoodGroup(['en:plant-based-foods-and-beverages', 'en:nut-milks', 'en:almond-milks']),
    ).toBe('dairy');
    expect(classifyFoodGroup(['oat drink'])).toBe('dairy');
    expect(classifyFoodGroup(['en:soy-yogurts'])).toBe('dairy');
  });

  it('a generic plant-based tag does not hijack an almond milk', () => {
    // `en:plant-based-foods` carries no group; the milk tag decides.
    expect(classifyFoodGroup(['en:plant-based-foods', 'en:almond-milks'])).toBe('dairy');
  });
});

describe('whole-token matching', () => {
  it('eggplant is a vegetable, not an egg', () => {
    expect(classifyFoodGroup(['Eggplant'])).toBe('vegFruit');
    expect(classifyFoodGroup(['en:eggs'])).toBe('protein');
  });

  it('licorice is not rice, butterfly is not butter', () => {
    expect(classifyFoodGroup(['licorice'])).toBe('other');
    expect(classifyFoodGroup(['butterfly pasta'])).toBe('starch');
  });

  it('plural / language-prefixed OFF tags', () => {
    expect(classifyFoodGroup(['en:fruits', 'en:apples'])).toBe('vegFruit');
    expect(classifyFoodGroup(['en:dairy', 'en:yogurts'])).toBe('dairy');
    expect(classifyFoodGroup(['fr:berries'])).toBe('vegFruit');
    expect(classifyFoodGroup(['en:breads'])).toBe('starch');
    expect(classifyFoodGroup(['en:legumes'])).toBe('protein');
  });

  it('nothing recognisable is other, never a guess', () => {
    expect(classifyFoodGroup([])).toBe('other');
    expect(classifyFoodGroup(['en:spreads', 'en:sweet-spreads'])).toBe('other');
    expect(classifyFoodGroup(['Dark chocolate'])).toBe('other');
  });

  it('dairy wins over a fruit flavour', () => {
    expect(classifyFoodGroup(['strawberry yogurt'])).toBe('dairy');
  });
});

it('every seeded food classifies to its own group by name, in each language (or other)', () => {
  // The name classifier is a FALLBACK; it must never contradict the curated seed list (a wrong
  // group is worse than `other`).
  for (const seed of seedFoods) {
    // The curated `other` set (nuts, oils, chocolate) is a product choice the name classifier is
    // not asked to reproduce.
    if (seed.foodGroup === 'other') continue;
    for (const locale of ['en', 'fr'] as const) {
      const name = seedName(seed, locale);
      const guessed = classifyFoodGroup([name]);
      expect(
        guessed === seed.foodGroup || guessed === 'other',
        `${name}: seed ${seed.foodGroup}, guessed ${guessed}`,
      ).toBe(true);
    }
  }
});

describe('French names', () => {
  const group = (name: string) => classifyFoodByName(name);

  it('every seeded food is classified by its French name, exactly (the keyword list covers them)', () => {
    for (const seed of seedFoods) {
      if (seed.foodGroup === 'other') continue;
      expect(group(seedName(seed, 'fr')), seed.id).toBe(seed.foodGroup);
    }
  });

  it('fruit and vegetables', () => {
    for (const name of [
      'pomme',
      'Pommes',
      'poire',
      'banane',
      'Épinards',
      'epinards',
      'brocoli',
      'carotte',
      'carottes',
      'salade verte',
      'tomate',
      'courgette',
      'poireaux',
      'choux',
      'fraises',
      'Légumes',
      'compote de pommes',
      'haricots verts',
      'petits pois',
    ]) {
      expect(group(name), name).toBe('vegFruit');
    }
  });

  it('protein', () => {
    for (const name of [
      'poulet',
      'blanc de poulet',
      'filet de poulet',
      'bœuf',
      'boeuf',
      'Bœuf haché',
      'porc',
      'poisson',
      'saumon',
      'thon',
      'œuf',
      'Œufs',
      'oeufs',
      'lentilles',
      'pois chiches',
      'haricots rouges',
      'tofu',
      'jambon',
      'fruits de mer',
    ]) {
      expect(group(name), name).toBe('protein');
    }
  });

  it('starch', () => {
    for (const name of [
      'riz',
      'Riz basmati',
      'pâtes',
      'pates',
      'pain',
      'pain de mie',
      'pomme de terre',
      'Pommes de terre',
      'purée de pommes de terre',
      'patate douce',
      'semoule',
      'quinoa',
      'flocons d’avoine',
    ]) {
      expect(group(name), name).toBe('starch');
    }
  });

  it('dairy', () => {
    for (const name of [
      'fromage',
      'fromage blanc',
      'yaourt',
      'yaourt aux fraises',
      'lait',
      'lait demi-écrémé',
      'beurre',
      'crème fraîche',
      'kéfir',
    ]) {
      expect(group(name), name).toBe('dairy');
    }
  });

  it('nothing recognisable is other', () => {
    for (const name of ['chocolat noir', 'huile d’olive', 'thé', 'café', 'noix de coco']) {
      expect(group(name), name).toBe('other');
    }
  });
});

describe('French false friends and overrides', () => {
  it('pomme de terre is a starch, not an apple (the multi-word override beats "pomme")', () => {
    expect(classifyFoodGroup(['pomme de terre'])).toBe('starch');
    expect(classifyFoodGroup(['Pommes de terre sautées'])).toBe('starch');
    expect(classifyFoodGroup(['fr:pommes-de-terre'])).toBe('starch');
    expect(classifyFoodGroup(['pomme'])).toBe('vegFruit');
    expect(classifyFoodGroup(['pomme', 'pomme de terre'])).toBe('starch');
  });

  it('riz is rice, ris de veau is not', () => {
    expect(classifyFoodByName('riz')).toBe('starch');
    expect(classifyFoodByName('ris de veau')).toBe('protein');
    expect(classifyFoodByName('riz au lait')).toBe('dairy');
  });

  it('pâtes (pasta) and pâté stay apart once accents are folded', () => {
    expect(classifyFoodByName('pâtes')).toBe('starch');
    expect(classifyFoodByName('pâté')).toBe('other');
  });

  it('légumes are vegetables; unaccented "legumes" keeps its English meaning (pulses)', () => {
    expect(classifyFoodByName('légumes')).toBe('vegFruit');
    expect(classifyFoodGroup(['fr:légumes'])).toBe('vegFruit');
    expect(classifyFoodGroup(['en:legumes'])).toBe('protein');
  });

  it('fruits de mer is seafood, not fruit', () => {
    expect(classifyFoodByName('fruits de mer')).toBe('protein');
    expect(classifyFoodByName('fruits rouges')).toBe('vegFruit');
  });

  it('pain d’épices is a sweet, not a bread; thé is nothing', () => {
    expect(classifyFoodByName('pain d’épices')).toBe('other');
    expect(classifyFoodByName('pain d epices')).toBe('other');
    expect(classifyFoodByName('pain complet')).toBe('starch');
    expect(classifyFoodByName('thé')).toBe('other');
    expect(classifyFoodByName('thé vert')).toBe('other');
  });

  it('beurre de cacahuète / d’amande is protein; plain beurre is dairy', () => {
    expect(classifyFoodByName('beurre de cacahuète')).toBe('protein');
    expect(classifyFoodByName('beurre de cacahuètes')).toBe('protein');
    expect(classifyFoodByName('Beurre d’amande')).toBe('protein');
    expect(classifyFoodByName('purée de noisettes')).toBe('protein');
    expect(classifyFoodByName('tahin')).toBe('protein');
    expect(classifyFoodByName('beurre')).toBe('dairy');
    expect(classifyFoodByName('beurre doux')).toBe('dairy');
  });

  it('plant milks sit in the dairy quadrant, not in the oat / soy / rice group', () => {
    expect(classifyFoodByName('lait d’avoine')).toBe('dairy');
    expect(classifyFoodByName('lait d’amande')).toBe('dairy');
    expect(classifyFoodByName('lait de soja')).toBe('dairy');
    expect(classifyFoodByName('boisson à l’avoine')).toBe('dairy');
    expect(classifyFoodByName('boisson d’avoine')).toBe('dairy');
    expect(classifyFoodByName('boisson végétale')).toBe('dairy');
    expect(classifyFoodByName('yaourt de soja')).toBe('dairy');
    expect(classifyFoodByName('yaourt végétal')).toBe('dairy');
    expect(classifyFoodGroup(['fr:boissons-a-base-de-plantes', 'fr:boissons-a-l-avoine'])).toBe(
      'dairy',
    );
    // The oats on their own are still a starch, a soda still nothing.
    expect(classifyFoodByName('avoine')).toBe('starch');
    expect(classifyFoodByName('boisson gazeuse')).toBe('other');
  });

  it('accent, case and ligature insensitive; French plurals (-s, -x) stem', () => {
    expect(classifyFoodByName('ÉPINARDS')).toBe('vegFruit');
    expect(classifyFoodByName('Œufs')).toBe('protein');
    expect(classifyFoodByName('poireaux')).toBe('vegFruit');
    expect(classifyFoodByName('pommes')).toBe('vegFruit');
  });

  it('English is unaffected by the French words (licorice, butterfly, eggplant)', () => {
    expect(classifyFoodGroup(['licorice'])).toBe('other');
    expect(classifyFoodGroup(['Eggplant'])).toBe('vegFruit');
    expect(classifyFoodGroup(['Peanut butter'])).toBe('protein');
    expect(classifyFoodGroup(['couscous'])).toBe('starch');
  });
});

describe('classifyFoodByName (the one-name adapter)', () => {
  it('classifies a whole name', () => {
    expect(classifyFoodByName('egg')).toBe('protein');
    expect(classifyFoodByName('rice')).toBe('starch');
    expect(classifyFoodByName('milk')).toBe('dairy');
    expect(classifyFoodByName('peanut butter')).toBe('protein');
  });

  it('a bare string cannot be passed to classifyFoodGroup (it would classify characters)', () => {
    const misuse = (): unknown =>
      // @ts-expect-error a string is an iterable of characters: the parameter is a readonly string[]
      classifyFoodGroup('egg');
    expect(typeof misuse).toBe('function'); // compile-time check only; never called
    expect(classifyFoodGroup(['egg'])).toBe(classifyFoodByName('egg'));
  });
});

describe('French sweets, pastry and potato dishes read as a whole', () => {
  const group = (name: string) => classifyFoodByName(name);
  const cases: readonly (readonly [string, string])[] = [
    ['pâte à tartiner', 'other'],
    ['pâtes à tartiner', 'other'],
    ['pâtes de fruits', 'other'],
    ['pâte de fruits', 'other'],
    ['pâte feuilletée', 'other'],
    ['pâtes feuilletées', 'other'],
    ['pâte à choux', 'other'],
    ['crème de marrons', 'other'],
    ['beurre de cacao', 'other'],
    ['creme egg', 'other'],
    ['pommes sautées', 'starch'],
    ['pommes vapeur', 'starch'],
    ['pommes noisettes', 'starch'],
    ['pommes dauphine', 'starch'],
    ['pommes dauphines', 'starch'],
    ['pommes allumettes', 'starch'],
    ['légumes verts', 'vegFruit'],
    ['legumes verts', 'vegFruit'],
    ['legume vert', 'vegFruit'],
  ];
  it.each(cases)('%s is %s', (name, expected) => {
    expect(group(name)).toBe(expected);
  });

  it('the plain words keep their group', () => {
    expect(group('pâtes')).toBe('starch');
    expect(group('chou')).toBe('vegFruit');
    expect(group('crème fraîche')).toBe('dairy');
    expect(group('beurre')).toBe('dairy');
    expect(group('pomme')).toBe('vegFruit');
    expect(group('légumineuses')).toBe('protein');
  });

  it('a decomposed accent is the same word as a composed one', () => {
    expect(group('légumes verts')).toBe('vegFruit');
    expect(group('légumes')).toBe('vegFruit');
  });
});

describe('French coverage additions', () => {
  const group = (name: string) => classifyFoodByName(name);
  const cases: readonly (readonly [string, string])[] = [
    ['moules', 'protein'],
    ['huîtres', 'protein'],
    ['calamars', 'protein'],
    ['noix de Saint-Jacques', 'protein'],
    ['Saint-Jacques', 'protein'],
    ['lieu noir', 'protein'],
    ['merguez', 'protein'],
    ['omelette', 'protein'],
    ['pruneaux', 'vegFruit'],
    ['pruneau', 'vegFruit'],
    ['fèves', 'protein'],
    ['flageolets', 'protein'],
    ['pois cassés', 'protein'],
    ['croissant', 'starch'],
    ['pain au chocolat', 'starch'],
    ['noix de coco', 'other'],
  ];
  it.each(cases)('%s is %s', (name, expected) => {
    expect(group(name)).toBe(expected);
  });

  it('"au lieu de" is not a fish', () => {
    expect(group('au lieu de')).toBe('other');
  });
});

describe('common English foods are unchanged', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['apple', 'vegFruit'],
    ['banana', 'vegFruit'],
    ['broccoli', 'vegFruit'],
    ['green beans', 'protein'],
    ['chicken breast', 'protein'],
    ['salmon', 'protein'],
    ['eggs', 'protein'],
    ['lentils', 'protein'],
    ['tofu', 'protein'],
    ['white rice', 'starch'],
    ['pasta', 'starch'],
    ['bread', 'starch'],
    ['oatmeal', 'other'],
    ['granola bar', 'starch'],
    ['potato', 'starch'],
    ['cheddar cheese', 'dairy'],
    ['yogurt', 'dairy'],
    ['butter', 'dairy'],
    ['peanut butter', 'protein'],
    ['almond milk', 'dairy'],
    ['dark chocolate', 'other'],
    ['olive oil', 'other'],
    ['cream cheese', 'dairy'],
    ['legumes', 'protein'],
  ];
  it.each(cases)('%s is %s', (name, expected) => {
    expect(classifyFoodByName(name)).toBe(expected);
  });
});
