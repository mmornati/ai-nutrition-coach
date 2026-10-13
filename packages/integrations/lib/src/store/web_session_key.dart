// In-memory holder for the web store's derived key (AD-8 / Phase 2B).
//
// The key is derived from the passphrase (`web_kdf.dart`), VERIFIED by
// actually opening the encrypted database with it (W3), and only then handed
// to this holder via [unlockWith]. It is never written to any browser
// storage. The holder is observable ([ChangeNotifier]) so the app gate
// rebuilds on unlock and lock (W4); [lock] overwrites the buffer with zeros
// (W7) before dropping it.
//
// Honest limits of "zeroing": the bytes in THIS buffer are wiped, but the
// key was also rendered once as a hex `String` for the `PRAGMA hexkey`
// statement and lives inside the WebAssembly heap while the database is
// open; Dart strings are immutable and the wasm heap is not ours to wipe.
// Locking therefore closes the database and drops every reference we hold,
// which is the strongest guarantee a browser runtime allows -- it does not
// claim forensic erasure from RAM.
//
// No singleton: the controller owns exactly one instance, so tests and
// restarts never see another run's state. `toString` is redacted.

import 'package:flutter/foundation.dart';

class WebSessionKey extends ChangeNotifier {
  Uint8List? _key;

  /// True while a verified key is held.
  bool get isOpen => _key != null;

  /// True when no key is held.
  bool get isLocked => _key == null;

  /// The key bytes, or `null` while locked. Tests only: nothing in the app
  /// needs raw key material (the database is already keyed).
  @visibleForTesting
  Uint8List? get derivedKey => _key;

  /// Take ownership of an already-VERIFIED [key] (the caller must not use or
  /// zero the buffer afterwards; [lock] does).
  void unlockWith(Uint8List key) {
    final previous = _key;
    _key = key;
    if (previous != null && !identical(previous, key)) {
      previous.fillRange(0, previous.length, 0);
    }
    notifyListeners();
  }

  /// Zero and drop the key. Idempotent; notifies only on a real change.
  void lock() {
    final key = _key;
    if (key == null) return;
    key.fillRange(0, key.length, 0);
    _key = null;
    notifyListeners();
  }

  @override
  void dispose() {
    final key = _key;
    if (key != null) {
      key.fillRange(0, key.length, 0);
      _key = null;
    }
    super.dispose();
  }

  @override
  String toString() => 'WebSessionKey(isOpen: $isOpen)';
}
