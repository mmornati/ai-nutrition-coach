// Web stub for the `EncryptedStore` port — keeps the web build compilable
// until Story 4.1 (sqlite3.wasm + PBKDF2). Every method returns a typed
// `StoreFailure(platformError: UnsupportedPlatformFailure)` synchronously
// so callers see a uniform failure shape — no exception ever crosses
// the port.

import 'package:domain_core/domain_core.dart';

class WebEncryptedStoreStub implements EncryptedStore {
  const WebEncryptedStoreStub();

  static const RecordPlateResult _unsupported = StoreFailure(
    platformError: UnsupportedPlatformFailure(),
  );

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async =>
      _unsupported;

  @override
  Stream<List<PlateLog>> watchRecent({DateTime? since}) async* {
    yield const <PlateLog>[];
  }

  @override
  Future<void> close() async {}
}
