// F10 catalog cleanups: seed source, LRU key includes the limit.

import 'package:domain_core/domain_core.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

void main() {
  test('seeded foods are SourceCatalog.seed, not Open Food Facts', () async {
    final catalog = OfflineFirstFoodCatalog();
    final result = await catalog.search('apple') as RankedMatches;
    expect(result.matches.first.food.source, SourceCatalog.seed);
    final byRef = await catalog.lookupBySourceRef('seed:apple');
    expect(byRef!.source, SourceCatalog.seed);
    expect(byRef.sourceRef, startsWith('seed:'));
  });

  test(
    'a small-limit search does not shadow a later larger-limit one',
    () async {
      final catalog = OfflineFirstFoodCatalog();
      // "e" substring-matches many seeds.
      final small = await catalog.search('e', limit: 2) as RankedMatches;
      expect(small.matches, hasLength(2));
      final large = await catalog.search('e', limit: 10) as RankedMatches;
      expect(large.matches.length, greaterThan(2));
      // Replay of each is served from its own cache entry.
      expect(
        (await catalog.search('e', limit: 2) as RankedMatches).matches,
        hasLength(2),
      );
      expect(catalog.cachedQueries, 2);
    },
  );
}
