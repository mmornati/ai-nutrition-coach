// Web implementation of the `LocalDataEraser` port (Phase 2A / D8, 2B).
//
// "Erase all local data" on web returns the browser to a first-run state:
//   1. close the store (zeroes the in-memory key, closes the database);
//   2. delete the persisted store: the IndexedDB database holding the
//      encrypted pages AND the non-secret header (salt / KDF parameters), via
//      `StoreBundle.eraseStoreData` -> `WebStoreController.eraseStore`
//      (data before header, so a half-finished erase never leaves a
//      database that looks recoverable);
//   3. clear the `flutter_secure_storage` namespace (BYOK key, quota
//      counter).
// This is also the recovery path for a forgotten passphrase. Exports are
// browser downloads the app never keeps. Steps are independent and
// best-effort; the result names every failed step.

import 'package:domain_core/domain_core.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'secure_storage_options.dart';

class LocalDataEraserImpl implements LocalDataEraser {
  LocalDataEraserImpl({
    this.closeDatabase,
    this.eraseStoreData,
    FlutterSecureStorage? storage,
    Future<String> Function()? databaseFilePath,
    Future<String> Function()? temporaryDirectoryPath,
    Future<String> Function()? documentsDirectoryPath,
    Future<List<String>> Function()? pickerRootPaths,
  }) : _storage = storage ?? aiNutritionCoachSecureStorage;

  final Future<void> Function()? closeDatabase;

  /// Deletes the persisted web store (`StoreBundle.eraseStoreData`).
  final Future<void> Function()? eraseStoreData;
  final FlutterSecureStorage _storage;

  @override
  Future<EraseLocalDataResult> eraseAll() async {
    final failed = <EraseStep>[];
    try {
      await closeDatabase?.call();
    } on Object {
      failed.add(EraseStep.closeStore);
    }
    try {
      await eraseStoreData?.call();
    } on Object {
      failed.add(EraseStep.databaseFiles);
    }
    try {
      for (final alias in SecureStorageAliases.all) {
        await secureDeleteEverywhere(_storage, alias);
      }
      await secureDeleteAllEverywhere(_storage);
    } on Object {
      failed.add(EraseStep.secureStorage);
    }
    return failed.isEmpty
        ? const EraseLocalDataSuccess()
        : EraseLocalDataFailure(failed);
  }
}
