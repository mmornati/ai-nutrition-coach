// `FoodEntry` row — denormalised `DatabaseFood` + `QuantityRange`
// columns so the render path is a single row read with no future join.
//
// The numeric halves of the quantity are stored as text rather than
// REAL/INTEGER because `num` accepts both int and double and we want a
// verbatim round-trip — a `0.5` cup must come back as `0.5`, not `0`
// after a numeric coercion. Drift's `TextColumn` keeps the value as the
// caller formatted it.

import 'package:drift/drift.dart';

// `idx_entry_plate`: the range join reads a plate's entries by `plate_log_id`.
@TableIndex(name: 'idx_entry_plate', columns: {#plateLogId})
@DataClassName('FoodEntryTableData')
class FoodEntryTable extends Table {
  IntColumn get id => integer().autoIncrement()();

  /// Back-ref to the parent `PlateLogTable.id`. No DB-level FK is wired
  /// here — cascade rules belong to a later story when the schema grows.
  IntColumn get plateLogId => integer()();

  /// Denormalised `DatabaseFood`.
  TextColumn get databaseFoodSourceRef => text()();
  TextColumn get databaseFoodDisplayName => text()();
  TextColumn get databaseFoodSource => text()();

  /// `FoodGroup.name` of the food (security review F2). Persisted so a
  /// re-read plate keeps the group it was logged with — the coach and the
  /// balance arc read it. Schema v4; rows written before it migrate to
  /// `other` (unknown), which is the honest value for them.
  TextColumn get foodGroup => text().withDefault(const Constant('other'))();

  /// Denormalised `QuantityRange`. Numeric halves stored as text so the
  /// round-trip is verbatim — `0.5` comes back as `0.5`, not `0`.
  TextColumn get quantityLow => text()();
  TextColumn get quantityHigh => text()();
  TextColumn get quantityUnit => text()();
  TextColumn get quantityDisplayLabel => text()();
}
