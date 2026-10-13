// WebCrypto PBKDF2 (Phase 2B / W2) -- WEB ONLY, reached solely through
// `create_encrypted_store_web.dart`.
//
// `SubtleCrypto.deriveBits` runs the 600,000-iteration PBKDF2-HMAC-SHA256 in
// the browser's native crypto code, asynchronously, so the UI thread is not
// frozen the way the old pure-Dart loop was. `crypto.subtle` exists only in
// a SECURE CONTEXT (https:// or localhost): on a plain-http LAN address it
// is `undefined`, the call throws, and the controller reports the store as
// unavailable (never as a wrong passphrase). Self-hosters must serve over
// HTTPS (docs/self-host.md).

import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

import 'web_kdf.dart';

final class WebCryptoPbkdf2Kdf implements PassphraseKdf {
  const WebCryptoPbkdf2Kdf();

  @override
  Future<Uint8List> derive({
    required Uint8List passphrase,
    required Uint8List salt,
    required WebKdfParams params,
  }) async {
    if (params.name != kWebKdfPbkdf2Sha256) {
      throw UnsupportedError('Unknown KDF ${params.name}');
    }
    final subtle = web.window.crypto.subtle;
    final base = await subtle
        .importKey(
          'raw',
          passphrase.toJS,
          'PBKDF2'.toJS,
          false,
          ['deriveBits'.toJS].toJS,
        )
        .toDart;
    final algorithm = JSObject()
      ..['name'] = 'PBKDF2'.toJS
      ..['hash'] = 'SHA-256'.toJS
      ..['salt'] = salt.toJS
      ..['iterations'] = params.iterations.toJS;
    final bits = await subtle
        .deriveBits(algorithm, base, kWebSessionKeyBytes * 8)
        .toDart;
    // Copy out of the JS-owned buffer into a Dart buffer we can zero, then
    // wipe the JS buffer (a no-op if the runtime already copied it).
    final view = bits.toDart.asUint8List();
    final key = Uint8List.fromList(view);
    view.fillRange(0, view.length, 0);
    return key;
  }
}

/// `String.prototype.normalize('NFC')` -- the production passphrase
/// normaliser (the header records "nfc-utf8").
String webNormalizeNfc(String value) =>
    _normalizeCall(value.toJS, 'NFC'.toJS).toDart;

// `String.prototype.normalize.call(value, 'NFC')`.
@JS('String.prototype.normalize.call')
external JSString _normalizeCall(JSString value, JSString form);
