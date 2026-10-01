// Web implementation of the `createStores` factory (Phase 2B / AD-8,
// ADR-0002).
//
// Compiled ONLY on web targets via the conditional import in
// `create_encrypted_store.dart`. The production path persists the drift
// database in IndexedDB as sqlite3mc ChaCha20-Poly1305 pages, keyed from the
// user's passphrase (WebCrypto PBKDF2-HMAC-SHA256, 600k iterations, random
// per-store salt), and every create / unlock / lock decision is made by the
// platform-neutral `WebStoreController`. This file only chooses the three
// browser adapters (`WebCryptoPbkdf2Kdf`, `WebLocalStorage`,
// `IndexedDbSqlite3mcBackend`) and wires the two stores to the controller.
//
// For LOCAL DEVELOPMENT ONLY, `--dart-define=OPENPLATE_DEV_IN_MEMORY_STORE=true`
// selects an UNENCRYPTED in-memory store (no passphrase, data lives and dies
// with the tab; the app paints a red DEV banner). `BuildConfig` ignores the
// flag in a production build (`OPENPLATE_BUILD=selfhost`, W8), so the
// unprotected path cannot reach a released bundle by accident.
//
// AD-3 invariant: the controller's open database is the single source of
// truth for plate logs AND coach notes (`WasmCoachNoteStore`).

import '../config/build_config.dart';
import 'create_encrypted_store.dart';
import 'in_memory_encrypted_store.dart';
import 'indexeddb_sqlite3mc_backend.dart';
import 'wasm_coach_note_store.dart';
import 'wasm_encrypted_store.dart';
import 'web_crypto_kdf.dart';
import 'web_local_storage.dart';
import 'web_locks.dart';
import 'web_store_controller.dart';

/// Process-wide controller: it must survive `appRestartProvider` restarts
/// (the restart re-runs `createStores`, which re-initialises it from
/// storage) so a locked store stays locked and the key never lives in two
/// places.
final WebStoreController _controller = WebStoreController(
  storage: const WebLocalStorage(),
  backend: IndexedDbSqlite3mcBackend(),
  kdf: const WebCryptoPbkdf2Kdf(),
  lock: const WebLocksStoreLock(),
  normalizePassphrase: webNormalizeNfc,
);

/// Singleton dev stores so successive calls share the same in-memory list.
final InMemoryEncryptedStore _devStore = InMemoryEncryptedStore();
final InMemoryCoachNoteStore _devCoachNotes = InMemoryCoachNoteStore();

Future<StoreBundle> createStores({StoreOpenOverrides? overrides}) async {
  if (const BuildConfig().devInMemoryStore) {
    // No controller: the gate goes straight to the Day Board.
    return StoreBundle(
      encryptedStore: _devStore,
      coachNoteStore: _devCoachNotes,
    );
  }
  await _controller.initialize();
  return StoreBundle(
    encryptedStore: WasmEncryptedStore(source: _controller),
    coachNoteStore: WasmCoachNoteStore(source: _controller),
    webStoreController: _controller,
    closeDatabase: _controller.prepareForErase,
    eraseStoreData: _controller.eraseStore,
  );
}
