// Typed results crossing the `FoodCatalog` port (conventions.md / AD-4).
//
// `CatalogResult` is a sealed hierarchy with three variants:
//   * `RankedMatches` — at least one match surfaced for the query; the UI
//     renders the list (FR3).
//   * `NotFoundFailure` — the query matched nothing in the catalog; the UI
//     renders the manual-add form (FR3 / UX-DR11).
//   * `CatalogFailure` — the adapter could not produce a result (network,
//     recognizer down, etc.); the UI shows the calm "Search isn't
//     available right now" line.
//
// `FoodMatch` carries the resolved `DatabaseFood`, the matching score,
// and the quantity presets the user can pick from. `QuantityRange`
// is reused from the existing domain value type so NFR6 ("never kcal-as-
// float crossing ports") holds — the catalog never produces a calorie
// count; every quantity travels as a `QuantityRange`.

import '../entities/database_food.dart';
import '../value_types/quantity_range.dart';

/// Result of a `FoodCatalog.search` call. Exactly one of the three
/// variants applies per call.
sealed class CatalogResult {
  const CatalogResult();
}

/// The query produced one or more matches. The list is ordered most
/// relevant first; the UI may slice to its own row budget.
class RankedMatches extends CatalogResult {
  const RankedMatches(this.matches);

  final List<FoodMatch> matches;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RankedMatches && _listEq(other.matches, matches));

  @override
  int get hashCode => Object.hash('RankedMatches', Object.hashAll(matches));

  @override
  String toString() => 'RankedMatches(${matches.length} matches)';
}

/// The query produced no matches in the catalog. The UI falls back to the
/// manual-add form so the user can still log a plate (FR3).
class NotFoundFailure extends CatalogResult {
  const NotFoundFailure(this.query);

  final String query;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is NotFoundFailure && other.query == query);

  @override
  int get hashCode => Object.hash('NotFoundFailure', query);

  @override
  String toString() => 'NotFoundFailure("$query")';
}

/// The adapter could not produce a result. The exact [reason] is opaque
/// to the domain — callers render the calm failure line; only the
/// adapter logs the raw cause.
class CatalogFailure extends CatalogResult {
  const CatalogFailure(this.reason);

  final Object reason;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CatalogFailure && other.reason == reason);

  @override
  int get hashCode => Object.hash('CatalogFailure', reason);

  @override
  String toString() => 'CatalogFailure($reason)';
}

/// A single ranked match for the user's query. `confidence` is in
/// `[0.0, 1.0]` and is monotonically decreasing across the list — the UI
/// does not need to read it to decide row order, the catalog already did.
class FoodMatch {
  const FoodMatch({
    required this.food,
    required this.confidence,
    required this.presets,
  });

  final DatabaseFood food;

  /// Match score in `[0.0, 1.0]`. Higher is better.
  final double confidence;

  /// Honest quantity ranges the user can pick from for this food
  /// (NFR6). Empty if the catalog has no preset for this food.
  final List<QuantityRange> presets;

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! FoodMatch) return false;
    return other.food == food &&
        other.confidence == confidence &&
        _listEq(other.presets, presets);
  }

  @override
  int get hashCode => Object.hash(food, confidence, Object.hashAll(presets));

  @override
  String toString() =>
      'FoodMatch(${food.displayName}, confidence: $confidence, '
      'presets: ${presets.length})';
}

bool _listEq<T>(List<T> a, List<T> b) {
  if (identical(a, b)) return true;
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}
