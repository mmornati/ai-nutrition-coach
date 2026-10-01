// Web implementation of the `LocalDataEraser` port (Phase 2A / D8).
//
// The web build has no database file or export directory: its store is
// the session-sealed wasm store (AD-8; Phase 2B decides its final shape)
// and exports are browser downloads the app never keeps. What the web
// build DOES persist is `flutter_secure_storage` content (BYOK key,
// quota counter), so this implementation closes the store and clears
// that namespace. Clearing wasm / browser storage is part of Phase 2B.

import 'package:domain_core/domain_core.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'secure_storage_options.dart';

class LocalDataEraserImpl implements LocalDataEraser {
  LocalDataEraserImpl({
    this.closeDatabase,
    FlutterSecureStorage? storage,
    Future<String> Function()? databaseFilePath,
    Future<String> Function()? temporaryDirectoryPath,
    Future<String> Function()? documentsDirectoryPath,
  }) : _storage = storage ?? openPlateSecureStorage;

  final Future<void> Function()? closeDatabase;
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
