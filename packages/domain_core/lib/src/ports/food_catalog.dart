// `FoodCatalog` port (AD-4) — every entry surface (manual/voice, barcode,
// photo) resolves to a `DatabaseFood` through this single seam.
//
// Story 1.5 ships the manual/voice adapter (`OfflineFirstFoodCatalog`)
// and the no-op voice transcriber. Stories 1.7 (barcode) and 1.8
// (photo) plug into the same port.
//
// The port deliberately returns a sealed `CatalogResult` rather than a
// raw `List<DatabaseFood>` so the adapter can communicate "no matches
// here, try the manual-add path" (`NotFoundFailure`) and "the catalog
// is unavailable right now" (`CatalogFailure`) without throwing across
// the boundary — typed results, never raw exceptions.

import '../entities/database_food.dart';
import '../results/catalog_failure.dart';

/// The single sanctioned food-catalog port (AD-4).
///
/// Adapters live in `packages/integrations`:
///   * `OfflineFirstFoodCatalog` — Story 1.5 manual/voice surface,
///     ships an in-memory seeded list + LRU for offline replay.
///   * `OpenFoodFactsCatalog`    — Epic 3+ swaps in real OFF lookups
///     behind the same port.
///   * `UsdaCatalog`             — Epic 3+ swaps in real USDA lookups.
///
/// All three implement [FoodCatalog] so the UI never imports the
/// concrete adapter type — only this interface.
abstract interface class FoodCatalog {
  /// Resolve a partial query into ranked matches.
  ///
  /// [query] is the raw text the user has typed (or transcribed).
  /// Adapters are responsible for trimming / case-folding before
  /// matching; callers do not normalise first.
  ///
  /// [limit] is the maximum number of matches returned in
  /// [RankedMatches]. Adapters may cap below this if their internal
  /// ranking returns fewer entries — the contract is "at most [limit]".
  ///
  /// Returns:
  ///   * [RankedMatches] — one or more matches (most relevant first).
  ///   * [NotFoundFailure] — no matches in the catalog (UI renders the
  ///     manual-add fallback).
  ///   * [CatalogFailure] — adapter could not produce a result (UI
  ///     renders the calm failure line).
  Future<CatalogResult> search(String query, {int limit = 10});

  /// Look up a known [DatabaseFood] by its [sourceRef]. Used by the
  /// photo path (Story 1.8) to resolve a candidate from the AI rung's
  /// recognition output without going through free-text search.
  ///
  /// Returns `null` when the catalog has no record with that [sourceRef]
  /// — distinct from [CatalogFailure], which means the adapter itself
  /// could not run. The default implementation falls back to a scan of
  /// the seeded list so the offline-first adapter honours the contract
  /// without an extra code path.
  Future<DatabaseFood?> lookupBySourceRef(String sourceRef) async => null;
}
