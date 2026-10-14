// `localStorage` as the store's NON-secret metadata storage: the header and the lock-delay choice,
// never a key or a passphrase.
//
// Reads and writes THROW when the browser refuses storage (blocked cookies, some private modes).
// That is deliberate: a swallowed read error would look like "no store yet" and lead the create
// flow to wipe real data.

import { STORAGE_KEY_PREFIX } from './constants';

export interface MetaStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
  /** Every key this app owns (the eraser sweeps them). */
  ownedKeys(): string[];
}

export function browserMetaStorage(): MetaStorage {
  return {
    read: (key) => window.localStorage.getItem(key),
    write: (key, value) => window.localStorage.setItem(key, value),
    remove: (key) => window.localStorage.removeItem(key),
    ownedKeys: () => {
      const keys: string[] = [];
      const storage = window.localStorage;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key !== null && key.startsWith(STORAGE_KEY_PREFIX)) keys.push(key);
      }
      return keys;
    },
  };
}

/** Map-backed stand-in for tests and the dev store. */
export class InMemoryMetaStorage implements MetaStorage {
  readonly values = new Map<string, string>();
  read(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  write(key: string, value: string): void {
    this.values.set(key, value);
  }
  remove(key: string): void {
    this.values.delete(key);
  }
  ownedKeys(): string[] {
    return [...this.values.keys()].filter((k) => k.startsWith(STORAGE_KEY_PREFIX));
  }
}
