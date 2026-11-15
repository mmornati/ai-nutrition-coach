// The food-kind detectors of the coach (packages/core/src/coach/food-detect.ts) against REAL CIQUAL
// 2025 rows (public/catalog/ciqual-2025.json), in both languages: they must find what the PNNS-style
// week rules count, and must not misfire on look-alikes. The detectors read the food NAME (and the
// sugars of a drink), the way the app logs a CIQUAL food: `displayName` is the French or the
// English name.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { databaseFood, foodKinds, type DatabaseFood, type FoodKinds } from '@anc/core';
import { describe, expect, it } from 'vitest';
import { ciqualFoods, type CiqualFood, type CiqualTable } from './ciqual';
import { ciqualFoodGroup } from './ciqual-groups';

const table = JSON.parse(
  readFileSync(resolve(__dirname, '../../public/catalog/ciqual-2025.json'), 'utf8'),
) as CiqualTable;
const foods = ciqualFoods(table);
const byCode = new Map(foods.map((f) => [f.code, f]));

const logged = (f: CiqualFood, locale: 'fr' | 'en'): DatabaseFood =>
  databaseFood({
    sourceRef: `ciqual:${f.code}`,
    displayName: locale === 'fr' ? f.nameFr : f.nameEn,
    source: 'ciqual',
    foodGroup: ciqualFoodGroup(f),
    nutrientsPer100g: f.per100g,
  });

const kindsOf = (code: string, locale: 'fr' | 'en'): FoodKinds => {
  const f = byCode.get(code);
  if (f === undefined) throw new Error(`no CIQUAL row ${code}`);
  return foodKinds(logged(f, locale));
};
const named = (name: RegExp): CiqualFood[] => foods.filter((f) => name.test(f.nameFr));

