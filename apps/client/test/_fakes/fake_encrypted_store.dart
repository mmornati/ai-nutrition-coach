// Test-only `EncryptedStore` fake — owns a deterministic in-memory list
// of plates and exposes them through `watchRange` / `readRange`. Reused by later
// Epic 1 stories (1.4 / 1.6 / 1.8) so the helper lives in
// `test/_fakes/` rather than being repeated per test.
//
// Important: this is a *test* helper. It implements the same
// `EncryptedStore` interface as the real adapter, so tests that
// override `encryptedStoreProvider` with this fake exercise the same
// shape they would in production. The fake is intentionally tiny — no
// drift, no timers, no I/O.
//
// Story 1.4 swap: the underlying stream is now a broadcast controller
// so `seed()` (and `recordPlate()`) re-emit the new snapshot to active
// subscribers — the week-strip tests need the strip to refresh after a
// new plate is added or after a multi-day seed lands. The first emit
// for each subscriber is still the snapshot the fake was constructed
// with, so existing 1.3 tests that await `.first` keep working.
//
// Story 2.2 swap: `FakeCoachNoteStore` (a paired helper for the
// `CoachNoteStore` port) lives below so the post-resolve whisper path
// can be exercised in widget tests without a real drift database.

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

class FakeEncryptedStore implements EncryptedStore {
  /// Plate ids passed to [deletePlate] (most recent last).
  final List<int> deletedPlateIds = [];

  @override
  Future<DeletePlateResult> deletePlate(int plateLogId) async {
    deletedPlateIds.add(plateLogId);
    _plates = [
      for (final p in _plates)
        if (p.id != plateLogId) p,
    ];
    emittedSnapshots.add(List<PlateLog>.unmodifiable(_plates));
    _changes.add(null);
    return const PlateDeleted();
  }

  FakeEncryptedStore({List<PlateLog>? initial, this.recordResult})
    : _plates = [...?initial],
      _changes = StreamController<void>.broadcast();

  final RecordPlateResult? recordResult;
  final List<FoodEntryDraft> _seenDrafts = [];
  final List<DateTime?> _seenLoggedAt = [];

  /// Captured drafts from every `recordPlate` call — exposed so tests
  /// (notably the Story 1.5 manual-entry widget test) can assert on
  /// what the screen actually committed. Most-recent last.
  List<FoodEntryDraft> get capturedDrafts => List.unmodifiable(_seenDrafts);
  List<PlateLog> _plates;
  final StreamController<void> _changes;
  int _nextPlateId = 1;
  int _nextEntryId = 1;

  /// Snapshots the test has seen via `watchRange` (initial seed +
  /// every push via `seed()` / `recordPlate()`). Most-recent last.
  final List<List<PlateLog>> emittedSnapshots = [];

  /// Replaces the current snapshot and pushes the new list to all
  /// active `watchRange()` subscribers. Tests that hold a reference to
  /// the fake can swap data mid-test (e.g. the week-strip suite
  /// `seed()`s a multi-day history after the widget tree is built).
  void seed(List<PlateLog> plates) {
    _plates = [...plates];
    emittedSnapshots.add(List<PlateLog>.unmodifiable(_plates));
    _changes.add(null);
  }

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async {
    _seenDrafts.addAll(entries);
    _seenLoggedAt.add(loggedAtUtc);

    if (recordResult != null) {
      return recordResult!;
    }

    // Millisecond precision, like the real stores.
    final raw = loggedAtUtc ?? DateTime.now();
    final loggedAt = DateTime.fromMillisecondsSinceEpoch(
      raw.millisecondsSinceEpoch,
      isUtc: true,
    );
    final plateId = _nextPlateId++;
    final committedEntries = <FoodEntry>[];
    for (final draft in entries) {
      committedEntries.add(
        FoodEntry(
          id: _nextEntryId++,
          plateLogId: plateId,
          databaseFood: draft.databaseFood,
          quantity: draft.quantity,
        ),
      );
    }
    final plate = PlateLog(
      id: plateId,
      loggedAtUtc: loggedAt,
      entries: committedEntries,
    );
    _plates = [plate, ..._plates];
    emittedSnapshots.add(List<PlateLog>.unmodifiable(_plates));
    _changes.add(null);
    return RecordPlateSuccess(plate);
  }

  /// Every `[from, to)` a subscriber asked `watchRange` for — lets tests
  /// assert that the Day Board / week strip read a bounded window, not the
  /// whole history (F8).
  final List<({DateTime from, DateTime to})> watchedRanges = [];

