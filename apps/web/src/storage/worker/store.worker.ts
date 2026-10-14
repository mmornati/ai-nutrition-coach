/// <reference lib="webworker" />
// The store worker (a dedicated module worker). Loads the pinned sqlite3mc wasm build from its
// versioned URL, installs the `opfs-sahpool` VFS (exclusive synchronous OPFS access: no COOP/COEP
// needed, and its exclusivity matches the one-tab Web Locks rule), and serves the store
// operations. It is terminated on lock, which releases the OPFS handles and frees the wasm heap.

import { OPFS_POOL_DIRECTORY, OPFS_VFS_NAME } from '../constants';
import { deriveKeyWithWebCrypto } from '../kdf';
import { StoreEngine, type Sqlite3Module } from './engine';
import { createWorkerHost } from './host';
import type { WorkerRequest, WorkerResponse } from './protocol';

interface Sqlite3WithPool extends Sqlite3Module {
  installOpfsSAHPoolVfs(options: {
    name: string;
    directory: string;
    clearOnInit: boolean;
    initialCapacity: number;
  }): Promise<unknown>;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

const host = createWorkerHost(
  () =>
    new StoreEngine({
      async loadSqlite3(engineUrl) {
        // A runtime URL, deliberately not bundled: it is the pinned file the fetch script wrote.
        const module = (await import(/* @vite-ignore */ `${engineUrl}sqlite3.mjs`)) as {
          default: () => Promise<Sqlite3Module>;
        };
        return module.default();
      },
      async installBaseVfs(sqlite3) {
        await (sqlite3 as Sqlite3WithPool).installOpfsSAHPoolVfs({
          name: OPFS_VFS_NAME,
          directory: OPFS_POOL_DIRECTORY,
          clearOnInit: false,
          initialCapacity: 6,
        });
        return OPFS_VFS_NAME;
      },
      deriveKey: deriveKeyWithWebCrypto,
    }),
  (response: WorkerResponse) => scope.postMessage(response),
);

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void host.handle(event.data);
};
