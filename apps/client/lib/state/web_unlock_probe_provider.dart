// Riverpod provider exposing the web unlock probe to the lock screen
// (Story 4.1 / AD-8).
//
// The probe is the function the lock screen calls with a derived
// PBKDF2 key to verify the passphrase opens the wasm store. The
// default throws so the production `main.dart` must override this
// provider on the web target. On io targets the override is omitted
// (the lock screen never renders there — the `UnlockGate` is
// `kIsWeb`-aware) so the throw is unreachable.

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The unlock probe: a function that takes the derived key bytes
/// and returns `true` if the key opens the wasm store, `false`
/// otherwise. On web the production `main.dart` overrides this with
/// `(derived) => bundle.webUnlockProbe!(derived)` so the lock
/// screen flips to the Day Board on the correct object.
final Provider<Future<bool> Function(List<int> derivedKey)>
    webUnlockProbeProvider =
    Provider<Future<bool> Function(List<int> derivedKey)>((ref) {
  throw UnimplementedError(
    'webUnlockProbeProvider must be overridden on the web target',
  );
});
