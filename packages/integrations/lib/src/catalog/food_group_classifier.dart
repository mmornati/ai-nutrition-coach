// Best-effort `FoodGroup` classification from descriptive text.
//
// Used in two places, which is why it lives on its own:
//   * the barcode path classifies Open Food Facts `categories_tags`
//     (`en:almond-milks`, `en:peanut-butters`, ...);
//   * the BYOK photo path falls back to it when the model's food has no
//     valid `group` (the model's group is validated against the closed
//     `FoodGroup` enum first), classifying the food NAME.
//
// Matching is on whole tokens (lowercased, `xx:` language prefix removed,
// `-` / `_` treated as spaces, simple plural stemming) — not substrings — so
// `eggplant` is not an egg, `licorice` is not rice and `butterfly` is not
// butter. Two overrides run before the generic keyword scan because the
// generic words mislead (security review F2 follow-up):
//
//   * nut / seed butters (`peanut butter`, `almond butter`, `tahini`) are
//     PROTEIN, not dairy;
//   * plant milks and dairy substitutes (`almond milk`, `oat drink`,
//     `soy yogurt`) sit in the DAIRY quadrant — the arc's quadrant is the
//     "milk and its alternatives" slot, and "milk" is how the user thinks of
//     it. (Documented, deliberate: no group is the honest "other" for them.)
//
// Anything that matches nothing is `other` — never a guess. Pure Dart.

import 'package:domain_core/domain_core.dart';

/// Classify [descriptors] (OFF category tags, or a single food name). The
/// first descriptor that classifies wins, after the two override passes.
FoodGroup classifyFoodGroup(Iterable<String> descriptors) {
  final normalized = [for (final d in descriptors) _tokens(d)];
  for (final tokens in normalized) {
    if (_isNutButter(tokens)) return FoodGroup.protein;
  }
  for (final tokens in normalized) {
    if (_isPlantMilk(tokens)) return FoodGroup.dairy;
  }
  for (final tokens in normalized) {
    final group = _classifyTokens(tokens);
    if (group != FoodGroup.other) return group;
  }
  return FoodGroup.other;
}

List<String> _tokens(String raw) {
  var text = raw.toLowerCase().trim();
  // `en:almond-milks` -> `almond-milks`
  final colon = text.indexOf(':');
  if (colon >= 0 && colon <= 3) text = text.substring(colon + 1);
  return [
    for (final t in text.split(RegExp(r'[^a-z0-9]+')))
      if (t.isNotEmpty) _singular(t),
  ];
}

String _singular(String t) {
  if (t.length > 4 && t.endsWith('ies')) {
    return '${t.substring(0, t.length - 3)}y';
  }
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) {
    return t.substring(0, t.length - 1);
  }
  return t;
}

const Set<String> _nutWords = {
  'peanut',
  'almond',
  'cashew',
  'hazelnut',
  'walnut',
  'pistachio',
  'pecan',
  'nut',
  'seed',
  'sesame',
  'sunflower',
};

bool _isNutButter(List<String> tokens) {
  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i] == 'tahini') return true;
    if (tokens[i] == 'butter' && i > 0 && _nutWords.contains(tokens[i - 1])) {
      return true;
    }
    if (tokens[i] == 'spread' && i > 0 && _nutWords.contains(tokens[i - 1])) {
      return true;
    }
  }
  return false;
}

const Set<String> _plantWords = {
  'almond',
  'soy',
  'soya',
  'soja',
  'oat',
  'rice',
  'coconut',
  'hazelnut',
  'cashew',
  'nut',
  'pea',
  'plant',
  'vegetable',
  'vegan',
};

bool _isPlantMilk(List<String> tokens) {
  for (var i = 0; i < tokens.length; i++) {
    final t = tokens[i];
    if ((t == 'substitute' || t == 'alternative') &&
        i > 0 &&
        (tokens[i - 1] == 'dairy' || tokens[i - 1] == 'milk')) {
      return true;
    }
    if (t == 'non' && i + 1 < tokens.length && tokens[i + 1] == 'dairy') {
      return true;
    }
    final isMilkWord =
        t == 'milk' || t == 'drink' || t == 'yogurt' || t == 'yoghurt';
    if (isMilkWord && i > 0) {
      // `almond milk`, `plant based milk`, `oat drink`, `soy yogurt`
      for (var j = 0; j < i; j++) {
        if (_plantWords.contains(tokens[j])) return true;
      }
    }
  }
  return false;
}

const Set<String> _dairy = {
  'milk',
  'cheese',
  'yogurt',
  'yoghurt',
  'dairy',
  'butter',
  'cream',
  'kefir',
};
const Set<String> _protein = {
  'meat',
  'fish',
  'seafood',
  'poultry',
  'legume',
  'pulse',
  'nut',
  'peanut',
  'egg',
  'tofu',
  'beef',
  'pork',
  'chicken',
  'turkey',
  'lamb',
  'ham',
  'sausage',
  'salmon',
  'tuna',
  'shrimp',
  'lentil',
  'chickpea',
  'bean',
  'tempeh',
};
const Set<String> _starch = {
  'cereal',
  'pasta',
  'rice',
  'bread',
  'potato',
  'starch',
  'grain',
  'flour',
  'oat',
  'quinoa',
  'noodle',
  'tortilla',
  'couscous',
  'bagel',
};
const Set<String> _vegFruit = {
  'vegetable',
  'fruit',
  'salad',
  'berry',
  'eggplant',
  'aubergine',
  'apple',
  'banana',
  'orange',
  'tomato',
  'carrot',
  'spinach',
  'broccoli',
  'cucumber',
  'lettuce',
  'onion',
  'pepper',
  'grape',
  'pear',
  'peach',
  'mango',
  'lemon',
  'avocado',
};

FoodGroup _classifyTokens(List<String> tokens) {
  bool any(Set<String> words) => tokens.any(words.contains);
  // `eggplant` is one token, so `egg` never matches it. Order: the group a
  // word is MOST specifically about first — dairy beats a fruit flavour
  // ("fruit yogurt"), starch beats a vegetable adjective.
  if (any(_dairy)) return FoodGroup.dairy;
  if (any(_protein)) return FoodGroup.protein;
  if (any(_starch)) return FoodGroup.starch;
  if (any(_vegFruit)) return FoodGroup.vegFruit;
  return FoodGroup.other;
}
