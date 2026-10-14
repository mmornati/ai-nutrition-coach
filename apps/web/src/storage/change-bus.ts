/** Which part of the data changed; watchers re-read when their topic fires. */
export type ChangeTopic = 'plates' | 'notes' | 'dismissals';

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
