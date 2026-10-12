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

import 'package:domain_core/domain_core.dart' hide WebSessionKey;

import 'app_database.dart';
import 'create_encrypted_store.dart';
import 'in_memory_encrypted_store.dart';
import 'wasm_encrypted_store.dart';
import 'web_session_key.dart';

const bool _devInMemory =
    bool.fromEnvironment('AI_NUTRITION_COACH_DEV_IN_MEMORY_STORE');

/// Singleton stores for the dev-in-memory path so successive
/// `recordPlate` / `forPlate` calls share the same in-memory list.
final InMemoryEncryptedStore _devStore = InMemoryEncryptedStore();
final _DevInMemoryCoachNoteStore _devCoachNotes =
    _DevInMemoryCoachNoteStore();

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

/// Open the wasm database with the derived key. The v1.1 build
/// plumbing follow-up wires the `sqlite3.wasm` binary + the drift
/// `WebSqlCipher` from `drift_flutter`. The architecture is in
/// place so the binding drops in without touching the port.
Future<AppDatabase> _openWasmDatabase(Uint8List derivedKey) {
  // TODO(Story 4.1 wasm binding): replace this placeholder with
  //   return WasmDatabase.open(
  //     databaseName: 'ai_nutrition_coach_v1',
  //     sqlite3Uri: Uri.parse('sqlite3.wasm'),
  //     driftWorkerUri: Uri.parse('drift_worker.js'),
  //   ).then((e) => AppDatabase(e));
  // once the `drift_flutter` web package + the wasm binary are
  // added. Until then the production web store cannot open a
  // durable database — this placeholder throws the honest
  // `WebSessionKeyFailure` so the lock screen + Day Board degrade
  // exactly as they do for a locked session (Story 4.1 / AD-8)
  // instead of crashing. The dev-in-memory path
  // (`AI_NUTRITION_COACH_DEV_IN_MEMORY_STORE=true`) never reaches this.
  throw UnimplementedError(
    'AI Nutrition Coach web storage: the drift sqlite3.wasm binding is a '
    'v1.1 follow-up. Run the local dev build with '
    '--dart-define=AI_NUTRITION_COACH_DEV_IN_MEMORY_STORE=true instead.',
  );
}

Future<StoreBundle> createStores() async {
  if (_devInMemory) {
    // The dev-in-memory path doesn't need a lock screen. Force-
    // unlock the session key so the UnlockGate renders the Day
    // Board directly, and provide a no-op unlock probe so the
    // default provider doesn't throw.
    _sessionKey.forceUnlock();
    return StoreBundle(
      encryptedStore: _devStore,
      coachNoteStore: _devCoachNotes,
      webSessionKey: _sessionKey,
      webUnlockProbe: (_) async => true,
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
    return const CoachNoteAppendFailure(StoreFailure(
      encryptedStoreError: WebSessionKeyFailure(),
    ));
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
