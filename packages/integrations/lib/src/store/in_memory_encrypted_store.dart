// Dev-only in-memory `EncryptedStore` for local web testing.
//
// The real web store is `WasmEncryptedStore` (Story 4.1), which opens
// the same drift schema on `sqlite3.wasm` with a PBKDF2-derived session
// key (AD-8: in-memory only, never persisted). The wasm binding is
// still being wired — for now the web factory falls back to an
// in-memory store so the capture → log → Day Board loop can be
// exercised in a browser without the wasm binary.
//
// This store is selected ONLY when the web build is compiled with
// `--dart-define=OPENPLATE_DEV_IN_MEMORY_STORE=true` (see
// `create_encrypted_store_web.dart`). It mirrors the exact shape that
// `FakeEncryptedStore` proves in widget tests: a broadcast controller that
// re-emits a full snapshot per commit (same contract as drift's
// `query.watch()` — AD-3's "derived view" rule), newest first.
//
// NOT for production: data lives and dies with the browser tab.

import 'dart:async';

import 'package:domain_core/domain_core.dart';

class InMemoryEncryptedStore implements EncryptedStore {
  InMemoryEncryptedStore();

  final List<PlateLog> _plates = [];
  final StreamController<List<PlateLog>> _controller =
      StreamController<List<PlateLog>>.broadcast();
  int _nextPlateId = 1;
  int _nextEntryId = 1;

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async {
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
    _plates.insert(0, plate);
    _controller.add(List.unmodifiable(_plates));
    return RecordPlateSuccess(plate);
  }

  @override
  Stream<List<PlateLog>> watchRecent({DateTime? since}) async* {
    // Yield the current snapshot synchronously, then forward every push —
    // same observable behavior as drift's `query.watch()`.
    yield List.unmodifiable(_plates);
    yield* _controller.stream;
  }

  @override
  Future<void> close() async {
    if (!_controller.isClosed) {
      await _controller.close();
    }
  }
}