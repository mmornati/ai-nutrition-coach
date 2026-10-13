// Dev-only in-memory stores for local web testing.
//
// The real web store is `WasmEncryptedStore` (sqlite3mc wasm, ChaCha20-
// Poly1305 pages in IndexedDB, passphrase-derived key). These in-memory
// stores are selected ONLY when the web build is compiled with
// `--dart-define=AI_NUTRITION_COACH_DEV_IN_MEMORY_STORE=true` (see
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

/// A single-subscription stream that emits `snapshot()` when listened to and
/// again on every event of [changes]. The `changes` subscription is made
/// synchronously with the listen (never after the first `yield`), so a write
/// that lands right after the first emission is not lost - the same
/// guarantee drift's `query.watch()` gives the real adapters.
Stream<T> _watchSnapshots<T>(
  StreamController<void> changes,
  T Function() snapshot,
) {
  late final StreamController<T> out;
  StreamSubscription<void>? sub;
  out = StreamController<T>(
    onListen: () {
      out.add(snapshot());
      sub = changes.stream.listen(
        (_) => out.add(snapshot()),
        onDone: out.close,
      );
    },
    onCancel: () => sub?.cancel(),
  );
  return out.stream;
}

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
  }) => _watchSnapshots(
    _changes,
    () => platesInRange(_plates, from: from, to: to),
  );

  @override
  Future<ReadPlatesResult> readRange({DateTime? from, DateTime? to}) async =>
      PlatesRead(platesInRange(_plates, from: from, to: to));

  @override
  Future<DeletePlateResult> deletePlate(int plateLogId) async {
    _plates.removeWhere((p) => p.id == plateLogId);
    if (!_changes.isClosed) _changes.add(null);
    return const PlateDeleted();
  }

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
  Stream<List<CoachNote>> watchForPlate(int plateLogId) => _watchSnapshots(
    _changes,
    () => List<CoachNote>.unmodifiable(
      _byPlate[plateLogId] ?? const <CoachNote>[],
    ),
  );

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
  Future<DeletePlateResult> deleteForPlate(int plateLogId) async {
    final notes = _byPlate.remove(plateLogId) ?? const <CoachNote>[];
    for (final n in notes) {
      _dismissed.remove(coachNoteDismissalKey(n.id));
    }
    _interactions.removeWhere((i) => notes.any((n) => n.id == i.noteId));
    _changes.add(null);
    return const PlateDeleted();
  }

  @override
  Stream<Set<String>> watchDismissals() =>
      _watchSnapshots(_changes, () => Set<String>.of(_dismissed));
}
