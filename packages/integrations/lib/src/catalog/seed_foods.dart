// Seeded food list for `OfflineFirstFoodCatalog` (Story 1.5).
//
// Ships with the package — no network call, no OFF/USDA fetch. ≥30
// curated, offline-safe entries across the four balance-arc buckets
// (UX-DR4) plus a handful of `other` entries for completeness. The
// list is the same shape a real OFF/USDA adapter would produce, so
// the screen and the providers have nothing to change when Epic 3
// swaps the adapter out behind the same `FoodCatalog` port.
//
// Each entry carries:
//   * a canonical `displayName` (the UI surfaces it verbatim),
//   * a `FoodGroup` tag (the balance arc reads this),
//   * one or more honest `QuantityRange` presets (NFR6 — never a
//     kcal-as-float).
//
// `sourceRef` is built by the adapter at lookup time as
// `seed:<displayName>` (case-folded) so it round-trips through
// `DatabaseFood` and never collides with OFF barcodes / USDA FDC ids.

import 'package:domain_core/domain_core.dart';

/// One curated food in the seeded list. The adapter pairs each entry
/// with its `QuantityRange` presets when emitting `FoodMatch`.
class SeedFood {
  const SeedFood({
    required this.displayName,
    required this.foodGroup,
    required this.presets,
  });

  final String displayName;
  final FoodGroup foodGroup;
  final List<QuantityRange> presets;

  @override
  String toString() =>
      'SeedFood("$displayName", group: $foodGroup, '
      'presets: ${presets.length})';
}

