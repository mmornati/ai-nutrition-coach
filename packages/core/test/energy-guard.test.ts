import { describe, expect, it } from 'vitest';
import {
  containsBodyComment,
  containsHarmfulAdvice,
  detectSupportSignal,
  exceedsSafePace,
  hasUnsafeEnergyFigure,
  statedLossPerWeek,
  validateCoachText,
} from '../src/index';

const limits = { floorKcal: 1200, guideKcal: 1700 } as const;
const unsafe = (t: string, l: { floorKcal?: number; guideKcal?: number } = limits) =>
  hasUnsafeEnergyFigure(t, l);

describe('energy guard: figures at or above the threshold are fine', () => {
  it.each([
    'Your guide is about 1,700 kcal a day.',
    'Aim for 1,800 kcal a day.',
    'Eat around 2000 kcal daily.',
  ])('%s', (t) => expect(unsafe(t)).toBe(false));
  it('uses the floor when no guide is known', () => {
    expect(unsafe('Eat 1,100 kcal a day.', { floorKcal: 1200 })).toBe(true);
    expect(unsafe('Eat 1,300 kcal a day.', { floorKcal: 1200 })).toBe(false);
    expect(unsafe('Eat 1,300 kcal a day.', { floorKcal: 1200, guideKcal: 1700 })).toBe(true);
  });
});

describe('energy guard (i): the energy of a food, plate or meal', () => {
  it.each([
    'There are about 450 kcal in the pizza.',
    'That sandwich is around 500 kcal.',
    'Your lunch came to about 800 kcal.',
    'A dinner of about 600 kcal sits well within your guide.',
    'Cette assiette faisait environ 450 kcal.',
    'Per 100 g, crisps carry about 530 kcal.',
    'Most of the energy came from the pizza, about 900 kcal.',
    'A 500 kcal lunch is plenty.',
  ])('accepted: %s', (t) => expect(unsafe(t)).toBe(false));

  it.each([
    [
      'a prescribed per-meal figure that adds up to a day under the guide',
      'Keep each meal to about 400 kcal, three meals.',
    ],
    ['each meal at 300 kcal', 'Have 300 kcal at each meal.'],
    [
      'per-meal figures that sum under the guide',
      'Your day could be 300 kcal at breakfast, 300 kcal at lunch and 300 kcal at dinner.',
    ],
    ['a day is not an item', 'A day of 1100 kcal.'],
    ['a plan week is not an item', 'A strict 800 kcal week will shock your system.'],
    ['cannot be classified', 'Have 1100 kcal.'],
  ])('refused (%s)', (_n, t) => expect(unsafe(t)).toBe(true));

  it('a per-meal figure that reaches the guide over three meals is fine', () => {
    expect(unsafe('Have about 600 kcal at each meal.')).toBe(false);
  });
});

describe('energy guard (ii): a difference, a deficit, a saving', () => {
  it.each([
    'A deficit of about 500 kcal a day leads to roughly half a kilo a week.',
    'About 250 kcal less than usual each day is the gentle pace.',
    'Un déficit d’environ 500 kcal par jour suffit.',
    'Water instead of a soda saves about 140 kcal.',
    'You could cut about 400 kcal from your day.',
  ])('accepted: %s', (t) => expect(unsafe(t)).toBe(false));
  it('a level is not a difference: "down to", "to", "at"', () => {
    expect(unsafe('Cut your intake to 1,000 kcal a day.')).toBe(true);
    expect(unsafe('Drop down to 1,100 kcal.')).toBe(true);
  });
  it('a deficit above 1,100 kcal is more than a kilo a week', () => {
    expect(unsafe('A deficit of 1,500 kcal a day works fast.')).toBe(true);
  });
});

describe('energy guard (iii): a description of what was logged', () => {
  it.each([
    'Your intake today was 1,100 kcal.',
    'This week your energy averaged about 1,450 kcal a day.',
    'Cette semaine, environ 1 450 kcal par jour.',
    'You ate about 900 kcal yesterday.',
  ])('accepted: %s', (t) => expect(unsafe(t)).toBe(false));
  it.each([
    'Your intake today was 1,100 kcal. Keep it like that.',
    'You averaged 1,200 kcal a day, so aim for that again.',
    'Your intake today was 1,100 kcal, which is a good goal.',
    'Votre apport était de 1 100 kcal. Gardez ce rythme.',
  ])('refused with an instruction in the same or the next sentence: %s', (t) =>
    expect(unsafe(t)).toBe(true),
  );
  it('a modal before the figure is not a description', () => {
    expect(unsafe('You could have had 1,100 kcal today.')).toBe(true);
  });
});

describe('energy guard: fractions of the guide', () => {
  it.each([
    'Eat half of your guide on rest days.',
    'Cut your guide in half for a week.',
    'Mangez la moitié de votre repère.',
    'Have a third of your guide today.',
    'Eat 60 % of your guide.',
  ])('refused: %s', (t) => expect(unsafe(t)).toBe(true));
  it('a plate that is a share of the guide is fine', () => {
    expect(unsafe('That pizza is about half of your guide.')).toBe(false);
  });
});

