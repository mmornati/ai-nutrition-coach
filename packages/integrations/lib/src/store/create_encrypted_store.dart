// Platform-selecting factory for the `EncryptedStore` port and the
// paired `CoachNoteStore` port.
//
// Uses a conditional import — the canonical Dart seam for "which platform
// implementation compiles" — rather than a runtime branch. On io-capable
// targets (Android / iOS / desktop) it resolves to
// `create_encrypted_store_io.dart` (drift + sqlite3 + FFI); on web it
// resolves to `create_encrypted_store_web.dart` (the `WasmEncryptedStore`,
// Phase 2B — drift on sqlite3mc compiled to WebAssembly, ChaCha20-Poly1305
// pages in IndexedDB keyed from a passphrase via WebCrypto PBKDF2;
// ADR-0002).
//
// This is a compile-time selection, not `kIsWeb` at runtime: the drift →
// sqlite3 → `dart:ffi` chain has no web runtime, so it must not be imported
// into a web build at all (conditional imports are the only way to keep the
// web bundle compilable).
//
// Phase 2A: `createStores` takes optional `StoreOpenOverrides` so the
// encryption integration test (and only tests) can inject the database
// file path and the key source while exercising the REAL factory path.
// Production passes nothing.
//
// AD-3: the factory hands back BOTH the encrypted plate-log store AND
// the coach-note store, opened against the SAME `AppDatabase` instance
// so the AD-3 invariant ("one store, no second source, no second
// mutation path") holds. Failure containment stays on the io side:
// when the secure-storage read, the sqlite3mc cipher attach or the key
// verification fails, the io factory hands back a `FailedEncryptedStore`
// carrying the typed reason (`SecureKeyFailure`, `KeyLostFailure`,
// `StoreOperationFailure`) so every `recordPlate` returns that
// `StoreFailure` and the UI renders the calm "history can't open on
// this device" surface instead of an uncaught async error. The same
// reason is exposed as `StoreBundle.startupFailure`. On web, the equivalent failure is
// `WebSessionKeyFailure()` — the store is locked (Phase 2B).

import 'dart:async';

import 'package:domain_core/domain_core.dart';

import 'create_encrypted_store_web.dart'
    if (dart.library.io) 'create_encrypted_store_io.dart'
    as impl;
import 'secure_key_source.dart';
import 'web_store_controller.dart';

/// The bundle of adapters `main.dart` wires into the `ProviderScope`.
/// Both stores share the underlying `AppDatabase` on io targets. On web both
/// are views over the `WebStoreController`'s open database (Phase 2B): they
/// return typed `WebSessionKeyFailure`s while the store is locked, and the
/// bundle carries the controller itself so the gate, lock screen and
/// settings can drive create / unlock / lock / erase.
class StoreBundle {
  const StoreBundle({
    required this.encryptedStore,
    required this.coachNoteStore,
    this.webStoreController,
    this.startupFailure,
    this.closeDatabase,
    this.eraseStoreData,
  });

  final EncryptedStore encryptedStore;
  final CoachNoteStore coachNoteStore;

  /// Non-null when the store could not be opened at startup; the stores
  /// above are then the failing stand-ins. `KeyLostFailure` is the case
  /// the app surfaces with "Erase local data and start over" (D7).
  final StoreFailure? startupFailure;

  /// Closes the shared database handle so the eraser (D8) can delete the
  /// files. `null` on targets with no native database.
  final Future<void> Function()? closeDatabase;

  /// Web-only: deletes the persisted store (IndexedDB database + header).
  /// Run by the eraser after `closeDatabase`. `null` on io, where the
  /// eraser deletes the database file itself.
  final Future<void> Function()? eraseStoreData;

  /// Web-only: the controller that owns create / unlock / lock / erase and
  /// the in-memory key. `null` on io (the key lives in the OS keystore and
  /// the store is open at startup).
  final WebStoreController? webStoreController;
}

/// Test seams for `createStores` (Phase 2A). Both fields are optional and
/// production never sets them. Ignored on web.
class StoreOpenOverrides {
  const StoreOpenOverrides({this.databaseFilePath, this.keySource});

  /// Absolute path of the database file; replaces the
  /// `path_provider` documents-directory lookup.
  final String? databaseFilePath;

  /// Replaces the Keychain / Keystore-backed key source.
  final SecureKeySource? keySource;
}

/// The file name of the mobile database inside the documents directory.
const String kDatabaseFileName = 'openplate_v1.sqlite';

Future<StoreBundle> createStores({StoreOpenOverrides? overrides}) =>
    impl.createStores(overrides: overrides);
