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
// `foodGroup` is the four-bucket balance tag the arc computes on (UX-DR4 /
// FR-12). Story 1.5 ships it so the catalog can classify seed entries and
// future stories can compute a real balance arc from the resolved food. The
// field defaults to `FoodGroup.other` so existing call sites that pre-date
// Story 1.5 keep compiling without an exhaustive migration pass — the drift
// adapter still round-trips the new column explicitly when it's available.

enum SourceCatalog { off, usda, manual }

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