describe('energy guard: numbers are read after normalisation', () => {
  it.each([
    ['1 100 kcal', true],
    ['1 100 kcal', true],
    ['1 100 kcal', true],
    ['1 100 kcal', true],
    ['1,100 kcal', true],
    ['1.100 kcal', true],
    ['a thousand kcal', true],
    ['twelve hundred calories', true],
    ['one thousand two hundred calories', true],
    ['mille deux cents kcal', true],
    ['huit cents kcal', true],
    ['quatre-vingt-dix-sept kcal', false],
    ['900 to 1100 kcal', true],
    ['900-1100 kcal', true],
    ['900 à 1100 kcal', true],
    ['4000 kJ', true],
    ['9000 kJ', false],
    ['١١٠٠ kcal', true],
    ['１１００ kcal', true],
  ] as const)('Aim for %s a day -> unsafe=%s', (n, expected) => {
    expect(unsafe(`Aim for ${n} a day.`)).toBe(expected);
  });
});

describe('pace guard', () => {
  it.each([
    '6 kg in three weeks',
    'a kilo a day',
    'two kilos every week',
    '1.5 kg weekly',
    '5 kg by next week',
    '4 kilos before Saturday',
    '10 pounds in 10 days',
    'one kilo every two days',
    '3 kg by the weekend',
    '6 kg before my wedding',
    '2 stone in a month',
  ])('lose %s is too fast', (t) => expect(exceedsSafePace(`You could lose ${t}.`)).toBe(true));

  it.each([
    'Lose 6 kilos en trois semaines',
    'Perdre un kilo par jour',
    'Perdre 2 kilos par semaine',
    'Perdre 4 kilos avant samedi',
    'Perdre 5 kg d’ici la semaine prochaine',
  ])('fr: %s', (t) => expect(exceedsSafePace(t)).toBe(true));

  it.each([
    'Losing 0.5 kg a week is calm.',
    'Losing 3 kg in three weeks is within a gentle pace.',
    'Losing 2 kg over two weeks would be about a kilo a week.',
    'You could lose 4 kg by the end of the year.',
    'Perdre 2 kilos en un mois est réaliste.',
    'Losing 1 kg a week is the upper end.',
  ])('not too fast: %s', (t) => expect(exceedsSafePace(t)).toBe(false));

  it('reads the rate in kilos a week, pounds converted', () => {
    expect(statedLossPerWeek('lose 5 kg in a week')).toBeCloseTo(5);
    expect(statedLossPerWeek('lose a kilo a day')).toBeCloseTo(7);
    expect(statedLossPerWeek('lose 6 kg in three weeks')).toBeCloseTo(2);
    expect(statedLossPerWeek('lose half a kilo a week')).toBeCloseTo(0.5);
    expect(statedLossPerWeek('lose 1 kg every two weeks')).toBeCloseTo(0.5);
    expect(statedLossPerWeek('you eat 3 kg of vegetables a week')).toBeNull();
  });
  it('an amount with a deadline it cannot size is refused', () => {
    expect(exceedsSafePace('Lose 3 kg by June.')).toBe(true);
    expect(exceedsSafePace('Lose 2 kg before the holidays.')).toBe(true);
  });
});

describe('harmful advice: normalisation', () => {
  const harmful = (t: string) => containsHarmfulAdvice(t, limits);
  it.each([
    ['full-width letters', 'Ｓkip breakfast.'],
    ['zero-width characters', 'Skip​ breakfast.'],
    ['bidi marks', 'Sk‮ip breakfast.'],
    ['soft hyphen', 'Fas­ting works.'],
    ['spaced letters', 's k i p dinner tonight.'],
    ['dotted letters', 'Try f.a.s.t.i.n.g today.'],
    ['a Cyrillic look-alike', 'Try fаsting until noon.'],
    ['a Greek look-alike', 'Try οmad on weekdays.'],
    ['line separators', 'Skip breakfast.'],
  ])('%s', (_n, t) => expect(harmful(t)).toBe(true));

  it('refuses a word that mixes scripts, even with nothing else wrong', () => {
    expect(harmful('A lovely bаlanced plate.')).toBe(true);
    expect(harmful('A lovely balanced plate.')).toBe(false);
  });
  it('a micro sign next to Latin letters is a unit', () => {
    expect(harmful('About 50 µg of iodine in an egg.')).toBe(false);
  });
});

