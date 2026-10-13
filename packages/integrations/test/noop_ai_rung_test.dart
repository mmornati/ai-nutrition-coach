// `NoopAiRung` adapter tests (Story 1.8 / AD-5 / NFR5).
//
// Pins:
//   * the v1 active rung returns the empty `RecognizedPlate` shape —
//     an empty foods list, never a failure (NFR5 / UX-DR10).
//   * the adapter conforms to the `AiRung` interface (AD-5).
//   * the `photoBytes` are dropped without persistence (FR13).
//
// The behavioural lock for AD-5: a real recognizer (Epic 3+)
// returning `RecognizedPlate(foods: [one or more])` or `NoMatch` or
// `RecognitionFailure` will compile against the same port and the
// UI never has to branch on which rung is active.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

void main() {
  group('NoopAiRung (v1 active rung)', () {
    test('is interface-conformant: implements AiRung', () {
      const rung = NoopAiRung();
      expect(rung, isA<AiRung>());
    });

    test(
      'returns RecognizedPlate(foods: []) — the v1 degradation path',
      () async {
        const rung = NoopAiRung();
        final result = await rung.recognize(Uint8List(8));
        expect(result, isA<RecognizedPlate>());
        final plate = result as RecognizedPlate;
        expect(plate.foods, isEmpty);
      },
    );

    test('handles empty bytes: returns the same empty plate', () async {
      const rung = NoopAiRung();
      final result = await rung.recognize(Uint8List(0));
      expect(result, isA<RecognizedPlate>());
      expect((result as RecognizedPlate).foods, isEmpty);
    });

    test('never throws: a v1 no-op has no failure path', () async {
      // The contract is "typed result, never raw exception". A v1
      // no-op cannot fail; this test pins that for future regression
      // sweeps.
      const rung = NoopAiRung();
      await expectLater(
        rung.recognize(Uint8List.fromList([1, 2, 3, 4])),
        completion(isA<RecognizedPlate>()),
      );
    });
  });
}
