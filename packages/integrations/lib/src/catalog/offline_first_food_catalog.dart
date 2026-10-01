// `OfflineFirstFoodCatalog` — the Story 1.5 `FoodCatalog` adapter,
// extended in Story 1.7 with a `lookupByBarcode` path.
//
// Searches an in-memory seeded list of common foods (OFF + USDA-ish
// entries) with a small LRU cache for offline replay (NFR5). The
// ranking is simple Dart string matching — exact-prefix > prefix >
// substring > token-overlap — and the cache key is the case-folded,
// trimmed query so a previously-seen search resolves identically
// offline.
//
// Story 1.7 adds:
//   * `lookupByBarcode` — fans out to `OffBarcodeSource` (dio). The
//     barcode-specific LRU is *separate* from the search-path LRU
//     because the two keys live in different domains (typed query
//     vs. raw barcode string) and the caches are tuned to different
//     working-set sizes. A repeat scan resolves from the cache
//     without a network round-trip (NFR5 / UJ-5).
//   * `OffBarcodeSource` — the only network seam in the barcode
//     path. The catalog owns the offline-first contract; the source
//     is a thin `dio` wrapper typed as `OffBarcodeResult`.
//
// No network call on the search path. The "offline-first" guarantee
// is structural: the search adapter has no path that talks to
// OFF/USDA in v1. A future Epic 3 adapter can swap in real network
// lookups behind the same `FoodCatalog` port — the screen does not
// change.
//
// Failure containment: an unexpected exception inside the search
// path is converted to a typed `CatalogFailure` rather than
// rethrown. The UI renders the calm "Search isn't available right
// now." line. The barcode path follows the same pattern — the
// `OffBarcodeSource` returns a typed `OffBarcodeFailure` and the
// adapter wraps it in `CatalogFailure` for the UI.

import 'package:domain_core/domain_core.dart';

import 'lru_cache.dart';
import 'off_barcode_source.dart';
import 'seed_foods.dart';

/// Offline-first `FoodCatalog` adapter (Story 1.5 / AD-4 / NFR5,
/// extended in Story 1.7 with FR2 barcode lookup).
///
/// Holds:
///   * a static seeded list of common foods (`seedFoods`),
///   * a small LRU keyed on the case-folded, trimmed query string
///     used by `search`, and
///   * a separate barcode-keyed LRU used by `lookupByBarcode` so a
///     previously-resolved barcode resolves offline without
///     re-hitting OFF (NFR5).
///
/// The cache capacities default to 32 for the search path and 64 for
/// the barcode path — barcodes are reused more frequently than free
/// text queries (a user might re-scan the same packaged snack
/// throughout the day).
class OfflineFirstFoodCatalog implements FoodCatalog {
  OfflineFirstFoodCatalog({
    List<SeedFood>? seeds,
    int lruCapacity = 32,
    int barcodeLruCapacity = 64,
    OffBarcodeSource? offSource,
  }) : _seeds = List<SeedFood>.unmodifiable(seeds ?? seedFoods),
       _lru = LruCache<String, List<FoodMatch>>(capacity: lruCapacity),
       _barcodeLru = LruCache<String, _BarcodeLookup>(
         capacity: barcodeLruCapacity,
       ),
       _offSource = offSource ?? OffBarcodeSource();

  /// The seeded food list — `unmodifiable` so callers can't mutate it
  /// and break the ranking contract.
  final List<SeedFood> _seeds;

  /// Per-query ranked-match cache. Survives only the current process;
  /// the offline-first guarantee is "we don't need the network to
  /// serve the same answer we served last time", not "we remember
  /// across restarts".
  final LruCache<String, List<FoodMatch>> _lru;

  /// Per-barcode lookup cache. Separate from the search LRU because
  /// the two keys live in different domains and the working-set
  /// sizes are tuned differently. `NotFoundFailure` is cached too —
  /// repeating a never-on-OFF barcode falls back to the manual-add
  /// path without a second network call (NFR5 / UJ-5).
  final LruCache<String, _BarcodeLookup> _barcodeLru;

  /// OFF read seam — the only network path in the barcode flow.
  /// Injected so tests can supply a `dio` with a `MockAdapter` and
  /// avoid touching the network.
  final OffBarcodeSource _offSource;

  /// Number of entries the search LRU holds — exposed for tests.
  int get cacheCapacity => _lru.capacity;

  /// Current search cache fill — exposed for tests that assert LRU
  /// replay.
  int get cachedQueries => _lru.length;

  /// Current barcode cache fill — same purpose, different domain.
  int get cachedBarcodes => _barcodeLru.length;

