// The v1 sync outbox lives in memory and belongs to ONE unlocked session: ops describe plates the
// person just recorded, and nothing may outlive the lock or an erase (a locked app must not keep
// references to decrypted data, and an erased device must not keep an outbox for data that is
// gone). This ties the queue to the store's lifecycle.

/** The slice of the `StoreController` this needs (so a test can drive it with a fake). */
export interface SessionSource {
  subscribe(listener: () => void): () => void;
  getSnapshot(): { readonly status: string };
}

/**
 * Clears `queue` on every unlocked -> not-unlocked transition (lock, idle, hidden, a dead worker)
 * and whenever an erase begins. Returns the unsubscribe function.
 */
export function scopeSyncQueueToSession(
  source: SessionSource,
  queue: { clear(): void },
): () => void {
  let wasUnlocked = source.getSnapshot().status === 'unlocked';
  return source.subscribe(() => {
    const status = source.getSnapshot().status;
    if ((wasUnlocked && status !== 'unlocked') || status === 'erasing') queue.clear();
    wasUnlocked = status === 'unlocked';
  });
}
