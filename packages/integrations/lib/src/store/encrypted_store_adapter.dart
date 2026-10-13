// `EncryptedStore` mobile implementation — drift on sqlite3mc with
// ChaCha20-Poly1305 at rest (AD-8).
//
// A thin adapter over `PlateQueries` (the commit, the range join query and
// the row mapping are shared with the web store — see `plate_queries.dart`).
// Every error is mapped to a typed `StoreFailure` (`mapStoreError`, D10) so
// the port never throws; errors on the watch stream ride the error channel as
// a typed `StoreStreamException`, and a stored row that cannot be mapped is
// skipped and reported through `onCorruptRow` so it can never poison the
// stream.
//
// Encryption (AD-8): the key is attached by the shared synchronous
// `attachKeyAndVerify` (`sqlite_key_attach.dart`), reached through
// `openEncryptedStore` (`native_database_opener.dart`). This class contains
// no keying code.

import 'package:domain_core/domain_core.dart';

import 'app_database.dart';
import 'plate_queries.dart';

export 'plate_queries.dart' show CorruptRowReporter;

class EncryptedStoreAdapter implements EncryptedStore {
  EncryptedStoreAdapter({
    required AppDatabase database,
    CorruptRowReporter? onCorruptRow,
  }) : _db = database,
       _queries = PlateQueries(database, onCorruptRow: onCorruptRow);

  /// Tests call this directly with `AppDatabase(NativeDatabase.memory())`;
  /// production builds the database through `openEncryptedStore`
  /// (`native_database_opener.dart`), the single keyed open path.
  final AppDatabase _db;
  final PlateQueries _queries;

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) => _queries.record(entries: entries, loggedAtUtc: loggedAtUtc);

  @override
  Stream<List<PlateLog>> watchRange({
    required DateTime from,
    required DateTime to,
  }) => _queries.watch(from: from, to: to);

  @override
  Future<ReadPlatesResult> readRange({DateTime? from, DateTime? to}) =>
      _queries.read(from: from, to: to);

  @override
  Future<DeletePlateResult> deletePlate(int plateLogId) =>
      _queries.delete(plateLogId);

  @override
  Future<void> close() => _db.close();
}
