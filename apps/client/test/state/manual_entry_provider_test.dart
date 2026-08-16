// `manualEntryProvider` state machine tests (Story 1.5 / FR3 / AD-4).
//
// The notifier drives three observable transitions the screen depends on:
//
//   * `updateQuery` — text → catalog call → ranked matches (matched) or
//     typed failure (`notFound` / `catalogFailure`).
//   * `selectMatch` — pick a `FoodMatch`; first preset becomes the
//     chosen preset.
//   * `selectPreset` — swap the chosen quantity preset.
//   * `clear`       — reset every field (called on successful commit).
//
// The test pins every transition with a hand-rolled `FakeFoodCatalog`
// so the assertions don't depend on the seed list or the LRU.

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openplate_client/state/manual_entry_provider.dart';

/// Hand-rolled `FoodCatalog` fake — deterministic, no LRU. Lets each
/// test pin exactly which results the notifier should observe without
/// depending on the seed list.
class _FakeFoodCatalog implements FoodCatalog {
  _FakeFoodCatalog(this._results);

  final Map<String, CatalogResult> _results;
  final List<String> calls = <String>[];

  @override
  Future<CatalogResult> search(String query, {int limit = 10}) async {
    calls.add(query);
    return _results[query] ?? NotFoundFailure(query);
  }

  @override
  Future<DatabaseFood?> lookupBySourceRef(String sourceRef) async => null;

  @override
  Future<CatalogResult> lookupByBarcode(String code) async =>
      // The manual-entry provider doesn't exercise the barcode
      // path; default to a not-found so any accidental invocation
      // is loud.
      NotFoundFailure(code);
}

CatalogResult _matched(List<FoodMatch> matches) => RankedMatches(matches);

FoodMatch _match(String name, {
  FoodGroup group = FoodGroup.other,
  List<QuantityRange>? presets,
}) {
  return FoodMatch(
    food: DatabaseFood(
      sourceRef: 'seed:${name.toLowerCase()}',
      displayName: name,
      source: SourceCatalog.off,
      foodGroup: group,
    ),
    confidence: 0.9,
    presets: presets ??
        <QuantityRange>[
          const QuantityRange(
            low: 1,
            high: 1,
            unit: 'piece',
            displayLabel: '~1 piece',
          ),
        ],
  );
}

