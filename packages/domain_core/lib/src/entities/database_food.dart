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

enum SourceCatalog { off, usda, manual }

class DatabaseFood {
  const DatabaseFood({
    required this.sourceRef,
    required this.displayName,
    required this.source,
  });

  final String sourceRef;
  final String displayName;
  final SourceCatalog source;

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! DatabaseFood) return false;
    return other.sourceRef == sourceRef &&
        other.displayName == displayName &&
        other.source == source;
  }

  @override
  int get hashCode => Object.hash(sourceRef, displayName, source);

  @override
  String toString() =>
      'DatabaseFood(sourceRef: "$sourceRef", displayName: "$displayName", '
      'source: $source)';
}
