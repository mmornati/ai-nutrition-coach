// Web implementation of the `createEncryptedStore` factory.
//
// Compiled ONLY on web targets via the conditional import in
// `create_encrypted_store.dart`. Returns the `WebEncryptedStoreStub` by
// default so a production web build stays honest (every store call yields
// the typed `UnsupportedPlatformFailure` shape; Story 4.1 swaps in a
// wasm-backed implementation).
//
// For LOCAL DEVELOPMENT ONLY, `--dart-define=OPENPLATE_DEV_IN_MEMORY_STORE=true`
// selects `InMemoryEncryptedStore` so the capture → log → Day Board loop
// can be exercised in a browser without a wasm store. Data lives and dies
// with the tab. Production web builds must never pass this define.

import 'package:domain_core/domain_core.dart';

import 'in_memory_encrypted_store.dart';
import 'web_encrypted_store_stub.dart';

const bool _devInMemory = bool.fromEnvironment('OPENPLATE_DEV_IN_MEMORY_STORE');

Future<EncryptedStore> createEncryptedStore() async {
  if (_devInMemory) {
    return InMemoryEncryptedStore();
  }
  return const WebEncryptedStoreStub();
}