describe('harmful advice: negation that governs the clause', () => {
  const harmful = (t: string) => containsHarmfulAdvice(t, limits);
  it.each([
    'No need to skip meals.',
    'Avoid fasting.',
    'Do not skip breakfast.',
    "Don't try to skip dinner.",
    'I would never suggest fasting.',
    'There is no need to skip meals or fast.',
    'Avoid skipping meals, fasting or detox.',
    'Fasting is not recommended.',
    'Skipping meals often backfires.',
    'Skipping breakfast is not needed to lose weight.',
    'If you skip breakfast you may feel hungrier later.',
    'Évitez de sauter des repas.',
    'Ne sautez pas le petit-déjeuner.',
    'Le jeûne n’est pas conseillé.',
    'Sauter des repas se retourne souvent contre soi.',
    'Inutile de sauter le dîner.',
    'Il ne faut pas jeûner.',
  ])('against it: %s', (t) => expect(harmful(t)).toBe(false));

  it.each([
    'If you are not hungry, skip breakfast.',
    'If you are not hungry skip breakfast.',
    "There's no harm in skipping dinner now and then.",
    "It's fine to skip dinner occasionally.",
    'You could skip breakfast.',
    "Don't worry about eating enough, a fast until noon is fine.",
    'Skipping meals is not a problem.',
    "Il n'y a pas de mal à sauter le dîner.",
    'Vous pouvez sauter le petit-déjeuner.',
    'Si vous n’avez pas faim, sautez le dîner.',
  ])('advice: %s', (t) => expect(harmful(t)).toBe(true));

  it('"fast" and "cured" are not the problem words they used to be', () => {
    for (const ok of [
      'Fast-food burgers carry a lot of energy.',
      'Eating too fast makes it hard to notice fullness.',
      'You walk too fast to enjoy it.',
      'Cured meats like ham are salty.',
    ]) {
      expect(
        validateCoachText(ok, { maxChars: 300, numbersOn: true, weightTalk: 'allowed' }).ok,
      ).toBe(true);
    }
  });
});

describe('harmful advice: the lists', () => {
  const harmful = (t: string) => containsHarmfulAdvice(t, limits);
  it.each([
    'Try 16:8.',
    'Try 5:2 twice a week.',
    'Do OMAD.',
    'Eat one meal a day.',
    'Keep an eating window.',
    'Take semaglutide.',
    'Ask about Ozempic.',
    'Wegovy helps.',
    'Tirzepatide works.',
    'Mounjaro is popular.',
    'Zepbound is an option.',
    'Try liraglutide.',
    'Saxenda can help.',
    'Orlistat blocks fat.',
    'Naltrexone-bupropion reduces cravings.',
    'Phentermine suppresses appetite.',
    'Take glucomannan before meals.',
    'Konjac capsules help.',
    'Use a laxative.',
    'Take a diuretic.',
    'A fat burner may help.',
    'Try a ketogenic diet.',
    'Cut out carbs completely.',
    'Un régime cétogène.',
    'Supprimez le pain et les pâtes.',
    'Walk it off.',
    'Make up for it tomorrow.',
    'Balance it out with a salad.',
    'Even out the weekend.',
    'You deserve a treat day.',
    'Mangez moins demain pour compenser.',
    'Écart alimentaire : rattrapez-le.',
    'Un jour de triche.',
    'Vous avez été sage.',
  ])('%s', (t) => expect(harmful(t)).toBe(true));
  it('a drug name rejects even when it is advised against', () => {
    expect(harmful('Do not take Ozempic.')).toBe(true);
  });
});

describe('body comments are refused', () => {
  it.each([
    'Pour affiner votre silhouette.',
    'Your belly will shrink.',
    'Bikini season is coming.',
    'A flat stomach is possible.',
    'Votre ventre va diminuer.',
    'Vos cuisses vont fondre.',
    'Summer body goals.',
  ])('%s', (t) => {
    expect(containsBodyComment(t)).toBe(true);
    expect(validateCoachText(t, { maxChars: 300, numbersOn: true, weightTalk: 'allowed' }).ok).toBe(
      false,
    );
  });
  it('chicken thighs and pork belly are food', () => {
    expect(containsBodyComment('Chicken thighs and pork belly are richer cuts.')).toBe(false);
    expect(containsBodyComment('Des cuisses de poulet rôties.')).toBe(false);
  });
});

describe('support routing reuses the validator readings', () => {
  it.each([
    'help me plan 3500 kJ a day',
    'is eating a thousand calories a day ok',
    'is eating mille calories par jour ok',
    'meal plan 1000 kcal',
    'is 600 kcal enough for a day',
    'est-ce que 1000 kcal c’est assez',
    'I want to lose 4 kilos before Saturday',
    'perdre 4 kilos avant samedi',
    'perdre 5 kilos d’ici la semaine prochaine',
    'is OMAD ok',
    'once a day eating plan, is that fine',
    'cure détox',
    'arrêter de dîner pour maigrir',
    'sauter le dîner',
    'should I take Ozempic',
    'should I take semaglutide',
  ])('routes: %s', (t) => expect(detectSupportSignal(t)).not.toBeNull());
  it.each([
    'a dinner of 600 kcal, ideas?',
    'snacks under 200 kcal',
    'is fast food ok once a week',
    'what about intermittent eating of fruit',
    'how many kcal in 100 g of pasta, about 350?',
    'recette à 800 kcal',
  ])('does not route: %s', (t) => expect(detectSupportSignal(t)).toBeNull());
});
