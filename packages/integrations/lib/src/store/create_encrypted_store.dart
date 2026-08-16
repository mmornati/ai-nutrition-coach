// Platform-selecting factory for the `EncryptedStore` port.
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
// Failure containment stays on the io side: when the secure-storage read or
// the sqlite3mc cipher attach fails, the io factory hands back a
// `_SecureKeyFailureStore` so every `recordPlate` returns
// `StoreFailure(encryptedStoreError: SecureKeyFailure())` and the UI renders
// the calm "history can't open on this device" surface instead of an
// uncaught async error.

import 'package:domain_core/domain_core.dart';

import 'create_encrypted_store_web.dart'
    if (dart.library.io) 'create_encrypted_store_io.dart' as impl;

Future<EncryptedStore> createEncryptedStore() => impl.createEncryptedStore();