// IO implementation of the `createStores` factory.
//
// Compiled ONLY on io-capable targets (Android / iOS / desktop) via the
// conditional import in `create_encrypted_store.dart`. It carries the
// drift + sqlite3 + FFI dependency chain, which has no web runtime, so
// it must never be statically reachable from a web build.
//
// On web the factory resolves to `create_encrypted_store_web.dart`
// instead; Story 4.1 (sqlite3.wasm + PBKDF2) will replace that stub with a
// wasm-backed implementation behind the same `EncryptedStore` port.
//
// AD-3: both stores share the underlying `AppDatabase` so the
// coach-note writes land in the same encrypted database the plate-log
// commits use. One database, one key, one cipher pragma — no second
// source.

import 'dart:io';

import 'package:domain_core/domain_core.dart';
import 'package:path_provider/path_provider.dart';

import 'corrupt_row_log.dart';
import 'create_encrypted_store.dart';
import 'encrypted_store_adapter.dart';
import 'failed_store.dart';
import 'key_value_store.dart';
import 'local_coach_note_store.dart';
import 'native_database_opener.dart';
import 'secure_key_source.dart';

Future<StoreBundle> createStores({StoreOpenOverrides? overrides}) async {
  final String filePath;
  try {
    filePath =
        overrides?.databaseFilePath ??
        '${(await getApplicationDocumentsDirectory()).path}/$kDatabaseFileName';
  } on Object {
    return _failed(const StoreFailure(encryptedStoreError: SecureKeyFailure()));
  }
  final result = await openEncryptedStore(
    file: File(filePath),
    keySource: overrides?.keySource ?? SecureKeySourceImpl(),
  );
  switch (result) {
    case StoreOpened(:final database):
      // One `AppDatabase` backs both stores so `coach_notes` shares the
      // key and cipher (AD-3).
      return StoreBundle(
        encryptedStore: EncryptedStoreAdapter(
          database: database,
          onCorruptRow: reportCorruptRow,
        ),
        coachNoteStore: LocalCoachNoteStore(database: database),
        keyValueStore: DatabaseKeyValueStore.of(database),
        closeDatabase: database.close,
      );
    case StoreOpenFailed(:final failure):
      return _failed(failure);
  }
}

StoreBundle _failed(StoreFailure failure) => StoreBundle(
  encryptedStore: FailedEncryptedStore(failure),
  coachNoteStore: FailedCoachNoteStore(failure),
  startupFailure: failure,
);
