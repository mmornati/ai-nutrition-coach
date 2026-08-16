// One recognized item from an `AiRung.recognize` call (Story 1.8 / NFR6).
//
// A `RecognizedFood` carries:
//   * the resolved `DatabaseFood` (denormalised so the UI + commit
//     path can render without a future catalog join),
//   * a confidence score in `[0.0, 1.0]` — adapter-specific and
//     monotonic across a single `RecognizedPlate`,
//   * an honest `QuantityRange` quantity preset — NFR6: never a
//     kcal-as-float crossing the port; the rung ships the same
//     `QuantityRange` value type the rest of the domain uses so the
//     log path never coerces to a calorie count.
//
// Value type — equality + hashCode use all three fields so identical
// recognitions compare equal across processes. The `confidence` is a
// `double`; tests should not assert on exact equality of computed
// confidences (use `closeTo`).

import '../entities/database_food.dart';
import '../value_types/quantity_range.dart';

class RecognizedFood {
  const RecognizedFood({
    required this.databaseFood,
    required this.confidence,
    required this.quantity,
  });

  /// The denormalised food the rung resolved from the photo. The
  /// match sheet + commit path render this verbatim.
  final DatabaseFood databaseFood;

  /// Match score in `[0.0, 1.0]`. Higher is better; the rung is
  /// free to pick its own scoring but must respect the bounds.
  final double confidence;

  /// Honest quantity range the rung is willing to commit (NFR6).
  /// The UI's preset row seeds from this; the user can override
  /// with a different `QuantityRange` from the catalog.
  final QuantityRange quantity;

  RecognizedFood copyWith({
    DatabaseFood? databaseFood,
    double? confidence,
    QuantityRange? quantity,
  }) {
    return RecognizedFood(
      databaseFood: databaseFood ?? this.databaseFood,
      confidence: confidence ?? this.confidence,
      quantity: quantity ?? this.quantity,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! RecognizedFood) return false;
    return other.databaseFood == databaseFood &&
        other.confidence == confidence &&
        other.quantity == quantity;
  }

  @override
  int get hashCode => Object.hash(databaseFood, confidence, quantity);

  @override
  String toString() =>
      'RecognizedFood(${databaseFood.displayName}, '
      'confidence: $confidence, quantity: $quantity)';
}
