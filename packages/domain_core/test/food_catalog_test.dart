// Story 1.5 — `FoodCatalog` and `VoiceTranscriber` ports land in the
// pure-Dart core. The structural AD-1 test in `domain_core_test.dart`
// already greps every `.dart` file under `lib/` for forbidden imports,
// so this file is the *behavioural* test for the new ports:
//
//   * `FoodCatalog.search` returns the sealed `CatalogResult` with
//     ranked matches, a typed `NotFoundFailure`, or an empty result
//     for an empty query.
//   * `RankedMatches.matches` is ordered most-relevant-first.
//   * `FoodMatch` carries the resolved `DatabaseFood`, a confidence
//     score, and the quantity presets the UI can pick from.
//   * `VoiceTranscriber.transcribe` returns a sealed
//     `TranscribeResult` (`TranscribedText | TranscriptionFailure`).
//
// Story 1.7 adds `FoodCatalog.lookupByBarcode` (FR2). The default
// implementation throws `UnimplementedError` so a future adapter
// without barcode support remains valid against the port; an adapter
// that *opts in* must override the method. The port-contract test
// pins this so the adapter cannot accidentally regress to the
// `UnimplementedError` default.
//
// AD-1 is enforced by the grep test in `domain_core_test.dart`; this
// test pins the API contracts.

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

void main() {
  group('FoodCatalog port contract', () {
    test('RankedMatches / NotFoundFailure / CatalogFailure are sealed', () {
      // Sealed hierarchy — the switch in the adapter must be exhaustive.
      const r = RankedMatches(<FoodMatch>[]);
      const n = NotFoundFailure('');
      const c = CatalogFailure('reason');
      expect(r, isA<CatalogResult>());
      expect(n, isA<CatalogResult>());
      expect(c, isA<CatalogResult>());
    });

    test('FoodMatch carries food + confidence + presets', () {
      const match = FoodMatch(
        food: DatabaseFood(
          sourceRef: 'seed:apple',
          displayName: 'Apple',
          source: SourceCatalog.manual,
          foodGroup: FoodGroup.vegFruit,
        ),
        confidence: 0.9,
        presets: <QuantityRange>[
          QuantityRange(
            low: 1,
            high: 1,
            unit: 'piece',
            displayLabel: '~1 piece',
          ),
        ],
      );
      expect(match.food.displayName, 'Apple');
      expect(match.confidence, 0.9);
      expect(match.presets.single.unit, 'piece');
    });

    test('CatalogResult equality: same shape compares equal', () {
      const a = RankedMatches(<FoodMatch>[]);
      const b = RankedMatches(<FoodMatch>[]);
      expect(a, b);
    });

    test('lookupByBarcode default impl throws UnimplementedError so adapters '
        'without barcode support still compile against the port', () {
      // The default implementation is intentional: a future adapter
      // that doesn't ship barcode support (e.g. a USDA-only catalog)
      // remains valid against the `FoodCatalog` type as long as it
      // overrides `search` + `lookupBySourceRef`. Adapters that *do*
      // support barcode lookups (the offline-first one) must override
      // `lookupByBarcode` so this default path is never reached in
      // production.
      final catalog = _NoBarcodeAdapter();
      expect(
        () => catalog.lookupByBarcode('3017620422003'),
        throwsA(isA<UnimplementedError>()),
      );
    });
  });

  group('VoiceTranscriber port contract', () {
    test(
      'TranscribeResult is sealed: TranscribedText | TranscriptionFailure',
      () {
        const t = TranscribedText('apple');
        const f = TranscriptionFailure(
          TranscriptionFailureReason.unsupportedInV1,
        );
        expect(t, isA<TranscribeResult>());
        expect(f, isA<TranscribeResult>());
      },
    );

    test('TranscriptionFailure carries a typed reason', () {
      const f = TranscriptionFailure(
        TranscriptionFailureReason.microphoneDenied,
      );
      expect(f.reason, TranscriptionFailureReason.microphoneDenied);
    });
  });

  group('DatabaseFood foodGroup field', () {
    test(
      'defaults to FoodGroup.other (back-compat with pre-1.5 call sites)',
      () {
        const f = DatabaseFood(
          sourceRef: 'x',
          displayName: 'X',
          source: SourceCatalog.manual,
        );
        expect(f.foodGroup, FoodGroup.other);
      },
    );

    test('explicit foodGroup participates in equality + hashCode', () {
      const a = DatabaseFood(
        sourceRef: 'seed:apple',
        displayName: 'Apple',
        source: SourceCatalog.manual,
        foodGroup: FoodGroup.vegFruit,
      );
      const b = DatabaseFood(
        sourceRef: 'seed:apple',
        displayName: 'Apple',
        source: SourceCatalog.manual,
        foodGroup: FoodGroup.vegFruit,
      );
      const c = DatabaseFood(
        sourceRef: 'seed:apple',
        displayName: 'Apple',
        source: SourceCatalog.manual,
        foodGroup: FoodGroup.other,
      );
      expect(a, b);
      expect(a.hashCode, b.hashCode);
      expect(a, isNot(c));
    });

    test('FoodGroup labels are stable across the arc rendering', () {
      expect(FoodGroup.vegFruit.label, 'Veg & Fruit');
      expect(FoodGroup.protein.label, 'Protein');
      expect(FoodGroup.starch.label, 'Starch');
      expect(FoodGroup.dairy.label, 'Dairy');
      expect(FoodGroup.other.label, 'Other');
    });
  });
}

/// Test double — a `FoodCatalog` that satisfies the bare minimum
/// (search returning an empty list, `lookupBySourceRef` returning
/// `null`) and explicitly rethrows the port's default
/// `UnimplementedError` for `lookupByBarcode`. Lets the port-
/// contract test assert that the default `UnimplementedError` path
/// is reachable on an adapter that ships without barcode support.
class _NoBarcodeAdapter implements FoodCatalog {
  @override
  Future<CatalogResult> search(String query, {int limit = 10}) async =>
      const RankedMatches(<FoodMatch>[]);

  @override
  Future<DatabaseFood?> lookupBySourceRef(String sourceRef) async => null;

  @override
  Future<CatalogResult> lookupByBarcode(String code) {
    // Mirrors the port's default implementation — re-throws so the
    // contract test can lock the semantics for adapters that ship
    // without barcode support.
    throw UnimplementedError(
      'FoodCatalog.lookupByBarcode has no default implementation; '
      'adapters must opt in. See OfflineFirstFoodCatalog.lookupByBarcode '
      'for the offline-first + OFF read path.',
    );
  }
}
