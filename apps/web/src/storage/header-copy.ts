// A tiny IndexedDB database holding a COPY of the store header. The authoritative header is in
// localStorage; this copy lives beside the encrypted data in the same origin, so "the user cleared
// localStorage but not the rest" is recoverable. The header is not secret.

import { HEADER_DB_NAME } from './constants';

export interface HeaderCopyStore {
  /** The copy, or `null`. Must not create the database just to read it. */
  read(): Promise<string | null>;
  write(header: string): Promise<void>;
  /** Delete the whole database. */
  delete(): Promise<void>;
}

const OBJECT_STORE = 'kv';
const RECORD_KEY = 'header';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('indexeddb request failed'));
  });
}

function openHeaderDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(HEADER_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(OBJECT_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('header database unavailable'));
    req.onblocked = () => reject(new Error('header database blocked'));
  });
}

export class IndexedDbHeaderCopy implements HeaderCopyStore {
  constructor(private readonly factory: IDBFactory = globalThis.indexedDB) {}

  async read(): Promise<string | null> {
    // Do not create the database just to read it. (`databases()` is missing in some browsers;
    // there an empty database is created, which is harmless and removed by `delete`.)
    if (typeof this.factory.databases === 'function') {
      const names = await this.factory.databases();
      if (!names.some((d) => d.name === HEADER_DB_NAME)) return null;
    }
    const db = await openHeaderDb(this.factory);
    try {
      const value = await request(
        db.transaction(OBJECT_STORE, 'readonly').objectStore(OBJECT_STORE).get(RECORD_KEY),
      );
      return typeof value === 'string' ? value : null;
    } finally {
      db.close();
    }
  }

  async write(header: string): Promise<void> {
    const db = await openHeaderDb(this.factory);
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(OBJECT_STORE, 'readwrite');
        tx.objectStore(OBJECT_STORE).put(header, RECORD_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('header write failed'));
        tx.onabort = () => reject(new Error('header write aborted'));
      });
    } finally {
      db.close();
    }
  }

  delete(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = this.factory.deleteDatabase(HEADER_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new Error('header delete failed'));
      req.onblocked = () => reject(new Error('header delete blocked'));
    });
  }
}

export class InMemoryHeaderCopy implements HeaderCopyStore {
  value: string | null = null;
  read(): Promise<string | null> {
    return Promise.resolve(this.value);
  }
  write(header: string): Promise<void> {
    this.value = header;
    return Promise.resolve();
  }
  delete(): Promise<void> {
    this.value = null;
    return Promise.resolve();
  }
}
