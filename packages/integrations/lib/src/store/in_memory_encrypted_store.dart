// Dev-only in-memory stores for local web testing.
//
// The real web store is `WasmEncryptedStore` (sqlite3mc wasm, ChaCha20-
// Poly1305 pages in IndexedDB, passphrase-derived key). These in-memory
// stores are selected ONLY when the web build is compiled with
// `--dart-define=OPENPLATE_DEV_IN_MEMORY_STORE=true` (see
// `create_encrypted_store_web.dart`) so the capture -> log -> Day Board loop
// can be exercised in a browser without the wasm binary. They mirror the
// contract the real adapters keep: a broadcast controller that re-emits a
// full snapshot per commit (same contract as drift's `query.watch()` —
// AD-3's "derived view" rule), newest first, range-bounded like
// `watchRange`.
//
// NOT for production: data lives and dies with the browser tab.

import 'dart:async';

import 'package:domain_core/domain_core.dart';

class InMemoryEncryptedStore implements EncryptedStore {
  InMemoryEncryptedStore();

  final List<PlateLog> _plates = [];
  final StreamController<void> _changes = StreamController<void>.broadcast();
  int _nextPlateId = 1;
  int _nextEntryId = 1;

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async {
    // Millisecond precision, like the real stores (their text range compare
    // is only exact at one width), so the dev store behaves the same.
    final raw = loggedAtUtc ?? DateTime.now();
    final loggedAt = DateTime.fromMillisecondsSinceEpoch(
      raw.millisecondsSinceEpoch,
      isUtc: true,
    );
    final plateId = _nextPlateId++;
    final committedEntries = <FoodEntry>[
      for (final draft in entries)
        FoodEntry(
          id: _nextEntryId++,
          plateLogId: plateId,
          databaseFood: draft.databaseFood,
          quantity: draft.quantity,
        ),
    ];
    final plate = PlateLog(
      id: plateId,
      loggedAtUtc: loggedAt,
      entries: committedEntries,
    );
    _plates.insert(0, plate);
    _changes.add(null);
    return RecordPlateSuccess(plate);
  }

  @override
  Stream<List<PlateLog>> watchRange({
    required DateTime from,
    required DateTime to,
  }) async* {
    // Yield the current snapshot first, then one per change — same
    // observable behavior as drift's `query.watch()`.
    yield platesInRange(_plates, from: from, to: to);
    await for (final _ in _changes.stream) {
      yield platesInRange(_plates, from: from, to: to);
    }
  }

  @override
  Future<ReadPlatesResult> readRange({DateTime? from, DateTime? to}) async =>
      PlatesRead(platesInRange(_plates, from: from, to: to));

  @override
  Future<void> close() async {
    if (!_changes.isClosed) {
      await _changes.close();
    }
  }
}

/// Dev-only in-memory coach-note store — same surface as
/// `LocalCoachNoteStore`, so the web dev loop exercises the post-resolve
/// whisper, its durable dismissal and the watch streams.
class InMemoryCoachNoteStore implements CoachNoteStore {
  InMemoryCoachNoteStore();

  final Map<int, List<CoachNote>> _byPlate = {};
  final List<CoachInteractionLog> _interactions = [];
  final Set<String> _dismissed = <String>{};
  final StreamController<void> _changes = StreamController<void>.broadcast();
  int _nextNoteId = 1;
  int _nextInteractionId = 1;

  /// The recorded interactions (for tests).
  List<CoachInteractionLog> get interactions =>
      List<CoachInteractionLog>.unmodifiable(_interactions);

  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async {
    final assigned = note.copyWith(id: _nextNoteId++);
    _byPlate.putIfAbsent(assigned.plateLogId, () => []).add(assigned);
    _changes.add(null);
    return CoachNoteAppended(assigned);
  }

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async =>
      List<CoachNote>.unmodifiable(_byPlate[plateLogId] ?? const <CoachNote>[]);

  @override
  Stream<List<CoachNote>> watchForPlate(int plateLogId) async* {
    yield await forPlate(plateLogId);
    await for (final _ in _changes.stream) {
      yield await forPlate(plateLogId);
    }
  }

  @override
  Future<CoachInteractionResult> recordInteraction(
    CoachInteractionLog log,
  ) async {
    _interactions.add(log);
    return CoachInteractionRecorded(_nextInteractionId++);
  }

  @override
  Future<CoachInteractionResult> recordDismissal(String key) async {
    _dismissed.add(key);
    _changes.add(null);
    return CoachInteractionRecorded(_nextInteractionId++);
  }

  @override
  Stream<Set<String>> watchDismissals() async* {
    yield Set<String>.of(_dismissed);
    await for (final _ in _changes.stream) {
      yield Set<String>.of(_dismissed);
    }
  }
}
