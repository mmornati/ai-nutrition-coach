import { describe, expect, it } from 'vitest';
import { databaseFood, foodKinds, type FoodGroup, type Nutrients } from '../src/index';

const food = (displayName: string, foodGroup: FoodGroup = 'other', per100?: Nutrients) =>
  databaseFood({
    sourceRef: `t:${displayName}`,
    displayName,
    source: 'manual',
    foodGroup,
    nutrientsPer100g: per100,
  });
const kinds = (n: string, g: FoodGroup = 'other', per100?: Nutrients) =>
  foodKinds(food(n, g, per100));

describe('what a food is, from its name', () => {
  it('fish, including breaded', () => {
    expect(kinds('Poisson pané, frit', 'protein').fish).toBe(true);
    expect(kinds('Salmon fillet, grilled', 'protein').fish).toBe(true);
    expect(kinds('Sauce au poisson', 'other').fish).toBe(false);
    expect(kinds('Fish oil capsule').fish).toBe(false);
    expect(kinds('Chicken breast', 'protein').fish).toBe(false);
  });

  it('pulses, but not green beans or peas', () => {
    expect(kinds('Lentilles vertes, cuites', 'protein').pulse).toBe(true);
    expect(kinds('Pois chiches, cuits').pulse).toBe(true);
    expect(kinds('Haricots rouges, cuits').pulse).toBe(true);
    expect(kinds('Haricots verts, cuits', 'vegFruit').pulse).toBe(false);
    expect(kinds('Petits pois', 'vegFruit').pulse).toBe(false);
    expect(kinds('Green beans').pulse).toBe(false);
    expect(kinds('Soupe de lentilles').pulse).toBe(true);
  });

  it('wholegrain cereal starches, not potatoes', () => {
    expect(kinds('Pain complet', 'starch').wholegrain).toBe(true);
    expect(kinds('Pâtes complètes, cuites', 'starch').wholegrain).toBe(true);
    expect(kinds('Pâtes, cuites', 'starch')).toMatchObject({
      cerealStarch: true,
      wholegrain: false,
    });
    expect(kinds('Pomme de terre, cuite', 'starch').cerealStarch).toBe(false);
    expect(kinds('Pâté de campagne', 'protein').cerealStarch).toBe(false);
  });

  it('nuts, not coconut, nutmeg, scallops or spreads', () => {
    expect(kinds('Noix, séchées', 'protein').nut).toBe(true);
    // A nut butter is not "a handful of unsalted nuts" (it still counts for the peanut allergy).
    expect(kinds('Beurre de cacahuète', 'protein').nut).toBe(false);
    expect(kinds('Peanut butter', 'protein').nut).toBe(false);
    expect(kinds('Pâte d’arachide').nut).toBe(false);
    expect(kinds('Amandes', 'protein').nut).toBe(true);
    expect(kinds('Peanuts, salted').nut).toBe(false);
    expect(kinds('Noix de coco').nut).toBe(false);
    expect(kinds('Noix de muscade').nut).toBe(false);
    expect(kinds('Noix de Saint-Jacques').nut).toBe(false);
    expect(kinds('Pâte à tartiner chocolat noisette').nut).toBe(false);
  });

  it('processed and red meat are separate kinds', () => {
    expect(kinds('Jambon blanc', 'protein')).toMatchObject({ processedMeat: true, redMeat: false });
    expect(kinds('Saucisson sec', 'protein').processedMeat).toBe(true);
    expect(kinds('Steak haché, bœuf', 'protein')).toMatchObject({
      redMeat: true,
      processedMeat: false,
    });
    expect(kinds('Côte de porc').redMeat).toBe(true);
    expect(kinds('Poulet rôti', 'protein')).toMatchObject({ redMeat: false, processedMeat: false });
    expect(kinds('Jambon végétal').processedMeat).toBe(false);
    // Plant-based versions are neither processed nor red meat, in either language and gender.
    for (const name of [
      'Saucisse végétale',
      'Saucisses végétales',
      'Saucisse végétarienne',
      'Saucisse vegan',
      'Saucisse de soja',
      'Saucisse au tofu',
      'Plant-based sausages',
      'Vegetarian sausage',
      'Lardons végétaux',
      'Steak végétal',
      'Burger vegan',
    ]) {
      expect(kinds(name, 'protein')).toMatchObject({ processedMeat: false, redMeat: false });
    }
    expect(kinds('Saucisse de Toulouse', 'protein').processedMeat).toBe(true);
  });

  it('sugary drinks need the sugars and the name', () => {
    expect(kinds('Cola', 'other', { sugars: 10.6 }).sugaryDrink).toBe(true);
    expect(kinds('Jus d’orange', 'other', { sugars: 8.4 }).sugaryDrink).toBe(true);
    expect(kinds('Cola zéro', 'other', { sugars: 0 }).sugaryDrink).toBe(false);
    expect(kinds('Jus de tomate', 'other', { sugars: 3.5 }).sugaryDrink).toBe(false);
    expect(kinds('Lait demi-écrémé', 'dairy', { sugars: 4.8 }).sugaryDrink).toBe(false);
    expect(kinds('Iced tea, sweetened', 'other', { sugars: 7 }).sugaryDrink).toBe(true);
    expect(kinds('Cola').sugaryDrink).toBe(false); // sugars unknown is never "sugary"
  });

  it('alcohol by name, not alcohol-free or vinegar', () => {
    expect(kinds('Bière blonde').alcohol).toBe(true);
    expect(kinds('Red wine').alcohol).toBe(true);
    expect(kinds('Bière sans alcool').alcohol).toBe(false);
    expect(kinds('Vinaigre de vin').alcohol).toBe(false);
  });
});
