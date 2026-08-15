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

import 'dart:async';

import 'package:domain_core/domain_core.dart';

class FakeEncryptedStore implements EncryptedStore {
  FakeEncryptedStore({
    List<PlateLog>? initial,
    this.recordResult,
  })  : _plates = [...?initial],
        _stream = Stream<List<PlateLog>>.value(
          List<PlateLog>.unmodifiable([...?initial]),
        );

  final RecordPlateResult? recordResult;
  final List<FoodEntryDraft> _seenDrafts = [];
  final List<DateTime?> _seenLoggedAt = [];
  List<PlateLog> _plates;
  final Stream<List<PlateLog>> _stream;
  int _nextPlateId = 1;
  int _nextEntryId = 1;

  /// Snapshots the test has seen via `watchRecent`. Most-recent last.
  final List<List<PlateLog>> emittedSnapshots = [];

  /// Replaces the current snapshot — reuses the existing stream for
  /// reposing; the initial snapshot is already what the test started
  /// with.
  void seed(List<PlateLog> plates) {
    _plates = [...plates];
    emittedSnapshots.add(List<PlateLog>.unmodifiable(_plates));
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
    emittedSnapshots.add(List<PlateLog>.unmodifiable(_plates));
    return RecordPlateSuccess(plate);
  }

  @override
  Stream<List<PlateLog>> watchRecent({DateTime? since}) => _stream;

  @override
  Future<void> close() async {
    // No-op: the fake owns its stream as a static value; Riverpod will
    // stop listening on its own when the widget tree is torn down.
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
