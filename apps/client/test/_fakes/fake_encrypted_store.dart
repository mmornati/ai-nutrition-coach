// Test-only `EncryptedStore` fake — owns a deterministic in-memory list
// of plates and exposes them through `watchRecent`. Reused by later
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

import 'dart:async';

import 'package:domain_core/domain_core.dart';

class FakeEncryptedStore implements EncryptedStore {
  FakeEncryptedStore({
    List<PlateLog>? initial,
    this.recordResult,
  })  : _plates = [...?initial],
        _controller = StreamController<List<PlateLog>>.broadcast();

  final RecordPlateResult? recordResult;
  final List<FoodEntryDraft> _seenDrafts = [];
  final List<DateTime?> _seenLoggedAt = [];

  /// Captured drafts from every `recordPlate` call — exposed so tests
  /// (notably the Story 1.5 manual-entry widget test) can assert on
  /// what the screen actually committed. Most-recent last.
  List<FoodEntryDraft> get capturedDrafts => List.unmodifiable(_seenDrafts);
  List<PlateLog> _plates;
  final StreamController<List<PlateLog>> _controller;
  int _nextPlateId = 1;
  int _nextEntryId = 1;

  /// Snapshots the test has seen via `watchRecent` (initial seed +
  /// every push via `seed()` / `recordPlate()`). Most-recent last.
  final List<List<PlateLog>> emittedSnapshots = [];

  /// Replaces the current snapshot and pushes the new list to all
  /// active `watchRecent()` subscribers. Tests that hold a reference to
  /// the fake can swap data mid-test (e.g. the week-strip suite
  /// `seed()`s a multi-day history after the widget tree is built).
  void seed(List<PlateLog> plates) {
    _plates = [...plates];
    final snapshot = List<PlateLog>.unmodifiable(_plates);
    emittedSnapshots.add(snapshot);
    _controller.add(snapshot);
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

    final loggedAt = loggedAtUtc ?? DateTime.now().toUtc();
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
    final snapshot = List<PlateLog>.unmodifiable(_plates);
    emittedSnapshots.add(snapshot);
    _controller.add(snapshot);
    return RecordPlateSuccess(plate);
  }

  @override
  Stream<List<PlateLog>> watchRecent({DateTime? since}) async* {
    // Yield the current snapshot synchronously (mimics drift's
    // `query.watch()` behavior — every subscriber sees the initial
    // state immediately) then forward every subsequent push to active
    // listeners. Broadcast streams don't replay, so we must yield the
    // initial state here rather than queueing it on the controller.
    yield List<PlateLog>.unmodifiable(_plates);
    yield* _controller.stream;
  }

  @override
  Future<void> close() async {
    if (!_controller.isClosed) {
      await _controller.close();
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
  return PlateLog(
    id: id,
    loggedAtUtc: localTime.toUtc(),
    entries: entries,
  );
}
