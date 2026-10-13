// `FoodCatalog` port (AD-4) — every entry surface (manual/voice, barcode,
// photo) resolves to a `DatabaseFood` through this single seam.
//
// Story 1.5 ships the manual/voice adapter (`OfflineFirstFoodCatalog`)
// and the no-op voice transcriber. Story 1.7 (barcode) extends the
// port with `lookupByBarcode` and plumbs OFF reads (no API key)
// + the same offline LRU so a repeat scan works offline. Story 1.8
// (photo) plugs into the same port.
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
///     Story 1.7 extends it with `lookupByBarcode` for the FR2
///     barcode path; the OFF read source is the only network call.
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
  /// could not run.
  Future<DatabaseFood?> lookupBySourceRef(String sourceRef);

  /// Resolve a packaged-food barcode into a ranked match list (Story 1.7 / FR2).
  ///
  /// [code] is the raw barcode string the scanner produced (EAN-8 /
  /// EAN-13 / UPC-A / UPC-E). Adapters are responsible for trimming
  /// before the lookup; callers do not normalise first.
  ///
  /// Returns:
  ///   * [RankedMatches] — one or more matches (most relevant first).
  ///     A typical OFF barcode lookup returns a single match (the
  ///     product OFF resolved) — the adapter still wraps it in
  ///     [RankedMatches] so the UI can use the same list rendering.
  ///   * [NotFoundFailure] — the barcode matched nothing in the
  ///     catalog (UI pushes the user to the manual-add path with the
  ///     scanned code pre-filled).
  ///   * [CatalogFailure] — adapter could not produce a result
  ///     (network down, OFF 5xx, etc.). UI renders the calm
  ///     "Search isn't available right now" line and still offers
  ///     manual entry.
  ///
  /// An adapter without barcode support returns `NotFoundFailure(code)`.
  Future<CatalogResult> lookupByBarcode(String code);
}
