// Web implementation of the `createStores` factory (Story 4.1 / AD-8).
//
// Compiled ONLY on web targets via the conditional import in
// `create_encrypted_store.dart`. Returns the `WasmEncryptedStore`
// (sqlite3.wasm + PBKDF2 session key) by default so a production
// web build is honest: the schema is sealed by the in-memory
// session key, the user re-enters the passphrase on every page
// reload, and the AD-8 honest copy ("session-sealed, not at-rest
// encrypted") is anchored.
//
// The store starts in a "locked" state — the lock screen is the
// first paint. The user enters a passphrase; the `WebSessionKey`
// derives a session key via PBKDF2; `WasmEncryptedStore.tryOpen`
// probes the schema. On success the store flips to the "open"
// state; the Day Board receives the same `StoreBundle` shape the
// mobile story returns. On failure a typed `LockOutcome` surfaces
// in the UI.
//
// For LOCAL DEVELOPMENT ONLY, `--dart-define=AI_NUTRITION_COACH_DEV_IN_MEMORY_STORE=true`
// selects the dev in-memory path so the capture → log → Day Board
// loop can be exercised in a browser without a wasm store. Data
// lives and dies with the tab. Production web builds must never
// pass this define.
//
// AD-3 invariant: on web, the wasm store is the single source of
// truth for both plate logs and coach notes. The
// `_WebCoachNoteStore` is a no-op while the session is locked and
// reads from the same `AppDatabase` once it's open.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';

import 'app_database.dart';
import 'create_encrypted_store.dart';
import 'in_memory_encrypted_store.dart';
import 'wasm_encrypted_store.dart';
import 'web_session_key.dart';

const bool _devInMemory = bool.fromEnvironment('OPENPLATE_DEV_IN_MEMORY_STORE');

/// Singleton stores for the dev-in-memory path so successive
/// `recordPlate` / `forPlate` calls share the same in-memory list.
final InMemoryEncryptedStore _devStore = InMemoryEncryptedStore();
final _DevInMemoryCoachNoteStore _devCoachNotes = _DevInMemoryCoachNoteStore();

/// Process-wide web session-key holder. Same instance the
/// `WasmEncryptedStore` reads.
final WebSessionKey _sessionKey = WebSessionKey();

/// Process-wide wasm store. The Day Board reads it through the
/// `ProviderScope` (apps/client) so a manual `lock()` re-locks the
/// gate.
final WasmEncryptedStore _wasmStore = WasmEncryptedStore(
  sessionKey: _sessionKey,
  databaseOpener: _openWasmDatabase,
);

/// Open the wasm database with the derived key.
///
/// PLACEHOLDER (Phase 1 / W5): the real `sqlite3.wasm` + drift
/// `WasmDatabase` binding is not wired yet, and `package:drift/native.dart`
/// (FFI) must never be imported on the web branch. Until the web store is
/// implemented this opener refuses honestly — `WasmEncryptedStore.tryOpen`
/// catches the error and reports "could not open", so no data is ever
/// written to an unencrypted store on production web builds. For the local
/// preview loop use `--dart-define=OPENPLATE_DEV_IN_MEMORY_STORE=true`.
Future<AppDatabase> _openWasmDatabase(Uint8List derivedKey) async {
  throw UnsupportedError(
    'The web wasm store is not implemented yet; see the remediation plan '
    '(Phase 2B).',
  );
}

Future<StoreBundle> createStores() async {
  if (_devInMemory) {
    // The in-memory placeholder has no cipher, so any passphrase "opens"
    // it; the lock screen is still wired so the web gate flow is exercised.
    return StoreBundle(
      encryptedStore: _devStore,
      coachNoteStore: _devCoachNotes,
      webSessionKey: _sessionKey,
      webUnlockProbe: (derived) async => true,
    );
  }
  return StoreBundle(
    encryptedStore: _wasmStore,
    coachNoteStore: const _WasmCoachNoteStore(),
    webSessionKey: _sessionKey,
    webUnlockProbe: (derived) => _wasmStore.tryOpen(),
  );
}

/// Dev-only in-memory coach-note store — same surface shape as
/// `LocalCoachNoteStore`, lives in-memory so the web dev loop can
/// exercise the post-resolve whisper. Production web builds never
/// reach this code path (the `--dart-define` is dev-only).
class _DevInMemoryCoachNoteStore implements CoachNoteStore {
  _DevInMemoryCoachNoteStore();
  final Map<int, List<CoachNote>> _byPlate = {};
  final List<CoachInteractionLog> _interactions = [];
  int _nextNoteId = 1;
  int _nextInteractionId = 1;

  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async {
    final assigned = note.copyWith(id: _nextNoteId++);
    _byPlate.putIfAbsent(assigned.plateLogId, () => []).add(assigned);
    return CoachNoteAppended(assigned);
  }

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async {
    return List<CoachNote>.unmodifiable(
      _byPlate[plateLogId] ?? const <CoachNote>[],
    );
  }

  @override
  Future<CoachInteractionResult> recordInteraction(
    CoachInteractionLog log,
  ) async {
    _interactions.add(log);
    return CoachInteractionRecorded(_nextInteractionId++);
  }
}

/// Production wasm coach-note store — every method reads / writes
/// the same `AppDatabase` the `WasmEncryptedStore` opens. The
/// pair stays in sync (AD-3 invariant). While the session is
/// locked, `forPlate` returns an empty list (the UI hides the
/// whisper) and the append / record methods return typed
/// `CoachNoteAppendFailure` / `CoachInteractionFailed` with a
/// `WebSessionKeyFailure` payload.
class _WasmCoachNoteStore implements CoachNoteStore {
  const _WasmCoachNoteStore();

  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async {
    return const CoachNoteAppendFailure(
      StoreFailure(encryptedStoreError: WebSessionKeyFailure()),
    );
  }

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async => const [];

  @override
  Future<CoachInteractionResult> recordInteraction(
    CoachInteractionLog log,
  ) async {
    return const CoachInteractionFailed(
      StoreFailure(encryptedStoreError: WebSessionKeyFailure()),
    );
  }
}
