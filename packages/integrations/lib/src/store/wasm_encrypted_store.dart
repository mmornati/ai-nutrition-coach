// Web-side `EncryptedStore` implementation (AD-8 / Phase 2B).
//
// The web build runs the same drift schema on sqlite3mc compiled to
// WebAssembly (ChaCha20-Poly1305, the cipher mobile uses), persisted in
// IndexedDB and unreadable without the passphrase-derived key. This adapter
// is a thin view over the controller's open database: while the store is
// locked, `recordPlate` returns a typed
// `StoreFailure(encryptedStoreError: WebSessionKeyFailure())`, `readRange`
// a typed `PlatesReadFailed`, and `watchRange` is empty -- no exception
// crosses the port. Opening, keying, verification, locking and erasing live
// in `WebStoreController`. The queries themselves are the shared
// `PlateQueries` (identical to mobile).
//
// The `AppDatabase` schema is identical to mobile (AD-3 / NFR2); the
// coach-note store (`WasmCoachNoteStore`) reads the same database.

import 'package:domain_core/domain_core.dart';

import 'corrupt_row_log.dart';
import 'plate_queries.dart';
import 'web_store_controller.dart';

/// The web-side `EncryptedStore`.
class WasmEncryptedStore implements EncryptedStore {
  WasmEncryptedStore({required WebDatabaseSource source}) : _source = source;

  final WebDatabaseSource _source;

  static const StoreFailure _locked = StoreFailure(
    encryptedStoreError: WebSessionKeyFailure(),
  );

  /// True when the store is unlocked and the database is open.
  bool get isOpen => _source.database != null;

  PlateQueries? _queries() {
    final db = _source.database;
    return db == null ? null : PlateQueries(db, onCorruptRow: reportCorruptRow);
  }

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async {
    final queries = _queries();
    if (queries == null) return _locked;
    return queries.record(entries: entries, loggedAtUtc: loggedAtUtc);
  }

  @override
  Stream<List<PlateLog>> watchRange({
    required DateTime from,
    required DateTime to,
  }) {
    final queries = _queries();
    // Locked session — nothing to emit; the Day Board shows its quiet
    // open dents and the gate shows the unlock screen.
    if (queries == null) return const Stream<List<PlateLog>>.empty();
    return queries.watch(from: from, to: to);
  }

  @override
  Future<ReadPlatesResult> readRange({DateTime? from, DateTime? to}) async {
    final queries = _queries();
    if (queries == null) return const PlatesReadFailed(_locked);
    return queries.read(from: from, to: to);
  }

  @override
  Future<DeletePlateResult> deletePlate(int plateLogId) async {
    final queries = _queries();
    if (queries == null) return const PlateDeleteFailed(_locked);
    return queries.delete(plateLogId);
  }

  @override
  Future<void> close() => _source.lock();
}
