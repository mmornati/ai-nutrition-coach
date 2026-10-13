// `classifyFoodGroup` (F2 follow-up): OFF category tags and food names.

import 'package:domain_core/domain_core.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

void main() {
  group('the reported misclassifications', () {
    test('peanut butter is PROTEIN, not dairy (it contains "butter")', () {
      expect(classifyFoodGroup(['Peanut butter']), FoodGroup.protein);
      expect(
        classifyFoodGroup([
          'en:spreads',
          'en:nut-butters',
          'en:peanut-butters',
        ]),
        FoodGroup.protein,
      );
      expect(classifyFoodGroup(['almond butter']), FoodGroup.protein);
      expect(classifyFoodGroup(['tahini']), FoodGroup.protein);
    });

    test('plain butter is still dairy', () {
      expect(classifyFoodGroup(['en:butters']), FoodGroup.dairy);
      expect(classifyFoodGroup(['Butter']), FoodGroup.dairy);
    });

    test(
      'almond / oat / soy milk sit in the dairy quadrant (dairy alternative)',
      () {
        expect(classifyFoodGroup(['Almond milk']), FoodGroup.dairy);
        expect(
          classifyFoodGroup([
            'en:plant-based-foods-and-beverages',
            'en:nut-milks',
            'en:almond-milks',
          ]),
          FoodGroup.dairy,
        );
        expect(classifyFoodGroup(['oat drink']), FoodGroup.dairy);
        expect(classifyFoodGroup(['en:soy-yogurts']), FoodGroup.dairy);
      },
    );

    test('a generic plant-based tag does not hijack an almond milk', () {
      // `en:plant-based-foods` carries no group; the milk tag decides.
      expect(
        classifyFoodGroup(['en:plant-based-foods', 'en:almond-milks']),
        FoodGroup.dairy,
      );
    });
  });

  group('whole-token matching', () {
    test('eggplant is a vegetable, not an egg', () {
      expect(classifyFoodGroup(['Eggplant']), FoodGroup.vegFruit);
      expect(classifyFoodGroup(['en:eggs']), FoodGroup.protein);
    });

    test('licorice is not rice, butterfly is not butter', () {
      expect(classifyFoodGroup(['licorice']), FoodGroup.other);
      expect(classifyFoodGroup(['butterfly pasta']), FoodGroup.starch);
    });

    test('plural / language-prefixed OFF tags', () {
      expect(classifyFoodGroup(['en:fruits', 'en:apples']), FoodGroup.vegFruit);
      expect(classifyFoodGroup(['en:dairy', 'en:yogurts']), FoodGroup.dairy);
      expect(classifyFoodGroup(['fr:berries']), FoodGroup.vegFruit);
      expect(classifyFoodGroup(['en:breads']), FoodGroup.starch);
      expect(classifyFoodGroup(['en:legumes']), FoodGroup.protein);
    });

    test('nothing recognisable is other, never a guess', () {
      expect(classifyFoodGroup(const []), FoodGroup.other);
      expect(
        classifyFoodGroup(['en:spreads', 'en:sweet-spreads']),
        FoodGroup.other,
      );
      expect(classifyFoodGroup(['Dark chocolate']), FoodGroup.other);
    });

    test('dairy wins over a fruit flavour', () {
      expect(classifyFoodGroup(['strawberry yogurt']), FoodGroup.dairy);
    });
  });

  test('every seeded food classifies to its own group by name (or other)', () {
    // The name classifier is a FALLBACK; it must never contradict the
    // curated seed list (a wrong group is worse than `other`).
    for (final seed in seedFoods) {
      // The curated `other` set (nuts, oils, chocolate) is a product choice
      // the name classifier is not asked to reproduce.
      if (seed.foodGroup == FoodGroup.other) continue;
      final guessed = classifyFoodGroup([seed.displayName]);
      expect(
        guessed == seed.foodGroup || guessed == FoodGroup.other,
        isTrue,
        reason: '${seed.displayName}: seed ${seed.foodGroup}, guessed $guessed',
      );
    }
  });
}
