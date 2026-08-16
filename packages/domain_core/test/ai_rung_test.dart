// `AiRung` port contract (Story 1.8 / AD-1 / AD-5 / FR13).
//
// AD-1: the structural grep test in `domain_core_test.dart` already
// pins the "no Flutter / drift / dio / mobile_scanner / image_picker
// / dart:ui / dart:io" rule. This test pins the behavioural
// contract — the sealed result hierarchy, the value type shapes,
// and the FR13 promise that the port takes bytes and returns foods.
//
// AD-5: the port is interface-only. Adapters plug in behind the
// provider; the core never inspects which rung is active. The
// result hierarchy is sealed so a future adapter cannot silently
// introduce a new variant the core does not know how to handle.
//
// FR13: photo is processed with no identity linkage. The port
// signature is `Future<RecognitionResult> recognize(Uint8List)` —
// no device id, no user id, no biometric frame. The behavioural
// test asserts the input shape (raw bytes) and the output shape
// (typed result, never raw exception).

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

void main() {
  group('AiRung port contract', () {
    test('RecognitionResult is sealed: RecognizedPlate | NoMatch | '
        'RecognitionFailure', () {
      const r = RecognizedPlate(foods: <RecognizedFood>[]);
      const n = NoMatch();
      const f = RecognitionFailure('offline');
      expect(r, isA<RecognitionResult>());
      expect(n, isA<RecognitionResult>());
      expect(f, isA<RecognitionResult>());
    });

    test('RecognizedFood carries food + confidence + quantity', () {
      const rec = RecognizedFood(
        databaseFood: DatabaseFood(
          sourceRef: 'seed:apple',
          displayName: 'Apple',
          source: SourceCatalog.manual,
          foodGroup: FoodGroup.vegFruit,
        ),
        confidence: 0.85,
        quantity: QuantityRange(
          low: 1,
          high: 1,
          unit: 'piece',
          displayLabel: '~1 piece',
        ),
      );
      expect(rec.databaseFood.displayName, 'Apple');
      expect(rec.confidence, 0.85);
      expect(rec.quantity.unit, 'piece');
    });

    test('RecognizedPlate equality: same shape compares equal', () {
      const a = RecognizedPlate(foods: <RecognizedFood>[]);
      const b = RecognizedPlate(foods: <RecognizedFood>[]);
      expect(a, b);
    });

    test('RecognizedPlate with non-empty foods: equality + hashCode', () {
      const recA = RecognizedFood(
        databaseFood: DatabaseFood(
          sourceRef: 'seed:apple',
          displayName: 'Apple',
          source: SourceCatalog.manual,
          foodGroup: FoodGroup.vegFruit,
        ),
        confidence: 0.85,
        quantity: QuantityRange(
          low: 1,
          high: 1,
          unit: 'piece',
          displayLabel: '~1 piece',
        ),
      );
      const plateA = RecognizedPlate(foods: [recA]);
      const plateB = RecognizedPlate(foods: [recA]);
      expect(plateA, plateB);
      expect(plateA.hashCode, plateB.hashCode);
    });

    test(
        'AiRung adapter conformance: a minimal adapter returning the empty '
        'recognition shape compiles against the port (AD-5)', () async {
      // The behavioural lock for AD-5: any adapter that returns the
      // empty `RecognizedPlate` shape is valid against the port.
      // Future adapters must conform to the same signature.
      final rung = _EmptyAiRung();
      final result = await rung.recognize(Uint8List(0));
      expect(result, isA<RecognizedPlate>());
      expect((result as RecognizedPlate).foods, isEmpty);
    });
  });
}

/// Minimal `AiRung` adapter — returns the empty recognition shape
/// (the v1 active rung). Used only to assert the port is interface-
/// only and a concrete adapter is constructible against it.
class _EmptyAiRung implements AiRung {
  @override
  Future<RecognitionResult> recognize(Uint8List photoBytes) async {
    return const RecognizedPlate(foods: <RecognizedFood>[]);
  }
}
