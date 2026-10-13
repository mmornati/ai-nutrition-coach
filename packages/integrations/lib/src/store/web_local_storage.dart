// `window.localStorage` as the web store's NON-secret metadata storage
// (Phase 2B) -- WEB ONLY. Holds the KDF salt/parameters/format version and
// the lock-delay setting; never a key or passphrase.
//
// Reads and writes THROW when the browser refuses storage (blocked cookies,
// some private modes). That is deliberate: a swallowed read error would look
// like "no store yet" and lead the create flow to wipe real data.

import 'package:web/web.dart' as web;

import 'web_store_storage.dart';

final class WebLocalStorage implements WebStoreStorage {
  const WebLocalStorage();

  @override
  String? read(String key) => web.window.localStorage.getItem(key);

  @override
  void write(String key, String value) =>
      web.window.localStorage.setItem(key, value);

  @override
  void remove(String key) => web.window.localStorage.removeItem(key);
}
