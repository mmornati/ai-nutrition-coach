// Platform-selecting factory for the `EncryptedStore` port and the
// paired `CoachNoteStore` port.
//
// Uses a conditional import — the canonical Dart seam for "which platform
// implementation compiles" — rather than a runtime branch. On io-capable
// targets (Android / iOS / desktop) it resolves to
// `create_encrypted_store_io.dart` (drift + sqlite3 + FFI); on web it
// resolves to `create_encrypted_store_web.dart` (the `WasmEncryptedStore`,
// Story 4.1 — drift on `sqlite3.wasm` with a PBKDF2-derived session key,
// AD-8 honest posture: session-sealed, not at-rest encrypted).
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
// `WebSessionKeyFailure()` — the session is locked or the passphrase
// did not derive a usable key (Story 4.1).

import 'dart:async';

import 'package:domain_core/domain_core.dart';

import 'create_encrypted_store_web.dart'
    if (dart.library.io) 'create_encrypted_store_io.dart'
    as impl;
import 'secure_key_source.dart';
import 'web_session_key.dart';

/// The bundle of adapters `main.dart` wires into the `ProviderScope`.
/// Both stores share the underlying `AppDatabase` on io targets; on
/// web, the `WasmEncryptedStore` returns a session-sealed store and a
/// paired `CoachNoteStore` that yields a typed `WebSessionKeyFailure`
/// while the session is locked (Story 4.1).
///
/// On web the bundle also carries the process-wide `WebSessionKey`
/// holder and the unlock-probe function so the apps/client
/// `ProviderScope` can override the corresponding Riverpod providers
/// with the same instance the `WasmEncryptedStore` was built against
/// (Story 4.1 / AD-8). Both fields are `null` on io targets.
class StoreBundle {
  const StoreBundle({
    required this.encryptedStore,
    required this.coachNoteStore,
    this.webSessionKey,
    this.webUnlockProbe,
    this.startupFailure,
    this.closeDatabase,
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

  /// Web-only: the session-key holder the lock screen reads. Same
  /// instance the `WasmEncryptedStore` was built against so the
  /// `unlock` / `tryOpen` round-trip lands on the right object.
  final WebSessionKey? webSessionKey;

  /// Web-only: the function the lock screen calls with a derived
  /// key to verify it opens the wasm store. Returns `true` on
  /// success, `false` on a wrong passphrase. The web factory wires
  /// it to `WasmEncryptedStore.tryOpen`; the io factory leaves it
  /// `null`.
  final Future<bool> Function(List<int> derivedKey)? webUnlockProbe;
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
