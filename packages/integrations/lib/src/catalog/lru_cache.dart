// Tiny in-memory LRU cache (NFR5 — offline replay).
//
// Used by `OfflineFirstFoodCatalog` to remember the ranked list of the
// last N queries so a previously-seen search resolves without re-running
// the seed match. The cache is keyed on the case-folded, trimmed query
// string; eviction is FIFO by access order — every `get` and `put`
// promotes the key to the most-recently-used position.
//
// Implementation note: `LinkedHashMap` preserves insertion order and
// `remove` + `[]=` moves a key to the end. So `_store.keys.first` is
// always the least-recently-used entry. This is the simplest correct
// LRU under the standard library — no third-party dependency.
//
// Capacity is enforced on `put`. Reads past capacity do not shrink the
// cache; the only eviction path is `put` overflowing the bound.
//
// The cache is process-local and in-memory only; it does not survive
// a restart. That matches the "offline replay" scope — the LRU papers
// over a flaky network, not a long-term persistence need.

class LruCache<K, V> {
  LruCache({required this.capacity})
      : assert(capacity > 0, 'capacity must be > 0');

  /// Maximum number of entries. Eviction triggers when [put] would push
  /// the cache above this bound.
  final int capacity;

  /// `LinkedHashMap` — insertion order preserved; `remove`+`[]=` moves
  /// the key to the tail (most-recently-used). Access order is therefore
  /// oldest → newest.
  final _store = <K, V>{};

  /// Returns the cached value for [key] and promotes the key to most
  /// recently used; returns `null` on miss.
  V? get(K key) {
    final value = _store.remove(key);
    if (value == null) return null;
    _store[key] = value;
    return value;
  }

  /// Stores [value] for [key], promoting it to most recently used.
  /// Evicts the oldest entry when the cache would overflow [capacity].
  void put(K key, V value) {
    _store.remove(key);
    _store[key] = value;
    if (_store.length > capacity) {
      _store.remove(_store.keys.first);
    }
  }

  /// Drops every entry. Used by tests to reset state; not on the hot
  /// path.
  void clear() => _store.clear();

  /// Current entry count — exposed for tests and the future
  /// "cache stats" debug surface.
  int get length => _store.length;

  /// Keys in oldest → newest order. Tests use this to assert eviction
  /// order; production code reads only via [get] / [put].
  Iterable<K> get keys => _store.keys;
}
