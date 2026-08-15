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
// Equality + hashCode use all four fields so identical ranges compare
// equal across processes — important for caching and for tests asserting
// "what I read back equals what I wrote".

class QuantityRange {
  const QuantityRange({
    required this.low,
    required this.high,
    required this.unit,
    required this.displayLabel,
  });

  final num low;
  final num high;
  final String unit;
  final String displayLabel;

  QuantityRange copyWith({
    num? low,
    num? high,
    String? unit,
    String? displayLabel,
  }) {
    return QuantityRange(
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
