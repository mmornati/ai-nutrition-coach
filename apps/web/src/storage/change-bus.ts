/**
 * Which part of the data changed; watchers re-read when their topic fires. `saved` (saved meals and
 * recipes) and `kv` (settings) are only fired by applying a snapshot, so that whatever reads them
 * can refresh after a restore; their ordinary writers read on demand and need no watcher.
 */
export type ChangeTopic = 'plates' | 'notes' | 'dismissals' | 'saved' | 'kv';

/** A tiny in-process pub/sub that lets `watch*` re-emit after a local write. */
export class ChangeBus {
  private readonly listeners = new Map<ChangeTopic, Set<() => void>>();

  on(topic: ChangeTopic, listener: () => void): () => void {
    let set = this.listeners.get(topic);
    if (!set) {
      set = new Set();
      this.listeners.set(topic, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  emit(...topics: ChangeTopic[]): void {
    for (const topic of topics) {
      for (const listener of [...(this.listeners.get(topic) ?? [])]) listener();
    }
  }
}
