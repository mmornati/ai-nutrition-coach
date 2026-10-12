// The `PrivacyGuard` test (Story 5.1 / FR-13).
//
// Pins the guard's compile-time + runtime assertions. The runtime
// check is intentionally a no-op in release builds; the durable
// enforcement is the static check + the named-reviewer gate.

import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/widgets/privacy_guard.dart';

void main() {
  group('PrivacyGuard (Story 5.1 / FR-13)', () {
    test('assertAdultsOnly returns silently on a clean v1 surface', () {
      expect(() => PrivacyGuard.assertAdultsOnly(), returnsNormally);
    });

    test('toString is redacted — never reveals key material', () {
      expect(PrivacyGuard().toString(), contains('adults-only: true'));
      expect(PrivacyGuard().toString(), isNot(contains('key')));
      expect(PrivacyGuard().toString(), isNot(contains('biometric')));
    });
  });
}
