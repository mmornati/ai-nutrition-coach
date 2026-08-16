// Web implementation of the `createStores` factory.
//
// Compiled ONLY on web targets via the conditional import in
// `create_encrypted_store.dart`. Returns the `WebEncryptedStoreStub` by
// default so a production web build stays honest (every store call yields
// the typed `UnsupportedPlatformFailure` shape; Story 4.1 swaps in a
// wasm-backed implementation).
//
// For LOCAL DEVELOPMENT ONLY, `--dart-define=OPENPLATE_DEV_IN_MEMORY_STORE=true`
// selects an in-memory store so the capture → log → Day Board loop can
// be exercised in a browser without a wasm store. Data lives and dies
// with the tab. Production web builds must never pass this define.
//
// AD-3 invariant: on web, no encrypted database exists yet (Story 4.1),
// so the coach-note store is a no-op. Every `append` returns a typed
// `CoachNoteAppendFailure` and every `forPlate` returns an empty list
// — the UI handles the empty case by hiding the whisper.

import 'package:domain_core/domain_core.dart';

import 'in_memory_encrypted_store.dart';
import 'web_encrypted_store_stub.dart';

const bool _devInMemory = bool.fromEnvironment('OPENPLATE_DEV_IN_MEMORY_STORE');

// Singleton stores for the dev-in-memory path so successive
// `recordPlate` / `forPlate` calls share the same in-memory list.
final InMemoryEncryptedStore _devStore = InMemoryEncryptedStore();
final _DevInMemoryCoachNoteStore _devCoachNotes =
    _DevInMemoryCoachNoteStore();

Future<StoreBundle> createStores() async {
  if (_devInMemory) {
    return StoreBundle(
      encryptedStore: _devStore,
      coachNoteStore: _devCoachNotes,
    );
  }
  return const StoreBundle(
    encryptedStore: WebEncryptedStoreStub(),
    coachNoteStore: _WebCoachNoteStore(),
  );
}

/// Dev-only in-memory coach-note store — same surface shape as
/// `LocalCoachNoteStore`, lives in-memory so the web dev loop can
/// exercise the post-resolve whisper. Production web builds never
/// reach this code path (the `--dart-define` is dev-only).
class _DevInMemoryCoachNoteStore implements CoachNoteStore {
  _DevInMemoryCoachNoteStore();
  final Map<int, List<CoachNote>> _byPlate = {};
  int _nextId = 1;

  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async {
    final assigned = note.copyWith(id: _nextId++);
    _byPlate.putIfAbsent(assigned.plateLogId, () => []).add(assigned);
    return CoachNoteAppended(assigned);
  }

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async {
    return List<CoachNote>.unmodifiable(
      _byPlate[plateLogId] ?? const <CoachNote>[],
    );
  }
}

/// Production web stub — every `append` returns a typed
/// `CoachNoteAppendFailure` and every `forPlate` returns an empty
/// list. The UI handles the empty case by hiding the whisper.
class _WebCoachNoteStore implements CoachNoteStore {
  const _WebCoachNoteStore();
  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async {
    return const CoachNoteAppendFailure(StoreFailure(
      platformError: UnsupportedPlatformFailure(),
    ));
  }
  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async => const [];
}
