// StoreFailure typed envelope pins (Story 4.1 / AD-8).
//
// Pins:
//   * the `EncryptedStoreFailure` sealed family accepts both the
//     mobile `SecureKeyFailure` and the web `WebSessionKeyFailure`;
//   * a `StoreFailure` constructed with `WebSessionKeyFailure()`
//     is `is`-checkable as `EncryptedStoreFailure`;
//   * the `StoreFailure` assert still requires exactly one field
//     set (no regression on the carry-over invariant).
//   * the `toString` does not leak the key material (n/a — neither
//     marker carries a key).

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

void main() {
  group('StoreFailure (Story 4.1)', () {
    test('web WebSessionKeyFailure is an EncryptedStoreFailure', () {
      const failure = StoreFailure(encryptedStoreError: WebSessionKeyFailure());
      expect(failure.encryptedStoreError, isA<EncryptedStoreFailure>());
      expect(failure.encryptedStoreError, isA<WebSessionKeyFailure>());
    });

    test('mobile SecureKeyFailure is still an EncryptedStoreFailure', () {
      const failure = StoreFailure(encryptedStoreError: SecureKeyFailure());
      expect(failure.encryptedStoreError, isA<EncryptedStoreFailure>());
      expect(failure.encryptedStoreError, isA<SecureKeyFailure>());
    });

    test('exactly one field set — assert rejects zero', () {
      expect(() => const StoreFailure(), throwsA(isA<AssertionError>()));
    });

    test('exactly one field set — assert rejects two', () {
      expect(
        () => const StoreFailure(
          platformError: UnsupportedPlatformFailure(),
          validationError: EmptyPlateFailure(),
        ),
        throwsA(isA<AssertionError>()),
      );
    });

    test('equality + hashCode follow the discriminated fields', () {
      const a = StoreFailure(encryptedStoreError: WebSessionKeyFailure());
      const b = StoreFailure(encryptedStoreError: WebSessionKeyFailure());
      const c = StoreFailure(encryptedStoreError: SecureKeyFailure());
      expect(a, b);
      expect(a.hashCode, b.hashCode);
      expect(a == c, isFalse);
    });
  });
}
