// IO implementation of the `createEncryptedStore` factory.
//
// Compiled ONLY on io-capable targets (Android / iOS / desktop) via the
// conditional import in `create_encrypted_store.dart`. It carries the
// drift + sqlite3 + FFI dependency chain, which has no web runtime, so it
// must never be statically reachable from a web build.
//
// On web the factory resolves to `create_encrypted_store_stub.dart`
// instead; Story 4.1 (sqlite3.wasm + PBKDF2) will replace that stub with a
// wasm-backed implementation behind the same `EncryptedStore` port.

import 'package:domain_core/domain_core.dart';
import 'package:path_provider/path_provider.dart';

import 'encrypted_store_adapter.dart';
import 'secure_key_source.dart';

Future<EncryptedStore> createEncryptedStore() async {
  try {
    final dir = await getApplicationDocumentsDirectory();
    final filePath = '${dir.path}/openplate_v1.sqlite';
    return await EncryptedStoreAdapter.open(
      filePath: filePath,
      keySource: SecureKeySourceImpl(),
    );
  } on Exception {
    return const _SecureKeyFailureStore();
  }
}

class _SecureKeyFailureStore implements EncryptedStore {
  const _SecureKeyFailureStore();

  static const RecordPlateResult _failure = StoreFailure(
    encryptedStoreError: SecureKeyFailure(),
  );

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async =>
      _failure;

  @override
  Stream<List<PlateLog>> watchRecent({DateTime? since}) async* {
    yield const <PlateLog>[];
  }

  @override
  Future<void> close() async {}
}
