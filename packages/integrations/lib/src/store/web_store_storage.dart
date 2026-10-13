// Tiny synchronous key/value seam for the web store's NON-secret metadata
// (Phase 2B): the KDF salt/parameters/format version, and the lock policy.
// Production is `window.localStorage` (`web_local_storage.dart`); tests use
// the in-memory fake below. Nothing secret is ever written through it.

abstract interface class WebStoreStorage {
  String? read(String key);
  void write(String key, String value);
  void remove(String key);
}

/// In-memory [WebStoreStorage]; the "browser storage" of VM tests.
final class InMemoryWebStoreStorage implements WebStoreStorage {
  final Map<String, String> values = {};

  @override
  String? read(String key) => values[key];

  @override
  void write(String key, String value) => values[key] = value;

  @override
  void remove(String key) => values.remove(key);
}
