// Draft of a `FoodEntry` — what the caller passes to `RecordPlate` before
// the store assigns an autoincrement id and the parent `plateLogId`.
//
// Lives next to the entity it eventually becomes (conventions.md) so the
// "draft → entry" round-trip is structurally visible: every field on
// `FoodEntryDraft` is also a field on `FoodEntry` minus the ids. The
// adapter maps a draft to the persisted row, then maps the resulting
// row back to a `FoodEntry` with assigned ids; the use-case never sees
// those ids, only the caller via `RecordPlateSuccess(plateLog)`.

import '../entities/database_food.dart';
import 'quantity_range.dart';

class FoodEntryDraft {
  const FoodEntryDraft({required this.databaseFood, required this.quantity});

  final DatabaseFood databaseFood;
  final QuantityRange quantity;

  FoodEntryDraft copyWith({
    DatabaseFood? databaseFood,
    QuantityRange? quantity,
  }) {
    return FoodEntryDraft(
      databaseFood: databaseFood ?? this.databaseFood,
      quantity: quantity ?? this.quantity,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! FoodEntryDraft) return false;
    return other.databaseFood == databaseFood && other.quantity == quantity;
  }

  @override
  int get hashCode => Object.hash(databaseFood, quantity);

  @override
  String toString() =>
      'FoodEntryDraft(databaseFood: $databaseFood, quantity: $quantity)';
}
