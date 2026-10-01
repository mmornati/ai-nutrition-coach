// io implementation of the `LocalDataEraser` port (Phase 2A / D8).
//
// "Erase all local data" returns the device to a first-run state:
//   1. close the shared database handle (so the files can be removed and
//      no write can recreate them);
//   2. delete the database file and its `-wal` / `-shm` / `-journal`
//      sidecars;
//   3. delete every secure-storage alias (database key, BYOK key, quota
//      counters, rung config — `SecureStorageAliases.all`) and then
//      clear the whole namespace as a backstop;
//   4. delete export files (the temp export directory, the `share_plus`
//      cache copies, plus any legacy
//      `*-openplate.csv|json` an older build left in the documents
//      directory).
//
// Steps are independent and best-effort: a failure in one never skips
// the others, and the result names every failed step. Files are removed
// before the keys so a half-finished erase never leaves a database that
// looks recoverable. It is also the recovery path for a lost database
// key (`KeyLostFailure`, D7).
//
// Paths and the storage instance are injectable; production defaults
// come from `path_provider` and `openPlateSecureStorage`.

import 'dart:io';

import 'package:domain_core/domain_core.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';

import '../export/export_paths.dart';
import 'create_encrypted_store.dart' show kDatabaseFileName;
import 'secure_storage_options.dart';

class LocalDataEraserImpl implements LocalDataEraser {
  LocalDataEraserImpl({
    this.closeDatabase,
    FlutterSecureStorage? storage,
    Future<String> Function()? databaseFilePath,
    Future<String> Function()? temporaryDirectoryPath,
    Future<String> Function()? documentsDirectoryPath,
  }) : _storage = storage ?? openPlateSecureStorage,
       _databaseFilePath = databaseFilePath ?? _defaultDatabaseFilePath,
       _temporaryDirectoryPath =
           temporaryDirectoryPath ?? _defaultTemporaryDirectoryPath,
       _documentsDirectoryPath =
           documentsDirectoryPath ?? _defaultDocumentsDirectoryPath;

  /// Closes the open database (`StoreBundle.closeDatabase`). `null` when
  /// the store never opened (e.g. the lost-key state): nothing to close.
  final Future<void> Function()? closeDatabase;

  final FlutterSecureStorage _storage;
  final Future<String> Function() _databaseFilePath;
  final Future<String> Function() _temporaryDirectoryPath;
  final Future<String> Function() _documentsDirectoryPath;

  static Future<String> _defaultDocumentsDirectoryPath() async =>
      (await getApplicationDocumentsDirectory()).path;

  static Future<String> _defaultTemporaryDirectoryPath() async =>
      (await getTemporaryDirectory()).path;

  static Future<String> _defaultDatabaseFilePath() async =>
      '${await _defaultDocumentsDirectoryPath()}/$kDatabaseFileName';

  @override
  Future<EraseLocalDataResult> eraseAll() async {
    final failed = <EraseStep>[];

    if (!await _attempt(() async => await closeDatabase?.call())) {
      failed.add(EraseStep.closeStore);
    }
    if (!await _attempt(_deleteDatabaseFiles)) {
      failed.add(EraseStep.databaseFiles);
    }
    if (!await _attempt(_deleteSecureStorage)) {
      failed.add(EraseStep.secureStorage);
    }
    if (!await _attempt(_deleteExportFiles)) {
      failed.add(EraseStep.exportFiles);
    }

    return failed.isEmpty
        ? const EraseLocalDataSuccess()
        : EraseLocalDataFailure(failed);
  }

  Future<bool> _attempt(Future<void> Function() step) async {
    try {
      await step();
      return true;
    } on Object {
      return false;
    }
  }

  Future<void> _deleteDatabaseFiles() async {
    final path = await _databaseFilePath();
    for (final suffix in const ['', '-wal', '-shm', '-journal']) {
      final file = File('$path$suffix');
      if (file.existsSync()) await file.delete();
    }
  }

  Future<void> _deleteSecureStorage() async {
    Object? firstError;
    for (final alias in SecureStorageAliases.all) {
      try {
        await secureDeleteEverywhere(_storage, alias);
      } on Object catch (e) {
        firstError ??= e;
      }
    }
    try {
      await secureDeleteAllEverywhere(_storage);
    } on Object catch (e) {
      firstError ??= e;
    }
    if (firstError != null) throw firstError;
  }

  Future<void> _deleteExportFiles() async {
    final tmp = Directory(
      '${await _temporaryDirectoryPath()}/$kExportSubdirectory',
    );
    if (tmp.existsSync()) await tmp.delete(recursive: true);
    // Android `share_plus` leaves a copy of every shared file here.
    final shared = Directory(
      '${await _temporaryDirectoryPath()}/$kSharePlusCacheSubdirectory',
    );
    if (shared.existsSync()) await shared.delete(recursive: true);

    final docs = Directory(await _documentsDirectoryPath());
    if (docs.existsSync()) {
      await for (final entity in docs.list(followLinks: false)) {
        if (entity is File &&
            legacyExportFileName.hasMatch(entity.uri.pathSegments.last)) {
          await entity.delete();
        }
      }
    }
  }
}
