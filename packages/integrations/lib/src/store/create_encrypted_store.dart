// Platform-selecting factory for the `EncryptedStore` port.
//
// `kIsWeb` is the canonical Flutter seam for "are we running on a web
// build?". On web we hand back the `WebEncryptedStoreStub` (Story 4.1
// will swap this for a wasm-backed implementation behind the same
// interface); on every other target we hand back a freshly-opened
// `EncryptedStoreAdapter` with a fresh `SecureKeySourceImpl`.
//
// Callers never see the branch — `apps/client` overrides the
// `encryptedStoreProvider` with the value of this factory at the
// `ProviderScope` root, so the rest of the UI only sees
// `EncryptedStore`.
//
// Failure containment: when the secure-storage read or the sqlite3mc
// cipher attach fails, we never throw across the seam — instead we
// hand back a `_SecureKeyFailureStore` so every `recordPlate` returns
// `StoreFailure(encryptedStoreError: SecureKeyFailure())` and the UI
// can render the calm "history can't open on this device" surface
// instead of an uncaught async error.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import 'encrypted_store_adapter.dart';
import 'secure_key_source.dart';
import 'web_encrypted_store_stub.dart';

Future<EncryptedStore> createEncryptedStore() async {
  if (kIsWeb) {
    return const WebEncryptedStoreStub();
  }
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
