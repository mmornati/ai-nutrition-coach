// WebSessionKey marker value type pins (Story 4.1 / AD-8).
//
// The marker is `const`, has no key material, and is referentially
// equal across instances. The `toString` is intentionally redacted —
// the value type never carries a key, but a future holder that does
// should not be tempted to put it in `toString`.

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

void main() {
  group('WebSessionKey (Story 4.1)', () {
    test('two const instances are equal', () {
      expect(const WebSessionKey(), const WebSessionKey());
      expect(const WebSessionKey().hashCode, const WebSessionKey().hashCode);
    });

    test('toString is redacted (no key material can leak)', () {
      expect(const WebSessionKey().toString(), 'WebSessionKey()');
    });

    test('equality holds against a runtime instance', () {
      expect(const WebSessionKey() == WebSessionKey(), isTrue);
    });
  });
}