ProviderContainer _container(FoodCatalog catalog) {
  final container = ProviderContainer(
    overrides: [
      foodCatalogProvider.overrideWithValue(catalog),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('manualEntryProvider', () {
    test('initial state is empty / idle', () {
      final catalog = _FakeFoodCatalog({});
      final container = _container(catalog);

      final state = container.read(manualEntryProvider);
      expect(state.query, '');
      expect(state.matches, isEmpty);
      expect(state.selected, isNull);
      expect(state.chosenPreset, isNull);
      expect(state.lastError, isNull);
      expect(state.catalogStatus, ManualEntryCatalogStatus.idle);
    });

    test('updateQuery("apple") → matched, ranked list populated',
        () async {
      final apple = _match('Apple', group: FoodGroup.vegFruit);
      final catalog = _FakeFoodCatalog({'apple': _matched([apple])});
      final container = _container(catalog);

      await container
          .read(manualEntryProvider.notifier)
          .updateQuery('apple');

      final state = container.read(manualEntryProvider);
      expect(state.query, 'apple');
      expect(state.catalogStatus, ManualEntryCatalogStatus.matched);
      expect(state.matches, hasLength(1));
      expect(state.matches.first.food.displayName, 'Apple');
    });

    test('updateQuery("zxqwer") → notFound, empty list, no error',
        () async {
      final catalog = _FakeFoodCatalog(
        {'zxqwer': const NotFoundFailure('zxqwer')},
      );
      final container = _container(catalog);

      await container
          .read(manualEntryProvider.notifier)
          .updateQuery('zxqwer');

      final state = container.read(manualEntryProvider);
      expect(state.catalogStatus, ManualEntryCatalogStatus.notFound);
      expect(state.matches, isEmpty);
      expect(state.lastError, isNull);
    });

    test('updateQuery("") → idle, matches cleared', () async {
      final catalog = _FakeFoodCatalog({});
      final container = _container(catalog);

      await container
          .read(manualEntryProvider.notifier)
          .updateQuery('apple');
      // Then clear via empty query.
      await container
          .read(manualEntryProvider.notifier)
          .updateQuery('');

      final state = container.read(manualEntryProvider);
      expect(state.catalogStatus, ManualEntryCatalogStatus.idle);
      expect(state.matches, isEmpty);
    });

    test('updateQuery → adapter throws → catalogFailure with calm copy',
        () async {
      final FoodCatalog catalog = _ThrowingFoodCatalog();
      final container = _container(catalog);

      await container
          .read(manualEntryProvider.notifier)
          .updateQuery('apple');

      final state = container.read(manualEntryProvider);
      expect(state.catalogStatus, ManualEntryCatalogStatus.catalogFailure);
      expect(state.lastError, "Search isn't available right now.");
      expect(state.matches, isEmpty);
    });

    test('selectMatch sets selected + first preset as chosenPreset',
        () async {
      const presetA = QuantityRange(
        low: 1,
        high: 1,
        unit: 'piece',
        displayLabel: '~1 piece',
      );
      const presetB = QuantityRange(
        low: 2,
        high: 2,
        unit: 'piece',
        displayLabel: '~2 pieces',
      );
      final match = _match(
        'Apple',
        group: FoodGroup.vegFruit,
        presets: [presetA, presetB],
      );
      final catalog = _FakeFoodCatalog({'apple': _matched([match])});
      final container = _container(catalog);

      await container
          .read(manualEntryProvider.notifier)
          .updateQuery('apple');
      container.read(manualEntryProvider.notifier).selectMatch(match);

      final state = container.read(manualEntryProvider);
      expect(state.selected, match);
      expect(state.chosenPreset, presetA);
    });

    test('selectPreset swaps the chosen preset without losing selection',
        () async {
      const presetA = QuantityRange(
        low: 1,
        high: 1,
        unit: 'piece',
        displayLabel: '~1 piece',
      );
      const presetB = QuantityRange(
        low: 2,
        high: 2,
        unit: 'piece',
        displayLabel: '~2 pieces',
      );
      final match = _match(
        'Apple',
        group: FoodGroup.vegFruit,
        presets: [presetA, presetB],
      );
      final catalog = _FakeFoodCatalog({'apple': _matched([match])});
      final container = _container(catalog);

      await container
          .read(manualEntryProvider.notifier)
          .updateQuery('apple');
      container.read(manualEntryProvider.notifier).selectMatch(match);
      container
          .read(manualEntryProvider.notifier)
          .selectPreset(presetB);

      final state = container.read(manualEntryProvider);
      expect(state.selected, match);
      expect(state.chosenPreset, presetB);
    });

    test('updateQuery clears selection + chosenPreset (UI safety)',
        () async {
      const presetA = QuantityRange(
        low: 1,
        high: 1,
        unit: 'piece',
        displayLabel: '~1 piece',
      );
      final match = _match(
        'Apple',
        group: FoodGroup.vegFruit,
        presets: [presetA],
      );
      final catalog = _FakeFoodCatalog({
        'apple': _matched([match]),
        'rice': _matched([
          _match('Rice', group: FoodGroup.starch, presets: [presetA]),
        ]),
      });
      final container = _container(catalog);

      await container
          .read(manualEntryProvider.notifier)
          .updateQuery('apple');
      container.read(manualEntryProvider.notifier).selectMatch(match);
      // Confirm selected.
      expect(container.read(manualEntryProvider).selected, match);

      // Type a new query — selection resets so a stale match can't be
      // logged by mistake.
      await container
          .read(manualEntryProvider.notifier)
          .updateQuery('rice');

      final state = container.read(manualEntryProvider);
      expect(state.selected, isNull);
      expect(state.chosenPreset, isNull);
      expect(state.matches.single.food.displayName, 'Rice');
    });

    test('clear() resets every field to initial', () async {
      final apple = _match('Apple', group: FoodGroup.vegFruit);
      final catalog = _FakeFoodCatalog({'apple': _matched([apple])});
      final container = _container(catalog);

      await container
          .read(manualEntryProvider.notifier)
          .updateQuery('apple');
      container.read(manualEntryProvider.notifier).selectMatch(apple);
      container.read(manualEntryProvider.notifier).clear();

      final state = container.read(manualEntryProvider);
      expect(state.query, '');
      expect(state.matches, isEmpty);
      expect(state.selected, isNull);
      expect(state.chosenPreset, isNull);
      expect(state.lastError, isNull);
      expect(state.catalogStatus, ManualEntryCatalogStatus.idle);
    });
  });
}

class _ThrowingFoodCatalog implements FoodCatalog {
  @override
  Future<CatalogResult> search(String query, {int limit = 10}) async {
    throw StateError('simulated adapter failure');
  }

  @override
  Future<DatabaseFood?> lookupBySourceRef(String sourceRef) async => null;

  @override
  Future<CatalogResult> lookupByBarcode(String code) async =>
      throw StateError('simulated adapter failure');
}
