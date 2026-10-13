// A tiny RFC 4122 version-4 UUID generator (security review F4).
//
// Sync op ids must be unguessable and collision-free across devices; they
// come from a cryptographically secure RNG, never from a counter or a plate
// id. No dependency: `Random.secure()` is in `dart:math` on every target.

import 'dart:math';

/// A fresh random UUID v4 (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`, `y` in
/// 8..b). [random] is injectable for tests; production uses
/// `Random.secure()`.
String generateUuidV4([Random? random]) {
  final rng = random ?? Random.secure();
  final bytes = List<int>.generate(16, (_) => rng.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-'
      '${hex.substring(20)}';
}