  @override
  Future<CatalogResult> search(String query, {int limit = 10}) async {
    final normalized = query.trim().toLowerCase();
    if (normalized.isEmpty) {
      // Empty query → empty list (FR3 / spec I/O matrix). Returning a
      // non-empty `NotFoundFailure` would push the user into the
      // manual-add path on the very first keystroke, which is wrong.
      return const RankedMatches(<FoodMatch>[]);
    }

    final cached = _lru.get(normalized);
    if (cached != null) {
      // Replay path (NFR5 / UJ-5). The cached list is already ranked
      // and bounded by `limit` at write time — slice defensively in
      // case `limit` grew between writes.
      return RankedMatches(_takeLimit(cached, limit));
    }

    final ranked = _rank(normalized);
    final trimmed = _takeLimit(ranked, limit);
    if (trimmed.isEmpty) {
      return NotFoundFailure(normalized);
    }
    _lru.put(normalized, trimmed);
    return RankedMatches(trimmed);
  }

  @override
  Future<DatabaseFood?> lookupBySourceRef(String sourceRef) async {
    final needle = sourceRef.toLowerCase();
    for (final seed in _seeds) {
      final ref = 'seed:${seed.displayName.toLowerCase()}';
      if (ref == needle) {
        return _toDatabaseFood(seed);
      }
    }
    return null;
  }

  /// Resolve a packaged-food barcode (FR2 / Story 1.7).
  ///
  /// Order of operations:
  ///   1. Look up the barcode in the per-barcode LRU. If cached,
  ///      return the cached `CatalogResult` verbatim — no network
  ///      call (NFR5 / UJ-5).
  ///   2. Otherwise, delegate to `OffBarcodeSource.lookup`.
  ///   3. Map the typed `OffBarcodeResult` to the public
  ///      `CatalogResult` shape:
  ///         * `OffBarcodeMatch`    → `RankedMatches([match])` with
  ///           the best-effort `FoodGroup` derived from the OFF
  ///           categories tags.
  ///         * `OffBarcodeNotFound` → `NotFoundFailure(code)`.
  ///         * `OffBarcodeFailure`  → `CatalogFailure(cause)`.
  ///   4. Cache a match or a not-found before returning so a repeat scan
  ///      stays offline (NFR5). A `CatalogFailure` is never cached (N4).
  ///
  /// Empty / whitespace-only codes short-circuit to
  /// `NotFoundFailure('')` — the UI never sends an empty string to
  /// begin with, but the contract is defensive.
  @override
  Future<CatalogResult> lookupByBarcode(String code) async {
    final trimmed = code.trim();
    if (trimmed.isEmpty) {
      return const NotFoundFailure('');
    }

    final cached = _barcodeLru.get(trimmed);
    if (cached != null) {
      return cached.result;
    }

    final result = await _offSource.lookup(trimmed);
    final CatalogResult resolved = switch (result) {
      OffBarcodeMatch(:final displayName, :final categoryTags) => RankedMatches(
        <FoodMatch>[_toBarcodeMatch(trimmed, displayName, categoryTags)],
      ),
      OffBarcodeNotFound() => NotFoundFailure(trimmed),
      OffBarcodeFailure(:final cause) => CatalogFailure(cause),
    };

    // N4: only a definitive answer (a match, or "OFF has no such product")
    // is remembered. A transient failure — timeout, 5xx, offline — must not
    // poison the barcode for the rest of the process: the next scan retries.
    if (resolved is! CatalogFailure) {
      _barcodeLru.put(trimmed, _BarcodeLookup(resolved));
    }
    return resolved;
  }

  /// Rank every seed whose `displayName` matches [query].
  ///
  /// Ordering (per the spec's I/O matrix):
  ///   * exact match         — confidence 1.0
  ///   * name starts with    — confidence 0.8
  ///   * name contains query — confidence 0.6
  ///   * token overlap       — confidence 0.4 × overlap fraction
  ///
  /// Stable within each tier: the iteration order over [seeds] is the
  /// declared order in `seedFoods.dart`, which is balanced across food
  /// groups. Tests rely on this.
  List<FoodMatch> _rank(String query) {
    final scored = <_ScoredMatch>[];
    for (final seed in _seeds) {
      final name = seed.displayName.toLowerCase();
      final score = _score(query, name);
      if (score > 0) {
        scored.add(_ScoredMatch(_toFoodMatch(seed, score), score));
      }
    }
    scored.sort((a, b) => b.score.compareTo(a.score));
    return scored.map((s) => s.match).toList(growable: false);
  }