/// ≥30 curated foods across the four balance-arc groups + a small
/// `other` set for completeness. The four groups are well-represented
/// so the balance arc has enough variety for the Day Board's preview
/// rendering; the `other` group exists for future expansion (oils,
/// condiments, mixed dishes).
const List<SeedFood> seedFoods = <SeedFood>[
  // ── Veg & Fruit (≥7) ─────────────────────────────────────────
  SeedFood(
    displayName: 'Apple',
    foodGroup: FoodGroup.vegFruit,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'piece', displayLabel: '~1 piece'),
      QuantityRange(low: 2, high: 2, unit: 'piece', displayLabel: '~2 pieces'),
    ],
  ),
  SeedFood(
    displayName: 'Banana',
    foodGroup: FoodGroup.vegFruit,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'piece', displayLabel: '~1 piece'),
    ],
  ),
  SeedFood(
    displayName: 'Orange',
    foodGroup: FoodGroup.vegFruit,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'piece', displayLabel: '~1 piece'),
    ],
  ),
  SeedFood(
    displayName: 'Spinach',
    foodGroup: FoodGroup.vegFruit,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 2, unit: 'cup', displayLabel: '~1–2 cups'),
    ],
  ),
  SeedFood(
    displayName: 'Broccoli',
    foodGroup: FoodGroup.vegFruit,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'cup', displayLabel: '~1 cup'),
    ],
  ),
  SeedFood(
    displayName: 'Carrot',
    foodGroup: FoodGroup.vegFruit,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'piece', displayLabel: '~1 piece'),
      QuantityRange(low: 2, high: 2, unit: 'piece', displayLabel: '~2 pieces'),
    ],
  ),
  SeedFood(
    displayName: 'Tomato',
    foodGroup: FoodGroup.vegFruit,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'piece', displayLabel: '~1 piece'),
    ],
  ),
  SeedFood(
    displayName: 'Avocado',
    foodGroup: FoodGroup.vegFruit,
    presets: <QuantityRange>[
      QuantityRange(
        low: 0.5,
        high: 1,
        unit: 'piece',
        displayLabel: '~½–1 piece',
      ),
    ],
  ),
  SeedFood(
    displayName: 'Strawberries',
    foodGroup: FoodGroup.vegFruit,
    presets: <QuantityRange>[
      QuantityRange(low: 0.5, high: 1, unit: 'cup', displayLabel: '~½–1 cup'),
    ],
  ),

  // ── Protein (≥7) ─────────────────────────────────────────────
  SeedFood(
    displayName: 'Salmon',
    foodGroup: FoodGroup.protein,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'fist', displayLabel: '~1 fist'),
      QuantityRange(
        low: 1.5,
        high: 1.5,
        unit: 'fist',
        displayLabel: '~1.5 fists',
      ),
    ],
  ),
  SeedFood(
    displayName: 'Chicken Breast',
    foodGroup: FoodGroup.protein,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'fist', displayLabel: '~1 fist'),
    ],
  ),
  SeedFood(
    displayName: 'Eggs',
    foodGroup: FoodGroup.protein,
    presets: <QuantityRange>[
      QuantityRange(
        low: 1,
        high: 2,
        unit: 'piece',
        displayLabel: '~1–2 pieces',
      ),
      QuantityRange(low: 3, high: 3, unit: 'piece', displayLabel: '~3 pieces'),
    ],
  ),
  SeedFood(
    displayName: 'Tofu',
    foodGroup: FoodGroup.protein,
    presets: <QuantityRange>[
      QuantityRange(low: 0.5, high: 1, unit: 'cup', displayLabel: '~½–1 cup'),
    ],
  ),
  SeedFood(
    displayName: 'Beef',
    foodGroup: FoodGroup.protein,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'fist', displayLabel: '~1 fist'),
    ],
  ),
  SeedFood(
    displayName: 'Tuna',
    foodGroup: FoodGroup.protein,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'can', displayLabel: '~1 can'),
    ],
  ),
  SeedFood(
    displayName: 'Lentils',
    foodGroup: FoodGroup.protein,
    presets: <QuantityRange>[
      QuantityRange(low: 0.5, high: 1, unit: 'cup', displayLabel: '~½–1 cup'),
    ],
  ),
  SeedFood(
    displayName: 'Chickpeas',
    foodGroup: FoodGroup.protein,
    presets: <QuantityRange>[
      QuantityRange(low: 0.5, high: 1, unit: 'cup', displayLabel: '~½–1 cup'),
    ],
  ),

  // ── Starch (≥7) ──────────────────────────────────────────────
  SeedFood(
    displayName: 'Rice',
    foodGroup: FoodGroup.starch,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'cup', displayLabel: '~1 cup'),
      QuantityRange(low: 2, high: 2, unit: 'cup', displayLabel: '~2 cups'),
    ],
  ),
  SeedFood(
    displayName: 'Pasta',
    foodGroup: FoodGroup.starch,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'cup', displayLabel: '~1 cup'),
    ],
  ),
  SeedFood(
    displayName: 'Bread',
    foodGroup: FoodGroup.starch,
    presets: <QuantityRange>[
      QuantityRange(
        low: 1,
        high: 2,
        unit: 'slice',
        displayLabel: '~1–2 slices',
      ),
    ],
  ),
  SeedFood(
    displayName: 'Potato',
    foodGroup: FoodGroup.starch,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'piece', displayLabel: '~1 piece'),
    ],
  ),
  SeedFood(
    displayName: 'Quinoa',
    foodGroup: FoodGroup.starch,
    presets: <QuantityRange>[
      QuantityRange(low: 0.5, high: 1, unit: 'cup', displayLabel: '~½–1 cup'),
    ],
  ),
  SeedFood(
    displayName: 'Oats',
    foodGroup: FoodGroup.starch,
    presets: <QuantityRange>[
      QuantityRange(low: 0.5, high: 1, unit: 'cup', displayLabel: '~½–1 cup'),
    ],
  ),
  SeedFood(
    displayName: 'Sweet Potato',
    foodGroup: FoodGroup.starch,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'piece', displayLabel: '~1 piece'),
    ],
  ),
  SeedFood(
    displayName: 'Tortilla',
    foodGroup: FoodGroup.starch,
    presets: <QuantityRange>[
      QuantityRange(
        low: 1,
        high: 2,
        unit: 'piece',
        displayLabel: '~1–2 pieces',
      ),
    ],
  ),

  // ── Dairy (≥7) ───────────────────────────────────────────────
  SeedFood(
    displayName: 'Yogurt',
    foodGroup: FoodGroup.dairy,
    presets: <QuantityRange>[
      QuantityRange(low: 0.5, high: 1, unit: 'cup', displayLabel: '~½–1 cup'),
      QuantityRange(low: 1, high: 1, unit: 'cup', displayLabel: '~1 cup'),
    ],
  ),
  SeedFood(
    displayName: 'Milk',
    foodGroup: FoodGroup.dairy,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'cup', displayLabel: '~1 cup'),
    ],
  ),
  SeedFood(
    displayName: 'Cheese',
    foodGroup: FoodGroup.dairy,
    presets: <QuantityRange>[
      QuantityRange(
        low: 1,
        high: 2,
        unit: 'slice',
        displayLabel: '~1–2 slices',
      ),
    ],
  ),
  SeedFood(
    displayName: 'Cottage Cheese',
    foodGroup: FoodGroup.dairy,
    presets: <QuantityRange>[
      QuantityRange(low: 0.5, high: 1, unit: 'cup', displayLabel: '~½–1 cup'),
    ],
  ),
  SeedFood(
    displayName: 'Butter',
    foodGroup: FoodGroup.dairy,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'tbsp', displayLabel: '~1 tbsp'),
    ],
  ),
  SeedFood(
    displayName: 'Greek Yogurt',
    foodGroup: FoodGroup.dairy,
    presets: <QuantityRange>[
      QuantityRange(low: 0.5, high: 1, unit: 'cup', displayLabel: '~½–1 cup'),
    ],
  ),
  SeedFood(
    displayName: 'Kefir',
    foodGroup: FoodGroup.dairy,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'cup', displayLabel: '~1 cup'),
    ],
  ),

  // ── Other (small set for completeness) ────────────────────────
  SeedFood(
    displayName: 'Mixed Nuts',
    foodGroup: FoodGroup.other,
    presets: <QuantityRange>[
      QuantityRange(
        low: 1,
        high: 2,
        unit: 'handful',
        displayLabel: '~1–2 handfuls',
      ),
    ],
  ),
  SeedFood(
    displayName: 'Olive Oil',
    foodGroup: FoodGroup.other,
    presets: <QuantityRange>[
      QuantityRange(low: 1, high: 1, unit: 'tbsp', displayLabel: '~1 tbsp'),
    ],
  ),
  SeedFood(
    displayName: 'Dark Chocolate',
    foodGroup: FoodGroup.other,
    presets: <QuantityRange>[
      QuantityRange(
        low: 1,
        high: 2,
        unit: 'square',
        displayLabel: '~1–2 squares',
      ),
    ],
  ),
];
