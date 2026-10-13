// Minimal food value object — denormalised onto every `FoodEntry` so the
// Day Board (Story 1.3) can render even before the `FoodCatalog` port
// (Story 1.5) lands. The catalog will live behind its own seam later; this
// type is what *captures* the resolved food at log time, not what the
// catalog serves up.
//
// `sourceRef` is the verbatim external reference — an OFF barcode string,
// a USDA FDC id string, or a manual entry's user-chosen label. We do not
// normalise, hash, or remap it here; adapters store it byte-for-byte.
// `SourceCatalog` is the discriminated source enum (`off`, `usda`,
// `manual`) so the UI can colour a chip later without re-parsing the ref.
//
// `foodGroup` is the four-bucket balance tag the arc and the coach compute
// on (UX-DR4 / FR-12). It is persisted with the entry (`food_group` column,
// schema v4 — security review F2), so a re-read plate keeps the group it was
// logged with. The field defaults to `FoodGroup.other` for foods whose group
// is unknown (user-typed names, rows written before v4).

/// Where a `DatabaseFood` came from. `seed` is the curated list shipped in
/// the app (`seed:<name>` refs); `off` is a real Open Food Facts product
/// (a barcode ref); `manual` is a name the user typed or a model returned.
enum SourceCatalog { off, usda, manual, seed }

/// The four food-group buckets the balance arc reports on (UX-DR4).
///
/// Declaration order matches the arc's quadrant order:
/// top (`vegFruit`) → right (`protein`) → bottom (`starch`) → left
/// (`dairy`). `other` is the catch-all for foods that don't fit any of
/// the four (e.g. user-typed custom names, oils, condiments).
enum FoodGroup {
  vegFruit,
  protein,
  starch,
  dairy,
  other;

  /// Short label used by the UI (and the seeded catalog).
  String get label => switch (this) {
    FoodGroup.vegFruit => 'Veg & Fruit',
    FoodGroup.protein => 'Protein',
    FoodGroup.starch => 'Starch',
    FoodGroup.dairy => 'Dairy',
    FoodGroup.other => 'Other',
  };

  /// Parse a closed-enum name (`vegFruit`, `protein`, ...) coming from
  /// storage or from an untrusted source (a model's JSON). Returns `null`
  /// for anything that is not exactly one of the enum names — never a
  /// guess — so the caller can fall back to its own classifier.
  static FoodGroup? tryParse(Object? raw) {
    if (raw is! String) return null;
    final trimmed = raw.trim();
    for (final group in FoodGroup.values) {
      if (group.name == trimmed) return group;
    }
    return null;
  }
}

class DatabaseFood {
  const DatabaseFood({
    required this.sourceRef,
    required this.displayName,
    required this.source,
    this.foodGroup = FoodGroup.other,
  });

  final String sourceRef;
  final String displayName;
  final SourceCatalog source;

  /// The balance-arc bucket the food belongs to. Defaults to
  /// [FoodGroup.other] so pre-1.5 call sites still compile.
  final FoodGroup foodGroup;

  DatabaseFood copyWith({
    String? sourceRef,
    String? displayName,
    SourceCatalog? source,
    FoodGroup? foodGroup,
  }) {
    return DatabaseFood(
      sourceRef: sourceRef ?? this.sourceRef,
      displayName: displayName ?? this.displayName,
      source: source ?? this.source,
      foodGroup: foodGroup ?? this.foodGroup,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! DatabaseFood) return false;
    return other.sourceRef == sourceRef &&
        other.displayName == displayName &&
        other.source == source &&
        other.foodGroup == foodGroup;
  }

  @override
  int get hashCode => Object.hash(sourceRef, displayName, source, foodGroup);

  @override
  String toString() =>
      'DatabaseFood(sourceRef: "$sourceRef", displayName: "$displayName", '
      'source: $source, foodGroup: $foodGroup)';
}
