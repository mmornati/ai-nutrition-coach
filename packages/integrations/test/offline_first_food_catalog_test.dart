// `OfflineFirstFoodCatalog` adapter tests (Story 1.5 / AD-4 / NFR5,
// extended in Story 1.7 with FR2 barcode lookup).
//
// Locks the I/O matrix the spec calls out for the search path:
//   * HAPPY_PATH          — typing a partial name ranks matches
//   * EMPTY_QUERY         — empty input → empty `RankedMatches`
//   * NO_MATCH            — unrecognised term → `NotFoundFailure`
//   * OFFLINE_HIT         — repeat query → cached result, no re-rank
//   * RANKED_ORDER        — exact > prefix > substring > token-overlap
//   * LIMIT               — `limit` caps the returned list
//   * PRESETS             — `FoodMatch` carries the food's presets
//
// Story 1.7 adds coverage for the barcode path:
//   * HAPPY_PATH_KNOWN    — known OFF barcode resolves to
//                           `RankedMatches([single match])`
//   * OFFLINE_HIT         — repeat scan → cached, no second network call
//   * NOT_FOUND           — OFF 404 / `status === 0` →
//                           `NotFoundFailure(barcode)`
//   * OFF_5XX             — OFF 500 → `CatalogFailure`
//   * FOOD_GROUP          — OFF `categories_tags` pick the right
//                           `FoodGroup` bucket for the balance arc
//   * SOURCE_REF          — barcode round-trips as
//                           `DatabaseFood.sourceRef`
//   * EMPTY_CODE          — empty input → `NotFoundFailure('')`
//   * TRIMMED_KEY         — the cache key is trimmed (whitespace
//                           around the barcode is irrelevant)
//
// The `OffBarcodeSource` is a `_FakeOffSource` so tests can stay
// hermetic and exercise the adapter's response mapping without
// touching the network.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
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
      expect(
        groups,
        containsAll(<FoodGroup>[
          FoodGroup.vegFruit,
          FoodGroup.protein,
          FoodGroup.starch,
          FoodGroup.dairy,
        ]),
      );

      // Each food has at least one quantity preset (UX-DR11).
      for (final s in seedFoods) {
        expect(
          s.presets,
          isNotEmpty,
          reason: 'SeedFood "$s" has no quantity presets',
        );
      }
    });

    test(
      'HAPPY_PATH: partial query "salm" surfaces Salmon ranked first',
      () async {
        final result = await catalog.search('salm');
        expect(result, isA<RankedMatches>());
        final ranked = result as RankedMatches;
        expect(ranked.matches, isNotEmpty);
        expect(ranked.matches.first.food.displayName, 'Salmon');
      },
    );

    test(
      'EMPTY_QUERY returns empty RankedMatches (never NotFoundFailure)',
      () async {
        final result = await catalog.search('');
        expect(result, isA<RankedMatches>());
        expect((result as RankedMatches).matches, isEmpty);
      },
    );

    test(
      'NO_MATCH returns typed NotFoundFailure with the original query',
      () async {
        final result = await catalog.search('zxqwer');
        expect(result, isA<NotFoundFailure>());
        expect((result as NotFoundFailure).query, 'zxqwer');
      },
    );

    test('RANKED_ORDER: exact > prefix > substring > token-overlap', () async {
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
        expect(
          ranked[i - 1].confidence,
          greaterThanOrEqualTo(ranked[i].confidence),
          reason: 'ranked list must be non-increasing in confidence',
        );
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

    test(
      'OFFLINE_HIT: repeat query returns cached list without re-ranking',
      () async {
        // First call — populates the LRU.
        final first = await catalog.search('rice');
        expect(first, isA<RankedMatches>());
        expect(catalog.cachedQueries, 1);

        // Second call — replays from the cache.
        final second = await catalog.search('rice');
        expect(second, isA<RankedMatches>());

        final firstNames = (first as RankedMatches).matches
            .map((m) => m.food.displayName)
            .toList();
        final secondNames = (second as RankedMatches).matches
            .map((m) => m.food.displayName)
            .toList();
        expect(
          secondNames,
          firstNames,
          reason: 'cached replay must return the same ranked order',
        );
      },
    );

    test('cache key is case-insensitive + trimmed', () async {
      await catalog.search('rice');
      expect(catalog.cachedQueries, 1);
      await catalog.search('  RICE  ');
      // Same cache entry — promoted, not re-inserted.
      expect(catalog.cachedQueries, 1);
    });

    test(
      'FoodMatch carries the food + confidence + quantity presets',
      () async {
        final result = await catalog.search('salmon');
        final matches = (result as RankedMatches).matches;
        final salmon = matches.firstWhere(
          (m) => m.food.displayName == 'Salmon',
        );

        expect(salmon.confidence, inInclusiveRange(0.0, 1.0));
        expect(salmon.food.foodGroup, FoodGroup.protein);
        expect(salmon.presets, isNotEmpty);
        // Honest quantity range — NFR6.
        expect(salmon.presets.first.low, salmon.presets.first.high);
        expect(salmon.presets.first.unit, isNotEmpty);
        expect(salmon.presets.first.displayLabel, startsWith('~'));
      },
    );

    test('CatalogResult is sealed — only RankedMatches / NotFoundFailure', () {
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

  group('OfflineFirstFoodCatalog.lookupByBarcode (Story 1.7 / FR2)', () {
    late OfflineFirstFoodCatalog catalog;
    late _FakeOffSource offSource;

    setUp(() {
      offSource = _FakeOffSource();
      catalog = OfflineFirstFoodCatalog(offSource: offSource);
    });

    test('HAPPY_PATH_KNOWN: barcode resolves to a single RankedMatches '
        'with OFF display name and the matched barcode in sourceRef', () async {
      offSource.setMatch(
        '3017620422003',
        displayName: 'Nutella',
        categoryTags: const ['en:spreads', 'en:sweet-spreads'],
      );

      final result = await catalog.lookupByBarcode('3017620422003');
      expect(result, isA<RankedMatches>());
      final ranked = result as RankedMatches;
      expect(ranked.matches, hasLength(1));
      final match = ranked.matches.first;
      expect(match.food.displayName, 'Nutella');
      expect(match.food.sourceRef, '3017620422003');
      expect(match.food.source, SourceCatalog.off);
      expect(offSource.callCount('3017620422003'), 1);
    });

    test('CACHE_HIT: repeat scan returns cached result without a '
        'second network call (NFR5 / UJ-5)', () async {
      offSource.setMatch(
        '3017620422003',
        displayName: 'Nutella',
        categoryTags: const ['en:spreads'],
      );

      // First call — populates the barcode LRU.
      final first = await catalog.lookupByBarcode('3017620422003');
      expect(first, isA<RankedMatches>());
      expect(catalog.cachedBarcodes, 1);
      expect(offSource.callCount('3017620422003'), 1);

      // Second call — replay from cache, no second network round-trip.
      final second = await catalog.lookupByBarcode('3017620422003');
      expect(
        second,
        first,
        reason:
            'cached replay must return the same `CatalogResult` '
            'shape — never re-hits OFF',
      );
      expect(
        offSource.callCount('3017620422003'),
        1,
        reason: 'second scan must not re-hits OFF (NFR5)',
      );
    });

    test('CACHE_KEY_TRIMMED: whitespace around a barcode resolves to '
        'the same cached entry', () async {
      offSource.setMatch(
        '3017620422003',
        displayName: 'Nutella',
        categoryTags: const ['en:spreads'],
      );

      await catalog.lookupByBarcode('3017620422003');
      await catalog.lookupByBarcode('  3017620422003  ');
      expect(
        offSource.callCount('3017620422003'),
        1,
        reason: 'trimmed key — both scans must hit the same cache entry',
      );
      expect(catalog.cachedBarcodes, 1);
    });

    test('NOT_FOUND: OFF not-found maps to NotFoundFailure with the '
        'scanned code as `query`', () async {
      offSource.setNotFound('0000000000000');

      final result = await catalog.lookupByBarcode('0000000000000');
      expect(result, isA<NotFoundFailure>());
      expect((result as NotFoundFailure).query, '0000000000000');
    });

    test('NOT_FOUND_CACHE: a not-found barcode is also cached, so a '
        'repeat scan never re-hits OFF (NFR5 / UJ-5)', () async {
      offSource.setNotFound('0000000000000');

      await catalog.lookupByBarcode('0000000000000');
      await catalog.lookupByBarcode('0000000000000');
      expect(offSource.callCount('0000000000000'), 1);
    });

    test('OFF_5XX: OFF 500 maps to CatalogFailure (calm failure line, '
        'not the not-found path)', () async {
      offSource.setFailure('3017620422003', 'OFF HTTP 500');

      final result = await catalog.lookupByBarcode('3017620422003');
      expect(result, isA<CatalogFailure>());
    });

    test('FOOD_GROUP: OFF categories_tags classify the food into the '
        'right balance-arc bucket (FR12 / UX-DR4)', () async {
      // Fruit tag → vegFruit.
      offSource.setMatch(
        '1',
        displayName: 'Apple Snack',
        categoryTags: const ['en:fruits', 'en:apples'],
      );
      final fruitResult = await catalog.lookupByBarcode('1');
      final fruit = (fruitResult as RankedMatches).matches.single;
      expect(fruit.food.foodGroup, FoodGroup.vegFruit);

      // Dairy tag → dairy.
      offSource.setMatch(
        '2',
        displayName: 'Yogurt',
        categoryTags: const ['en:dairy', 'en:yogurts'],
      );
      final dairyResult = await catalog.lookupByBarcode('2');
      final dairy = (dairyResult as RankedMatches).matches.single;
      expect(dairy.food.foodGroup, FoodGroup.dairy);

      // No tags → other (the food still commits; the arc stays honest).
      offSource.setMatch(
        '3',
        displayName: 'Mystery Snack',
        categoryTags: const <String>[],
      );
      final otherResult = await catalog.lookupByBarcode('3');
      final other = (otherResult as RankedMatches).matches.single;
      expect(other.food.foodGroup, FoodGroup.other);
    });

    test('N4: a transient failure is NOT cached — the next scan retries '
        'and can succeed', () async {
      offSource.setFailure('777', 'OFF HTTP 503');
      final first = await catalog.lookupByBarcode('777');
      expect(first, isA<CatalogFailure>());
      expect(offSource.callCount('777'), 1);

      // OFF recovers.
      offSource.setMatch(
        '777',
        displayName: 'Plain Yogurt',
        categoryTags: const ['en:dairy'],
      );
      final second = await catalog.lookupByBarcode('777');
      expect(second, isA<RankedMatches>());
      expect(offSource.callCount('777'), 2, reason: 'failure must not stick');

      // ...and a match IS cached (offline replay, NFR5).
      await catalog.lookupByBarcode('777');
      expect(offSource.callCount('777'), 2);
    });

    test('N4: a definitive not-found IS cached', () async {
      offSource.setNotFound('888');
      expect(await catalog.lookupByBarcode('888'), isA<NotFoundFailure>());
      expect(await catalog.lookupByBarcode('888'), isA<NotFoundFailure>());
      expect(offSource.callCount('888'), 1);
    });

    test('EMPTY_CODE: empty / whitespace-only barcode short-circuits '
        'to NotFoundFailure(\'\') without hitting OFF', () async {
      final result = await catalog.lookupByBarcode('');
      expect(result, isA<NotFoundFailure>());
      expect((result as NotFoundFailure).query, '');
      expect(offSource.totalCalls, 0);

      final whitespace = await catalog.lookupByBarcode('   ');
      expect(whitespace, isA<NotFoundFailure>());
      expect((whitespace as NotFoundFailure).query, '');
      expect(offSource.totalCalls, 0);
    });
  });

  group('online lookup gate (privacy audit PV7)', () {
    test(
      'a denied gate sends NOTHING and reports not found (not cached)',
      () async {
        final off = _FakeOffSource()
          ..setMatch('111', displayName: 'Jam', categoryTags: const []);
        var allowed = false;
        final catalog = OfflineFirstFoodCatalog(
          offSource: off,
          onlineLookupAllowed: () async => allowed,
        );
        final denied = await catalog.lookupByBarcode('111');
        expect(denied, isA<NotFoundFailure>());
        expect(off.totalCalls, 0, reason: 'no request while not allowed');
        expect(catalog.cachedBarcodes, 0);

        allowed = true;
        expect(await catalog.lookupByBarcode('111'), isA<RankedMatches>());
        expect(off.totalCalls, 1);
      },
    );

    test('a gate that throws fails closed', () async {
      final off = _FakeOffSource()
        ..setMatch('111', displayName: 'Jam', categoryTags: const []);
      final catalog = OfflineFirstFoodCatalog(
        offSource: off,
        onlineLookupAllowed: () async => throw StateError('locked'),
      );
      expect(await catalog.lookupByBarcode('111'), isA<NotFoundFailure>());
      expect(off.totalCalls, 0);
    });

    test(
      'a cached barcode needs no gate; the offline search never asks',
      () async {
        final off = _FakeOffSource()
          ..setMatch('111', displayName: 'Jam', categoryTags: const []);
        var asked = 0;
        final catalog = OfflineFirstFoodCatalog(
          offSource: off,
          onlineLookupAllowed: () async {
            asked++;
            return true;
          },
        );
        await catalog.lookupByBarcode('111');
        await catalog.lookupByBarcode('111');
        await catalog.search('apple');
        expect(asked, 1);
        expect(off.totalCalls, 1);
      },
    );
  });

  group('OffBarcodeSource (dio wrapper)', () {
    late _HarnessDioSource harness;
    late OffBarcodeSource source;

    setUp(() {
      harness = _HarnessDioSource();
      source = OffBarcodeSource(dio: harness.dio);
    });

    test(
      'HAPPY: 200 with status=1 + product maps to OffBarcodeMatch',
      () async {
        harness.respondJson(200, {
          'status': 1,
          'status_verbose': 'product found',
          'product': {
            'product_name': 'Nutella',
            'brands': 'Ferrero',
            'categories_tags': ['en:spreads', 'en:sweet-spreads'],
          },
        });

        final result = await source.lookup('3017620422003');
        expect(result, isA<OffBarcodeMatch>());
        final match = result as OffBarcodeMatch;
        expect(match.barcode, '3017620422003');
        expect(match.displayName, 'Nutella');
        expect(match.categoryTags, ['en:spreads', 'en:sweet-spreads']);
      },
    );

    test('NOT_FOUND_404: HTTP 404 maps to OffBarcodeNotFound', () async {
      harness.respondJson(404, {
        'status': 0,
        'status_verbose': 'product not found',
      });
      final result = await source.lookup('0000000000000');
      expect(result, isA<OffBarcodeNotFound>());
      expect((result as OffBarcodeNotFound).barcode, '0000000000000');
    });

    test('NOT_FOUND_GHOST: 200 with status=0 (OFF\'s ghost 404) maps '
        'to OffBarcodeNotFound', () async {
      harness.respondJson(200, {'status': 0, 'product': null});
      final result = await source.lookup('0000000000000');
      expect(result, isA<OffBarcodeNotFound>());
    });

    test('OFF_5XX: HTTP 500 maps to OffBarcodeFailure', () async {
      harness.respondJson(500, {'error': 'server down'});
      final result = await source.lookup('3017620422003');
      expect(result, isA<OffBarcodeFailure>());
    });

    test('NAME_TRIM: leading brand is stripped from the display name '
        'when OFF formats the name with the brand prefix', () async {
      harness.respondJson(200, {
        'status': 1,
        'product': {
          'product_name': 'Nutella - hazelnut spread',
          'brands': 'Nutella',
          'categories_tags': const <String>[],
        },
      });
      final result = await source.lookup('3017620422003');
      expect(result, isA<OffBarcodeMatch>());
      expect((result as OffBarcodeMatch).displayName, 'hazelnut spread');
    });

    test('NAME_FALLBACK: product_name_en is used when product_name '
        'is empty', () async {
      harness.respondJson(200, {
        'status': 1,
        'product': {
          'product_name': '',
          'product_name_en': 'English Name',
          'categories_tags': const <String>[],
        },
      });
      final result = await source.lookup('3017620422003');
      expect(result, isA<OffBarcodeMatch>());
      expect((result as OffBarcodeMatch).displayName, 'English Name');
    });

    test('NAME_BLANK: status=1 with empty product_name maps to '
        'OffBarcodeNotFound (the UI hands off to manual entry)', () async {
      harness.respondJson(200, {
        'status': 1,
        'product': {'product_name': '', 'categories_tags': const <String>[]},
      });
      final result = await source.lookup('3017620422003');
      expect(result, isA<OffBarcodeNotFound>());
    });

    test('EMPTY_INPUT: empty / whitespace barcode short-circuits to '
        'OffBarcodeNotFound without an HTTP call', () async {
      final result = await source.lookup('');
      expect(result, isA<OffBarcodeNotFound>());
      expect(harness.requestCount, 0);

      final whitespace = await source.lookup('   ');
      expect(whitespace, isA<OffBarcodeNotFound>());
      expect(harness.requestCount, 0);
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
      expect(
        () => LruCache<String, int>(capacity: 0),
        throwsA(isA<AssertionError>()),
      );
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

/// Test double for `OffBarcodeSource`. The real source wraps `dio`;
/// the fake drops the network round-trip and hands back the typed
/// result the test configured. Lets the adapter tests stay
/// hermetic — no `MockAdapter` plumbing through `dio`.
class _FakeOffSource implements OffBarcodeSource {
  final Map<String, OffBarcodeResult> _responses = {};
  final Map<String, int> _callCounts = {};
  int _totalCalls = 0;

  int get totalCalls => _totalCalls;

  int callCount(String barcode) => _callCounts[barcode] ?? 0;

  void setMatch(
    String barcode, {
    required String displayName,
    required List<String> categoryTags,
  }) {
    _responses[barcode] = OffBarcodeMatch(
      barcode: barcode,
      displayName: displayName,
      categoryTags: List<String>.unmodifiable(categoryTags),
    );
  }

  void setNotFound(String barcode) {
    _responses[barcode] = OffBarcodeNotFound(barcode);
  }

  void setFailure(String barcode, Object cause) {
    _responses[barcode] = OffBarcodeFailure(barcode, cause);
  }

  @override
  Future<OffBarcodeResult> lookup(String barcode) async {
    _totalCalls++;
    _callCounts[barcode] = (_callCounts[barcode] ?? 0) + 1;
    final response = _responses[barcode];
    if (response != null) return response;
    // Default: a previously-unseen barcode returns not-found so the
    // adapter test surfaces a typed `NotFoundFailure`.
    return OffBarcodeNotFound(barcode);
  }
}

/// `dio` harness — implements `HttpClientAdapter` so the
/// `OffBarcodeSource` test can configure canned responses without
/// touching the network. The adapter counts requests and replies
/// with a single JSON body until the next `respondJson` call.
class _HarnessDioSource {
  _HarnessDioSource() : dio = Dio() {
    _adapter = _CountingAdapter();
    dio.httpClientAdapter = _adapter;
  }

  late final Dio dio;
  late final _CountingAdapter _adapter;

  int get requestCount => _adapter.requestCount;

  void respondJson(int statusCode, Object body) {
    _adapter.nextStatusCode = statusCode;
    _adapter.nextBody = body;
  }
}

class _CountingAdapter implements HttpClientAdapter {
  int requestCount = 0;
  int nextStatusCode = 200;
  Object? nextBody;

  @override
  void close({bool force = false}) {
    // No-op — the adapter is owned by the test, not the network.
  }

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requestCount++;
    final body = nextBody;
    final headers = <String, List<String>>{
      'content-type': ['application/json'],
    };
    if (body == null) {
      return ResponseBody.fromString('null', nextStatusCode, headers: headers);
    }
    final encoded = body is String ? body : jsonEncode(body);
    return ResponseBody.fromString(encoded, nextStatusCode, headers: headers);
  }
}
