// Honest quantity value type (NFR6 — never false-exact kcal).
//
// A `QuantityRange` is what the UI renders ("~2 fists") and what the store
// persists. Crossing the use-case boundary, every quantity travels as a
// `QuantityRange`; the domain layer never sees a `double` masquerading as a
// calorie count, and adapters never coerce a `QuantityRange` into a kcal
// float. Low and high are `num` so callers can express either an integer
// fist count (`2`) or a fractional cup (`0.5`); the storage adapter
// preserves the value verbatim through string round-trip.
//
// Validity (security review F10): `low` and `high` are finite, non-negative
// and `low <= high`. The constructor asserts it (debug / const evaluation);
// `isValid` is the runtime check the store boundary and `RecordPlate` use,
// because asserts do not run in release builds and quantities also arrive
// from storage and from a language model.
//
// Equality + hashCode use all four fields so identical ranges compare
// equal across processes — important for caching and for tests asserting
// "what I read back equals what I wrote".

class QuantityRange {
  const QuantityRange({
    required this.low,
    required this.high,
    required this.unit,
    required this.displayLabel,
  }) : assert(
         low >= 0 && high >= 0 && low <= high && low < _inf && high < _inf,
         'QuantityRange needs 0 <= low <= high, both finite',
       );

  /// Validating constructor for values that are NOT compile-time constants
  /// (parsed from storage, a model reply, user input). The `const` constructor
  /// can only `assert` (debug builds); this one throws [ArgumentError] in every
  /// build mode, so an invalid range can never be constructed silently.
  factory QuantityRange.checked({
    required num low,
    required num high,
    required String unit,
    required String displayLabel,
  }) {
    if (!isValidRange(low, high)) {
      throw ArgumentError(
        'QuantityRange needs 0 <= low <= high, both finite (got $low..$high)',
      );
    }
    return QuantityRange(
      low: low,
      high: high,
      unit: unit,
      displayLabel: displayLabel,
    );
  }

  static const double _inf = double.infinity;

  final num low;
  final num high;
  final String unit;
  final String displayLabel;

  /// `true` when both halves are finite, non-negative and `low <= high`.
  bool get isValid => isValidRange(low, high);

  /// The same check for raw halves (used before constructing, e.g. when
  /// parsing a stored row).
  static bool isValidRange(num low, num high) =>
      low.isFinite && high.isFinite && low >= 0 && high >= 0 && low <= high;

  QuantityRange copyWith({
    num? low,
    num? high,
    String? unit,
    String? displayLabel,
  }) {
    return QuantityRange.checked(
      low: low ?? this.low,
      high: high ?? this.high,
      unit: unit ?? this.unit,
      displayLabel: displayLabel ?? this.displayLabel,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! QuantityRange) return false;
    return other.low == low &&
        other.high == high &&
        other.unit == unit &&
        other.displayLabel == displayLabel;
  }

  @override
  int get hashCode => Object.hash(low, high, unit, displayLabel);

  @override
  String toString() =>
      'QuantityRange(low: $low, high: $high, unit: "$unit", '
      'displayLabel: "$displayLabel")';
}
