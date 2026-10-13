// Which of the four balance-arc quadrants a set of foods covers (UX-DR4).
//
// Computed from the food groups that are persisted with each entry
// (security review F2 / F9) — the arc is a quiet marker of what is on the
// plate, never a score. `other` covers no quadrant.

import '../entities/database_food.dart';

/// Quadrant order of the arc: top `vegFruit`, right `protein`, bottom
/// `starch`, left `dairy` — the declaration order of [FoodGroup] minus
/// `other`.
const List<FoodGroup> kBalanceArcGroups = <FoodGroup>[
  FoodGroup.vegFruit,
  FoodGroup.protein,
  FoodGroup.starch,
  FoodGroup.dairy,
];

/// One flag per quadrant of [kBalanceArcGroups]: `true` when at least one of
/// [groups] belongs to it.
List<bool> balanceCoverage(Iterable<FoodGroup> groups) {
  final present = groups.toSet();
  return <bool>[for (final g in kBalanceArcGroups) present.contains(g)];
}
