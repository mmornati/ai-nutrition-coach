// The `ManagedOversightSeam` marker pin (Story 5.2 / FR-14 / OQ-4).

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

void main() {
  group('ManagedOversightSeam', () {
    test('marker is constant-constructible', () {
      const seam = ManagedOversightSeam();
      expect(seam, isA<ManagedOversightSeam>());
    });

    test('equality is by identity (marker has no fields)', () {
      const a = ManagedOversightSeam();
      const b = ManagedOversightSeam();
      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
    });

    test('toString is redacted — never reveals implementation', () {
      const seam = ManagedOversightSeam();
      expect(seam.toString(), contains('v2 only'));
      expect(seam.toString(), isNot(contains('Service')));
      expect(seam.toString(), isNot(contains('Account')));
    });
  });
}