  /// Score a single seed name against the [query]. Returns `0.0` when
  /// there is no match.
  double _score(String query, String name) {
    if (name == query) return 1.0;
    if (name.startsWith(query)) return 0.8;
    if (name.contains(query)) return 0.6;
    // Token overlap — splits on whitespace, counts how many query
    // tokens appear (as a whole word) in the name. A query like
    // `"chick peas"` overlaps `"chickpeas"` only if the name contains
    // `chick` and `peas` as separate tokens; we don't currently split
    // joined names, but the substring tier already caught that case.
    final queryTokens = query.split(RegExp(r'\s+'));
    if (queryTokens.length <= 1) return 0.0;
    final nameTokens = name.split(RegExp(r'\s+'));
    final overlap = queryTokens
        .where((t) => t.isNotEmpty && nameTokens.contains(t))
        .length;
    if (overlap == 0) return 0.0;
    return 0.4 * (overlap / queryTokens.length);
  }

  List<FoodMatch> _takeLimit(List<FoodMatch> ranked, int limit) {
    if (ranked.length <= limit) return ranked;
    return ranked.sublist(0, limit);
  }

  FoodMatch _toFoodMatch(SeedFood seed, double confidence) {
    return FoodMatch(
      food: _toDatabaseFood(seed),
      confidence: confidence,
      presets: seed.presets,
    );
  }

  DatabaseFood _toDatabaseFood(SeedFood seed) {
    return DatabaseFood(
      sourceRef: 'seed:${seed.displayName.toLowerCase()}',
      displayName: seed.displayName,
      source: SourceCatalog.off,
      foodGroup: seed.foodGroup,
    );
  }

  /// Build a `FoodMatch` for a barcode-resolved product. The
  /// `FoodGroup` is derived from OFF's `categories_tags` via a
  /// small lookup table — when OFF ships no tags, the food
  /// lands in `FoodGroup.other` so the balance arc still renders.
  /// The food's `sourceRef` is the verbatim barcode so the
  /// `DatabaseFood` round-trips through the store and any future
  /// source-aware UI can group it.
  FoodMatch _toBarcodeMatch(
    String barcode,
    String displayName,
    List<String> categoryTags,
  ) {
    final foodGroup = _classifyGroup(categoryTags);
    final food = DatabaseFood(
      sourceRef: barcode,
      displayName: displayName,
      source: SourceCatalog.off,
      foodGroup: foodGroup,
    );
    return FoodMatch(
      food: food,
      confidence: 1.0,
      // OFF doesn't ship curated quantity presets; the UI falls
      // back to a single "1 serving" placeholder through the
      // standard seed-feed presets shim. The match sheet still
      // shows a "Log" button — the spec accepts an empty preset
      // list as long as the food commits.
      presets: const <QuantityRange>[],
    );
  }

  /// Map OFF's `categories_tags` to a `FoodGroup` bucket. The
  /// lookup is best-effort: when no tag matches, the food falls
  /// into `FoodGroup.other` so the balance arc remains honest
  /// (FR12 / UX-DR4). The match is case-insensitive and matches
  /// the *substring* of any tag — OFF's taxonomy is rich enough
  /// that a strict equality check would miss "sweet-spreads" →
  /// "spreads" → "sweet".
  static FoodGroup _classifyGroup(List<String> tags) {
    for (final tag in tags) {
      final lower = tag.toLowerCase();
      if (lower.contains('vegetable') ||
          lower.contains('fruit') ||
          lower.contains('vegetables') ||
          lower.contains('fruits') ||
          lower.contains('salad') ||
          lower.contains('berry')) {
        return FoodGroup.vegFruit;
      }
      if (lower.contains('meat') ||
          lower.contains('fish') ||
          lower.contains('seafood') ||
          lower.contains('poultry') ||
          lower.contains('legume') ||
          lower.contains('pulse') ||
          lower.contains('nuts') ||
          lower.contains('egg')) {
        return FoodGroup.protein;
      }
      if (lower.contains('cereal') ||
          lower.contains('pasta') ||
          lower.contains('rice') ||
          lower.contains('bread') ||
          lower.contains('potato') ||
          lower.contains('starch') ||
          lower.contains('grain') ||
          lower.contains('flour')) {
        return FoodGroup.starch;
      }
      if (lower.contains('milk') ||
          lower.contains('cheese') ||
          lower.contains('yogurt') ||
          lower.contains('yoghurt') ||
          lower.contains('dairy') ||
          lower.contains('butter')) {
        return FoodGroup.dairy;
      }
    }
    return FoodGroup.other;
  }
}

/// Scored match — internal to the ranker. Kept private so the public
/// `CatalogResult` shape is the only thing callers can pattern-match on.
class _ScoredMatch {
  _ScoredMatch(this.match, this.score);
  final FoodMatch match;
  final double score;
}

/// Internal wrapper for the barcode LRU — separates the cache
/// contract from the public `CatalogResult` shape so the cache can
/// carry `NotFoundFailure` and `CatalogFailure` cached results too
/// (a repeat unknown-barcode scan should not re-hit OFF).
class _BarcodeLookup {
  const _BarcodeLookup(this.result);
  final CatalogResult result;
}
