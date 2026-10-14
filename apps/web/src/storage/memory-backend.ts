// A backend that "opens" a plaintext in-memory database with ANY passphrase. UNENCRYPTED: only the
// dev-only store (create-app-store.ts, behind the dev flag) and the unit tests use it.

import type { StoreBackend } from './backend';
import { MemoryStoreDb } from './memory-store-db';
import { asAsyncDb } from './ops';

/** A backend that "opens" a plaintext in-memory database with ANY passphrase. */
export class MemoryBackend implements StoreBackend {
  private db: MemoryStoreDb | null = null;
  private header: string | null = null;

  exists(): Promise<boolean> {
    return Promise.resolve(this.db !== null);
  }
  readHeaderCopy(): Promise<string | null> {
    return Promise.resolve(this.header);
  }
  writeHeaderCopy(header: string): Promise<void> {
    this.header = header;
    return Promise.resolve();
  }
  open() {
    this.db ??= new MemoryStoreDb();
    return Promise.resolve(asAsyncDb(this.db));
  }
  erase(): Promise<void> {
    this.db = null;
    this.header = null;
    return Promise.resolve();
  }
}
