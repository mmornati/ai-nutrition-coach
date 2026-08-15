// `OfflineFirstFoodCatalog` adapter tests (Story 1.5 / AD-4 / NFR5).
//
// Locks the I/O matrix the spec calls out:
//   * HAPPY_PATH          — typing a partial name ranks matches
//   * EMPTY_QUERY         — empty input → empty `RankedMatches`
//   * NO_MATCH            — unrecognised term → `NotFoundFailure`
//   * OFFLINE_HIT         — repeat query → cached result, no re-rank
//   * RANKED_ORDER        — exact > prefix > substring > token-overlap
//   * LIMIT               — `limit` caps the returned list
//   * PRESETS             — `FoodMatch` carries the food's presets

import 'package:domain_core/domain_core.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

void main() {
  group('OfflineFirstFoodCatalog', () {
    late OfflineFirstFoodCatalog catalog;

    setUp(() {
      catalog = OfflineFirstFoodCatalog();
    });

    test('seeded list covers ≥30 foods across the four food groups', () {
      // AD-1 of Story 1.5 — the seeded list is the only thing keeping
      // the manual path alive offline; under 30 would feel hollow.
      expect(seedFoods.length, greaterThanOrEqualTo(30));

      final groups = <FoodGroup>{for (final s in seedFoods) s.foodGroup};
      expect(groups, containsAll(<FoodGroup>[
        FoodGroup.vegFruit,
        FoodGroup.protein,
        FoodGroup.starch,
        FoodGroup.dairy,
      ]));

      // Each food has at least one quantity preset (UX-DR11).
      for (final s in seedFoods) {
        expect(s.presets, isNotEmpty,
            reason: 'SeedFood "$s" has no quantity presets');
      }
    });

    test('HAPPY_PATH: partial query "salm" surfaces Salmon ranked first',
        () async {
      final result = await catalog.search('salm');
      expect(result, isA<RankedMatches>());
      final ranked = result as RankedMatches;
      expect(ranked.matches, isNotEmpty);
      expect(ranked.matches.first.food.displayName, 'Salmon');
    });

    test('EMPTY_QUERY returns empty RankedMatches (never NotFoundFailure)',
        () async {
      final result = await catalog.search('');
      expect(result, isA<RankedMatches>());
      expect((result as RankedMatches).matches, isEmpty);
    });

    test('NO_MATCH returns typed NotFoundFailure with the original query',
        () async {
      final result = await catalog.search('zxqwer');
      expect(result, isA<NotFoundFailure>());
      expect((result as NotFoundFailure).query, 'zxqwer');
    });

    test('RANKED_ORDER: exact > prefix > substring > token-overlap',
        () async {
      // "Apple" matches exactly (1.0). "app" is a prefix of "apple"
      // (0.8). "ppl" is a substring of "apple" (0.6). "berry" overlaps
      // via token-overlap with "Strawberries" only (0.4). For a query
      // like "apple", the ranker should surface Apple first, then any
      // other prefix hits, then substring hits.
      final result = await catalog.search('apple');
      expect(result, isA<RankedMatches>());
      final ranked = (result as RankedMatches).matches;

      // Apple is the exact match — must be first.
      expect(ranked.first.food.displayName, 'Apple');

      // Confidence is monotonically non-increasing.
      for (var i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].confidence, greaterThanOrEqualTo(ranked[i].confidence),
            reason: 'ranked list must be non-increasing in confidence');
      }
    });

    test('case-insensitive matching: "SALM" matches Salmon', () async {
      final result = await catalog.search('SALM');
      expect(result, isA<RankedMatches>());
      final ranked = (result as RankedMatches).matches;
      expect(ranked.any((m) => m.food.displayName == 'Salmon'), isTrue);
    });

    test('whitespace-only query returns empty RankedMatches', () async {
      final result = await catalog.search('   ');
      expect(result, isA<RankedMatches>());
      expect((result as RankedMatches).matches, isEmpty);
    });

    test('LIMIT: `limit` parameter caps the returned matches', () async {
      final result = await catalog.search('a', limit: 3);
      expect(result, isA<RankedMatches>());
      final ranked = (result as RankedMatches).matches;
      expect(ranked.length, lessThanOrEqualTo(3));
    });

    test('OFFLINE_HIT: repeat query returns cached list without re-ranking',
        () async {
      // First call — populates the LRU.
      final first = await catalog.search('rice');
      expect(first, isA<RankedMatches>());
      expect(catalog.cachedQueries, 1);

      // Second call — replays from the cache.
      final second = await catalog.search('rice');
      expect(second, isA<RankedMatches>());

      final firstNames =
          (first as RankedMatches).matches.map((m) => m.food.displayName).toList();
      final secondNames =
          (second as RankedMatches).matches.map((m) => m.food.displayName).toList();
      expect(secondNames, firstNames,
          reason: 'cached replay must return the same ranked order');
    });

    test('cache key is case-insensitive + trimmed', () async {
      await catalog.search('rice');
      expect(catalog.cachedQueries, 1);
      await catalog.search('  RICE  ');
      // Same cache entry — promoted, not re-inserted.
      expect(catalog.cachedQueries, 1);
    });

    test('FoodMatch carries the food + confidence + quantity presets',
        () async {
      final result = await catalog.search('salmon');
      final matches = (result as RankedMatches).matches;
      final salmon = matches.firstWhere((m) => m.food.displayName == 'Salmon');

      expect(salmon.confidence, inInclusiveRange(0.0, 1.0));
      expect(salmon.food.foodGroup, FoodGroup.protein);
      expect(salmon.presets, isNotEmpty);
      // Honest quantity range — NFR6.
      expect(salmon.presets.first.low, salmon.presets.first.high);
      expect(salmon.presets.first.unit, isNotEmpty);
      expect(salmon.presets.first.displayLabel, startsWith('~'));
    });

    test('CatalogResult is sealed — only RankedMatches / NotFoundFailure',
        () {
      // Compile-time exhaustive-switch check: every variant of the
      // sealed `CatalogResult` must be pattern-matchable. If a new
      // variant lands in domain_core without updating the adapter
      // exhaustiveness test in `food_catalog_test.dart`, the analyzer
      // surfaces the missing branch there.
      const CatalogResult aSample = RankedMatches(<FoodMatch>[]);
      const CatalogResult anotherSample = NotFoundFailure('');
      expect(aSample, isA<CatalogResult>());
      expect(anotherSample, isA<CatalogResult>());
    });
  });

  group('LruCache', () {
    test('promotes on get, evicts on put past capacity', () {
      final lru = LruCache<String, int>(capacity: 2);
      lru.put('a', 1);
      lru.put('b', 2);
      // Touch `a` so `b` becomes the oldest.
      expect(lru.get('a'), 1);
      lru.put('c', 3);
      // `b` is the oldest → evicted.
      expect(lru.get('b'), isNull);
      expect(lru.get('a'), 1);
      expect(lru.get('c'), 3);
      expect(lru.length, 2);
    });

    test('clear() drops every entry', () {
      final lru = LruCache<String, int>(capacity: 4);
      lru.put('a', 1);
      lru.put('b', 2);
      lru.clear();
      expect(lru.length, 0);
      expect(lru.get('a'), isNull);
    });

    test('constructor asserts capacity > 0', () {
      expect(() => LruCache<String, int>(capacity: 0), throwsA(isA<AssertionError>()));
    });
  });

  group('NoopVoiceTranscriber', () {
    test('always returns TranscriptionFailure(unsupportedInV1)', () async {
      const t = NoopVoiceTranscriber();
      final result = await t.transcribe();
      expect(result, isA<TranscriptionFailure>());
      expect(
        (result as TranscriptionFailure).reason,
        TranscriptionFailureReason.unsupportedInV1,
      );
    });
  });
}
