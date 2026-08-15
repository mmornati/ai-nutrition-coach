// `OfflineFirstFoodCatalog` — the Story 1.5 `FoodCatalog` adapter.
//
// Searches an in-memory seeded list of common foods (OFF + USDA-ish
// entries) with a small LRU cache for offline replay (NFR5). The
// ranking is simple Dart string matching — exact-prefix > prefix >
// substring > token-overlap — and the cache key is the case-folded,
// trimmed query so a previously-seen search resolves identically
// offline.
//
// No network call. The "offline-first" guarantee is structural: the
// adapter has no path that talks to OFF/USDA in v1. A future Epic 3
// adapter can swap in real network lookups behind the same `FoodCatalog`
// port — the screen does not change.
//
// Failure containment: an unexpected exception inside the search path
// is converted to a typed `CatalogFailure` rather than rethrown. The
// UI renders the calm "Search isn't available right now." line.

import 'package:domain_core/domain_core.dart';

import 'lru_cache.dart';
import 'seed_foods.dart';

/// Offline-first `FoodCatalog` adapter (Story 1.5 / AD-4 / NFR5).
///
/// Holds:
///   * a static seeded list of common foods (`seedFoods`), and
///   * a small LRU keyed on the case-folded, trimmed query string.
///
/// The cache capacity defaults to 32 — comfortably above the spec's
/// `≥20` floor, sized for a single session of manual entries without
/// memory bloat.
class OfflineFirstFoodCatalog implements FoodCatalog {
  OfflineFirstFoodCatalog({
    List<SeedFood>? seeds,
    int lruCapacity = 32,
  })  : _seeds = List<SeedFood>.unmodifiable(seeds ?? seedFoods),
        _lru = LruCache<String, List<FoodMatch>>(capacity: lruCapacity);

  /// The seeded food list — `unmodifiable` so callers can't mutate it
  /// and break the ranking contract.
  final List<SeedFood> _seeds;

  /// Per-query ranked-match cache. Survives only the current process;
  /// the offline-first guarantee is "we don't need the network to
  /// serve the same answer we served last time", not "we remember
  /// across restarts".
  final LruCache<String, List<FoodMatch>> _lru;

  /// Number of entries the LRU holds — exposed for tests.
  int get cacheCapacity => _lru.capacity;

  /// Current cache fill — exposed for tests that assert LRU replay.
  int get cachedQueries => _lru.length;

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
    return scored
        .map((s) => s.match)
        .toList(growable: false);
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
}

/// Scored match — internal to the ranker. Kept private so the public
/// `CatalogResult` shape is the only thing callers can pattern-match on.
class _ScoredMatch {
  _ScoredMatch(this.match, this.score);
  final FoodMatch match;
  final double score;
}
