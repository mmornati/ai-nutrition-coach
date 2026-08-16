// Platform-selecting factory for the `EncryptedStore` port and the
// paired `CoachNoteStore` port.
//
// Uses a conditional import — the canonical Dart seam for "which platform
// implementation compiles" — rather than a runtime branch. On io-capable
// targets (Android / iOS / desktop) it resolves to
// `create_encrypted_store_io.dart` (drift + sqlite3 + FFI); on web it
// resolves to `create_encrypted_store_web.dart` (the `WebEncryptedStoreStub`,
// swapped for a wasm-backed implementation in Story 4.1).
//
// This is a compile-time selection, not `kIsWeb` at runtime: the drift →
// sqlite3 → `dart:ffi` chain has no web runtime, so it must not be imported
// into a web build at all (conditional imports are the only way to keep the
// web bundle compilable).
//
// AD-3: the factory hands back BOTH the encrypted plate-log store AND
// the coach-note store, opened against the SAME `AppDatabase` instance
// so the AD-3 invariant ("one store, no second source, no second
// mutation path") holds. Failure containment stays on the io side:
// when the secure-storage read or the sqlite3mc cipher attach fails,
// the io factory hands back a `_SecureKeyFailureStore` so every
// `recordPlate` returns
// `StoreFailure(encryptedStoreError: SecureKeyFailure())` and the UI
// renders the calm "history can't open on this device" surface instead
// of an uncaught async error.

import 'package:domain_core/domain_core.dart';

import 'create_encrypted_store_web.dart'
    if (dart.library.io) 'create_encrypted_store_io.dart' as impl;

/// The bundle of adapters `main.dart` wires into the `ProviderScope`.
/// Both stores share the underlying `AppDatabase` on io targets; on
/// web, the web stub returns a `WebEncryptedStoreStub` for the
/// plate-log store and a no-op coach-note store (Story 4.1 swaps the
/// web stub for a wasm-backed implementation).
class StoreBundle {
  const StoreBundle({
    required this.encryptedStore,
    required this.coachNoteStore,
  });

  final EncryptedStore encryptedStore;
  final CoachNoteStore coachNoteStore;
}

Future<StoreBundle> createStores() => impl.createStores();