  @override
  Stream<List<PlateLog>> watchRange({
    required DateTime from,
    required DateTime to,
  }) {
    watchedRanges.add((from: from, to: to));
    // Same observable behaviour as drift's `query.watch()`: the current
    // snapshot on listen, then one per change, each filtered to the range
    // like the real join query. The change subscription is made together
    // with the listen so a write right after the first emission is seen.
    return _watchSnapshots(
      _changes,
      () => platesInRange(_plates, from: from, to: to),
    );
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

/// Build a `PlateLog` + `FoodEntry` for tests at a deterministic local
/// time. The convention is `at(year, month, day, hour, minute, [second])`
/// wrapping back to UTC so the local hour matches the local-clock input.
PlateLog plateAt(
  int id, {
  required DateTime localTime,
  required String dish,
  String unit = 'serving',
  num low = 1,
  num high = 1,
  String displayLabel = '~1 serving',
  SourceCatalog source = SourceCatalog.manual,
  FoodGroup foodGroup = FoodGroup.other,
  List<FoodEntry> extraEntries = const [],
}) {
  final entries = <FoodEntry>[
    FoodEntry(
      id: id * 1000 + 1,
      plateLogId: id,
      databaseFood: DatabaseFood(
        sourceRef: 'manual:${dish.toLowerCase()}',
        displayName: dish,
        source: source,
        foodGroup: foodGroup,
      ),
      quantity: QuantityRange(
        low: low,
        high: high,
        unit: unit,
        displayLabel: displayLabel,
      ),
    ),
    ...extraEntries,
  ];
  return PlateLog(id: id, loggedAtUtc: localTime.toUtc(), entries: entries);
}

/// Test-only `CoachNoteStore` fake — paired with `FakeEncryptedStore`
/// so the post-resolve whisper path can be exercised in widget tests
/// without a real drift database. Story 2.2 ships the real
/// `LocalCoachNoteStore` adapter; tests that exercise the whisper
/// surface use this fake to avoid pulling in drift + sqlite3mc.
class FakeCoachNoteStore implements CoachNoteStore {
  @override
  Future<DeletePlateResult> deleteForPlate(int plateLogId) async {
    final notes = byPlate.remove(plateLogId) ?? const <CoachNote>[];
    for (final n in notes) {
      dismissed.remove(coachNoteDismissalKey(n.id));
    }
    interactions.removeWhere((i) => notes.any((n) => n.id == i.noteId));
    _changes.add(null);
    return const PlateDeleted();
  }

  FakeCoachNoteStore();

  final Map<int, List<CoachNote>> byPlate = {};
  final List<CoachInteractionLog> interactions = [];
  final Set<String> dismissed = <String>{};
  final StreamController<void> _changes = StreamController<void>.broadcast();
  int _nextId = 1;
  int _nextInteractionId = 1;

  /// Pre-seed a coach note for the given plate — used by tests that
  /// want to render the whisper without driving the full
  /// `RecordPlate → CoachNoteGenerator` chain.
  void seed(int plateLogId, CoachNote note) {
    final assigned = note.copyWith(
      id: note.id == 0 ? _nextId++ : note.id,
      plateLogId: plateLogId,
    );
    byPlate.putIfAbsent(plateLogId, () => []).add(assigned);
    _changes.add(null);
  }

  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async {
    final assigned = note.copyWith(id: _nextId++);
    byPlate.putIfAbsent(assigned.plateLogId, () => []).add(assigned);
    _changes.add(null);
    return CoachNoteAppended(assigned);
  }

  @override
  Stream<List<CoachNote>> watchForPlate(int plateLogId) => _watchSnapshots(
    _changes,
    () => List<CoachNote>.unmodifiable(
      byPlate[plateLogId] ?? const <CoachNote>[],
    ),
  );

  @override
  Future<CoachInteractionResult> recordDismissal(String key) async {
    dismissed.add(key);
    _changes.add(null);
    return CoachInteractionRecorded(_nextInteractionId++);
  }

  @override
  Stream<Set<String>> watchDismissals() =>
      _watchSnapshots(_changes, () => Set<String>.of(dismissed));

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async {
    return List<CoachNote>.unmodifiable(
      byPlate[plateLogId] ?? const <CoachNote>[],
    );
  }

  @override
  Future<CoachInteractionResult> recordInteraction(
    CoachInteractionLog log,
  ) async {
    interactions.add(log);
    return CoachInteractionRecorded(_nextInteractionId++);
  }
}
