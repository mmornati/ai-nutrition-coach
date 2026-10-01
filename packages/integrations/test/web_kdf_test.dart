// KDF pins (Phase 2B / W2): the pure-Dart reference matches PUBLISHED
// PBKDF2-HMAC-SHA256 vectors, so the construction the browser's WebCrypto
// runs in production (same algorithm, same parameters) is what we think it
// is. WebCrypto itself is browser-only; see ADR-0002 for what that leaves
// unverified on the VM.

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';

String _hex(List<int> b) =>
    b.map((e) => e.toRadixString(16).padLeft(2, '0')).join();

Uint8List _b(String s) => Uint8List.fromList(utf8.encode(s));

void main() {
  group('pbkdf2HmacSha256 published vectors', () {
    // Vectors from the widely published PBKDF2-HMAC-SHA256 set (the
    // RFC 6070 inputs with SHA-256); cross-checked against Python's
    // hashlib.pbkdf2_hmac.
    test('c=1, dkLen=32', () {
      expect(
        _hex(
          pbkdf2HmacSha256(
            password: _b('password'),
            salt: _b('salt'),
            iterations: 1,
            length: 32,
          ),
        ),
        '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b',
      );
    });

    test('c=2, dkLen=32', () {
      expect(
        _hex(
          pbkdf2HmacSha256(
            password: _b('password'),
            salt: _b('salt'),
            iterations: 2,
            length: 32,
          ),
        ),
        'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43',
      );
    });

    test('c=4096, dkLen=32', () {
      expect(
        _hex(
          pbkdf2HmacSha256(
            password: _b('password'),
            salt: _b('salt'),
            iterations: 4096,
            length: 32,
          ),
        ),
        'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a',
      );
    });

    test('multi-block output, long password and salt (dkLen=40)', () {
      expect(
        _hex(
          pbkdf2HmacSha256(
            password: _b('passwordPASSWORDpassword'),
            salt: _b('saltSALTsaltSALTsaltSALTsaltSALTsalt'),
            iterations: 4096,
            length: 40,
          ),
        ),
        '348c89dbcbd32b2f32d814b8116e84cf2b17347ebc1800181c4e2a1fb8dd53e1'
        'c635518c7dac47e9',
      );
    });

    test(
      'the production cost (600,000 iterations)',
      () {
        final salt = Uint8List.fromList(List<int>.generate(16, (i) => i));
        expect(
          _hex(
            pbkdf2HmacSha256(
              password: _b('correct horse battery staple'),
              salt: salt,
              iterations: kWebKdfIterations,
              length: kWebSessionKeyBytes,
            ),
          ),
          'ef177144eec9420cbc1093d2a8b344a92bc506d0d4ec9c028dd19f8324d8c1e6',
        );
      },
      timeout: const Timeout(Duration(minutes: 2)),
    );

    test('rejects nonsense parameters', () {
      expect(
        () => pbkdf2HmacSha256(
          password: _b('p'),
          salt: _b('s'),
          iterations: 0,
          length: 32,
        ),
        throwsRangeError,
      );
    });
  });

  group('production parameters', () {
    test('are at least the OWASP PBKDF2-SHA256 floor and 32-byte keys', () {
      expect(kWebKdfIterations, greaterThanOrEqualTo(600000));
      expect(kWebKdfMinIterations, greaterThanOrEqualTo(600000));
      expect(kWebSessionKeyBytes, 32);
      expect(kWebStoreSaltBytes, 16);
      expect(const WebKdfParams().name, 'pbkdf2-hmac-sha256');
    });

    test('DartPbkdf2Kdf refuses an unknown KDF name', () {
      expect(
        const DartPbkdf2Kdf().derive(
          passphrase: _b('p'),
          salt: _b('0123456789abcdef'),
          params: const WebKdfParams(name: 'argon2id', iterations: 1),
        ),
        throwsUnsupportedError,
      );
    });
  });
}
