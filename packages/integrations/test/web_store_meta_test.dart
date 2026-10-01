// The persisted store header (Phase 2B / W2): round trip, and every kind of
// untrustworthy header is refused rather than honoured.

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';

Uint8List _salt([int n = 16]) =>
    Uint8List.fromList(List<int>.generate(n, (i) => i + 1));

void main() {
  late InMemoryWebStoreStorage storage;
  setUp(() => storage = InMemoryWebStoreStorage());

  test('absent when nothing is stored', () {
    expect(readWebStoreMeta(storage), isA<WebStoreMetaAbsent>());
  });

  test('round-trips salt, KDF name, iterations and version', () {
    final meta = WebStoreMeta(kdf: const WebKdfParams(), salt: _salt());
    storage.write(kWebStoreMetaKey, meta.encode());
    final read = readWebStoreMeta(storage);
    expect(read, isA<WebStoreMetaPresent>());
    final got = (read as WebStoreMetaPresent).meta;
    expect(got.salt, _salt());
    expect(got.kdf, const WebKdfParams());
    expect(got.version, kWebStoreFormatVersion);
    expect(
      (jsonDecode(meta.encode()) as Map<String, Object?>)['pw'],
      'nfc-utf8',
    );
  });

  test('toString does not leak the salt', () {
    final meta = WebStoreMeta(kdf: const WebKdfParams(), salt: _salt());
    expect(meta.toString(), isNot(contains(base64Url.encode(_salt()))));
  });

  test('refuses garbage, wrong shapes, unknown version/KDF, short salt, '
      'downgraded iterations', () {
    for (final raw in [
      'not json',
      '[]',
      jsonEncode({'v': 1}),
      jsonEncode({
        'v': 2,
        'kdf': kWebKdfPbkdf2Sha256,
        'iter': kWebKdfIterations,
        'pw': 'nfc-utf8',
        'salt': base64Url.encode(_salt()),
      }),
      jsonEncode({
        'v': 1,
        'kdf': 'md5',
        'iter': kWebKdfIterations,
        'pw': 'nfc-utf8',
        'salt': base64Url.encode(_salt()),
      }),
      jsonEncode({
        'v': 1,
        'kdf': kWebKdfPbkdf2Sha256,
        'iter': kWebKdfIterations,
        'pw': 'nfc-utf8',
        'salt': base64Url.encode(_salt(4)),
      }),
      jsonEncode({
        'v': 1,
        'kdf': kWebKdfPbkdf2Sha256,
        'iter': 1000,
        'pw': 'nfc-utf8',
        'salt': base64Url.encode(_salt()),
      }),
      jsonEncode({
        'v': 1,
        'kdf': kWebKdfPbkdf2Sha256,
        'iter': kWebKdfIterations,
        'pw': 'nfc-utf8',
        'salt': '***not base64***',
      }),
    ]) {
      storage.write(kWebStoreMetaKey, raw);
      expect(
        readWebStoreMeta(storage),
        isA<WebStoreMetaInvalid>(),
        reason: raw,
      );
    }
  });
}
