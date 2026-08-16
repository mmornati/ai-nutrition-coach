// Riverpod provider exposing the `WebSessionKey` singleton to the
// widget tree (Story 4.1 / AD-8).
//
// The holder is a process-wide singleton; the provider resolves it
// on first read and never rebuilds. The `UnlockGate` reads the
// holder's `isOpen`; the lock screen invokes `unlock` with the
// passphrase; the `WasmEncryptedStore` reads `derivedKey` when it
// needs to open the database.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

/// The `WebSessionKey` singleton. No override at startup — the
/// production graph resolves the singleton from `WebSessionKey()`
/// directly. Tests can override with a fake holder if they need to
/// (none of the current tests do).
final Provider<WebSessionKey> webSessionKeyProvider =
    Provider<WebSessionKey>((ref) {
  return WebSessionKey();
});