describe('the real rows the week rules lean on', () => {
  it('the table is the one the app ships', () => {
    expect(foods.length).toBeGreaterThan(3000);
  });

  it.each(['fr', 'en'] as const)('fish, breaded or not (%s)', (locale) => {
    // Saumon, cuit (avg), Saumon fumé, Cabillaud, Sardine à l'huile, Poisson pané.
    for (const f of [
      ...named(/^Saumon, cuit|^Saumon fumé/),
      ...named(/^Cabillaud/),
      ...named(/^Sardine/),
    ].slice(0, 12)) {
      expect(kindsOf(f.code, locale).fish, `${f.nameFr} / ${f.nameEn}`).toBe(true);
    }
    const breaded = named(/^Poisson.*pané|^Bâtonnet.*poisson|^Colin.*pané|^Filet.*poisson.*pané/);
    expect(breaded.length).toBeGreaterThan(0);
    for (const f of breaded) expect(kindsOf(f.code, locale).fish, f.nameFr).toBe(true);
  });

  it('does not take look-alikes for fish', () => {
    for (const f of named(/^Sauce.*poisson|^Huile.*poisson|^Chat\b/)) {
      expect(kindsOf(f.code, 'fr').fish, f.nameFr).toBe(false);
    }
    // Something plainly not fish.
    for (const f of named(/^Poulet|^Boeuf|^Pomme de terre/).slice(0, 20)) {
      expect(kindsOf(f.code, 'fr').fish, f.nameFr).toBe(false);
    }
  });

  it('pulses: dry beans, lentils, chickpeas; never green or butter beans or peas', () => {
    const pulses = [
      ...named(/^Lentille.*cuit/),
      ...named(/^Pois chiche/),
      ...named(/^Haricot (?:rouge|blanc|noir|coco)/),
    ];
    expect(pulses.length).toBeGreaterThan(5);
    for (const f of pulses) expect(kindsOf(f.code, 'fr').pulse, f.nameFr).toBe(true);
    for (const f of [
      ...named(/^Haricot vert/),
      ...named(/^Haricot beurre/),
      ...named(/^Petits? pois/),
    ]) {
      expect(kindsOf(f.code, 'fr').pulse, f.nameFr).toBe(false);
    }
    const english = [
      ...foods.filter((f) => /^Lentil|^Chickpea|^Kidney bean|^White bean/i.test(f.nameEn)),
    ];
    for (const f of english.slice(0, 15)) expect(kindsOf(f.code, 'en').pulse, f.nameEn).toBe(true);
  });

  it('nuts: unsalted nuts count; salted, caramelised, coconut, nutmeg and drinks do not', () => {
    const plain = [
      byCode.get('15001'), // Cacahuète, sans sel ajouté
      byCode.get('15005'), // Noix, cerneau, séchée
      byCode.get('15053'), // Cacahuète, grillée, sans sel ajouté
      byCode.get('15026'), // Noix de pécan, sans sel ajouté
      byCode.get('15008'), // Noix du Brésil, sans sel ajouté
    ];
    for (const f of plain) expect(kindsOf(f!.code, 'fr').nut, f!.nameFr).toBe(true);
    for (const code of ['15002', '15037', '15057', '15058', '15006', '15007', '11048', '15019']) {
      expect(kindsOf(code, 'fr').nut, byCode.get(code)?.nameFr).toBe(false);
    }
  });

  it('peanut butter is NOT "a handful of unsalted nuts" (it still counts for the peanut allergy)', () => {
    const butters = named(/^Beurre de cacahu/);
    expect(butters.length).toBeGreaterThan(0);
    for (const f of butters) expect(kindsOf(f.code, 'fr').nut, f.nameFr).toBe(false);
  });

  it('wholegrain: wholemeal bread and pasta; white bread, pasta and potatoes are not', () => {
    for (const code of ['7110', '7111', '7109']) {
      expect(kindsOf(code, 'fr'), byCode.get(code)?.nameFr).toMatchObject({
        cerealStarch: true,
        wholegrain: true,
      });
    }
    const white = named(
      /^Pâtes alimentaires, cuites|^Pain (?:de mie|baguette).*(?!complet)/,
    ).filter((f) => !/complet|intégral|seigle/i.test(f.nameFr));
    expect(white.length).toBeGreaterThan(0);
    for (const f of white.slice(0, 20)) {
      expect(kindsOf(f.code, 'fr').wholegrain, f.nameFr).toBe(false);
    }
    for (const f of named(/^Pomme de terre, (?:bouillie|cuite)/).slice(0, 5)) {
      expect(kindsOf(f.code, 'fr').cerealStarch, f.nameFr).toBe(false);
    }
  });

  it('processed meat and red meat are separate; vegetarian look-alikes are neither', () => {
    for (const f of named(
      /^Jambon cuit|^Jambon cru|^Saucisson sec|^Rillettes|^Saucisse de Strasbourg/,
    ).slice(0, 12)) {
      expect(kindsOf(f.code, 'fr'), f.nameFr).toMatchObject({
        processedMeat: true,
        redMeat: false,
      });
    }
    for (const f of named(/^Boeuf, steak haché|^Porc, côte|^Veau, escalope|^Agneau, gigot/).slice(
      0,
      12,
    )) {
      expect(kindsOf(f.code, 'fr').redMeat, f.nameFr).toBe(true);
      expect(kindsOf(f.code, 'fr').processedMeat, f.nameFr).toBe(false);
    }
    for (const f of named(/^Poulet|^Dinde/).slice(0, 12)) {
      expect(kindsOf(f.code, 'fr'), f.nameFr).toMatchObject({ redMeat: false });
    }
  });

  it('sugary drinks: sodas and juices with sugars; not milk, plain tea, water or zero-sugar', () => {
    const juices = named(/^Jus d'orange|^Jus d'ananas|^Jus de pomme/).filter(
      (f) => (f.per100g.sugars ?? 0) >= 5,
    );
    expect(juices.length).toBeGreaterThan(0);
    for (const f of juices) expect(kindsOf(f.code, 'fr').sugaryDrink, f.nameFr).toBe(true);
    expect(kindsOf('18029', 'fr').sugaryDrink).toBe(true); // Boisson rafraîchissante sans alcool
    // Whatever is flagged really is a sweet drink: sugars at 5 g or more, never a milk or a beer.
    const flagged = foods.filter((f) => kindsOf(f.code, 'fr').sugaryDrink);
    expect(flagged.length).toBeGreaterThan(5);
    for (const f of flagged) {
      expect(f.per100g.sugars ?? 0, f.nameFr).toBeGreaterThanOrEqual(5);
      expect(f.nameFr, f.nameFr).not.toMatch(/\blait\b|^vin\b/i);
    }
    for (const f of named(/^Eau |^Thé, infusion|^Café/).slice(0, 12)) {
      expect(kindsOf(f.code, 'fr').sugaryDrink, f.nameFr).toBe(false);
    }
  });

  it('alcohol: beer, wine and spirits; not vinegar or alcohol-free', () => {
    for (const f of named(
      /^Bière (?:brune|forte|"coeur)|^Vin rouge|^Vin blanc|^Whisky|^Cidre/,
    ).slice(0, 12)) {
      expect(kindsOf(f.code, 'fr').alcohol, f.nameFr).toBe(true);
    }
    for (const f of named(/^Vinaigre/)) expect(kindsOf(f.code, 'fr').alcohol, f.nameFr).toBe(false);
  });

  it('a food is rarely several kinds at once: only mixed dishes are', () => {
    const several = foods.filter((f) => {
      const k = kindsOf(f.code, 'fr');
      return (
        [k.fish, k.pulse, k.nut, k.processedMeat, k.redMeat, k.sugaryDrink, k.alcohol].filter(
          Boolean,
        ).length > 1
      );
    });
    expect(several.length).toBeLessThan(foods.length * 0.02);
  });
});
