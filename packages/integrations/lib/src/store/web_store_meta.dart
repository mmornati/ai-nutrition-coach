// The web store's header: everything needed to re-derive the key from the
// passphrase, stored beside the data (Phase 2B / W2). None of it is secret
// -- the salt only has to be unique per store, and the parameters are public
// -- but it is integrity-relevant, so a malformed or downgraded header is
// refused instead of trusted.
//
// Format (JSON under `kWebStoreMetaKey`):
//   {"v":1,"kdf":"pbkdf2-hmac-sha256","iter":600000,"pw":"nfc-utf8",
//    "salt":"<base64url>"}
//
// `pw` fixes how the passphrase becomes KDF input: Unicode NFC-normalised,
// then UTF-8 (so "é" typed as one code point or as e + combining accent
// derives the same key on every device/keyboard). A different value is
// refused. A copy of this header is also kept inside IndexedDB next to the
// data (see `WebDatabaseBackend.readHeaderCopy`) so losing `localStorage`
// alone does not orphan the store.
//
// The header's existence is also what decides "returning user" (unlock) vs
// "first run" (create passphrase). It is written only AFTER the keyed
// database opened successfully, so a half-finished creation leaves no
// header and the next run starts clean.

import 'dart:convert';
import 'dart:typed_data';

import 'web_kdf.dart';
import 'web_store_storage.dart';

const String kWebStoreMetaKey = 'openplate.web.store.meta';

/// Current header/format version. Also the AAD-equivalent "format version"
/// of the data: bump it together with any change to cipher or schema keying.
const int kWebStoreFormatVersion = 1;

/// Passphrase encoding recorded in the header: NFC, then UTF-8.
const String kWebPassphraseEncoding = 'nfc-utf8';

final class WebStoreMeta {
  WebStoreMeta({
    this.version = kWebStoreFormatVersion,
    required this.kdf,
    required Uint8List salt,
  }) : salt = Uint8List.fromList(salt);

  final int version;
  final WebKdfParams kdf;
  final Uint8List salt;

  String encode() => jsonEncode({
    'v': version,
    'kdf': kdf.name,
    'iter': kdf.iterations,
    'pw': kWebPassphraseEncoding,
    'salt': base64Url.encode(salt),
  });

  /// `toString` carries no salt: harmless, but there is no reason to log it.
  @override
  String toString() => 'WebStoreMeta(v$version, $kdf)';
}

/// Result of reading the header from storage.
sealed class WebStoreMetaRead {
  const WebStoreMetaRead();
}

/// No header: first run (or the store was erased).
final class WebStoreMetaAbsent extends WebStoreMetaRead {
  const WebStoreMetaAbsent();
}

final class WebStoreMetaPresent extends WebStoreMetaRead {
  const WebStoreMetaPresent(this.meta);
  final WebStoreMeta meta;
}

/// A header exists but cannot be trusted (unparsable, unknown version or
/// KDF, short salt, iteration count below the floor).
final class WebStoreMetaInvalid extends WebStoreMetaRead {
  const WebStoreMetaInvalid();
}

WebStoreMetaRead readWebStoreMeta(
  WebStoreStorage storage, {
  int minIterations = kWebKdfMinIterations,
}) {
  return parseWebStoreMeta(
    storage.read(kWebStoreMetaKey),
    minIterations: minIterations,
  );
}

/// Parse a stored header string (from `localStorage` or the IndexedDB copy).
WebStoreMetaRead parseWebStoreMeta(
  String? raw, {
  int minIterations = kWebKdfMinIterations,
}) {
  if (raw == null) return const WebStoreMetaAbsent();
  try {
    final json = jsonDecode(raw);
    if (json is! Map<String, Object?>) return const WebStoreMetaInvalid();
    final version = json['v'];
    final kdf = json['kdf'];
    final iter = json['iter'];
    final salt = json['salt'];
    if (version != kWebStoreFormatVersion ||
        kdf != kWebKdfPbkdf2Sha256 ||
        iter is! int ||
        json['pw'] != kWebPassphraseEncoding ||
        iter < minIterations ||
        salt is! String) {
      return const WebStoreMetaInvalid();
    }
    final saltBytes = base64Url.decode(salt);
    if (saltBytes.length < kWebStoreSaltBytes) {
      return const WebStoreMetaInvalid();
    }
    return WebStoreMetaPresent(
      WebStoreMeta(
        version: version as int,
        kdf: WebKdfParams(name: kdf as String, iterations: iter),
        salt: saltBytes,
      ),
    );
  } on FormatException {
    return const WebStoreMetaInvalid();
  }
}
