// A single resolved food on a plate — what the store commits and what the
// Day Board (Story 1.3) renders. `plateLogId` is the back-ref to the
// parent `PlateLog`; the drift schema denormalises the embedded
// `DatabaseFood` + `QuantityRange` so the row is self-contained for the
// render path without a future join.

import '../value_types/quantity_range.dart';
import 'database_food.dart';

class FoodEntry {
  const FoodEntry({
    required this.id,
    required this.plateLogId,
    required this.databaseFood,
    required this.quantity,
  });

  final int id;
  final int plateLogId;
  final DatabaseFood databaseFood;
  final QuantityRange quantity;

  FoodEntry copyWith({
    int? id,
    int? plateLogId,
    DatabaseFood? databaseFood,
    QuantityRange? quantity,
  }) {
    return FoodEntry(
      id: id ?? this.id,
      plateLogId: plateLogId ?? this.plateLogId,
      databaseFood: databaseFood ?? this.databaseFood,
      quantity: quantity ?? this.quantity,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! FoodEntry) return false;
    return other.id == id &&
        other.plateLogId == plateLogId &&
        other.databaseFood == databaseFood &&
        other.quantity == quantity;
  }

  @override
  int get hashCode => Object.hash(id, plateLogId, databaseFood, quantity);

  @override
  String toString() =>
      'FoodEntry(id: $id, plateLogId: $plateLogId, '
      'databaseFood: $databaseFood, quantity: $quantity)';
}
