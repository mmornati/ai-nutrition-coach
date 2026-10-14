/**
 * Tiny in-memory LRU cache (NFR5, offline replay). Port of the earlier client.
 *
 * Used by `OfflineFirstFoodCatalog` to remember the ranked list of the last N queries (and the
 * last N barcodes) so a previously-seen lookup resolves without re-running. Every `get` and `put`
 * promotes the key to the most-recently-used position; the only eviction path is `put`
 * overflowing the capacity. A `Map` iterates in insertion order, so `keys().next()` is the
 * least-recently-used entry.
 *
 * Process-local and in-memory only: it does not survive a restart, and it never touches storage.
 */
export class LruCache<K, V> {
  private readonly store = new Map<K, V>();

  constructor(readonly capacity: number) {
    if (!(capacity > 0)) throw new RangeError('capacity must be > 0');
  }

  /** The cached value for `key`, promoted to most recently used; `undefined` on a miss. */
  get(key: K): V | undefined {
    if (!this.store.has(key)) return undefined;
    const value = this.store.get(key) as V;
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  /** Store `value` for `key` as most recently used; evicts the oldest entry on overflow. */
  put(key: K, value: V): void {
    this.store.delete(key);
    this.store.set(key, value);
    if (this.store.size > this.capacity) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  /** Keys oldest -> newest (tests assert eviction order). */
  keys(): K[] {
    return Array.from(this.store.keys());
  }
}
