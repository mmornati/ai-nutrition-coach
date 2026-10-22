// Wiring: one controller and the ports built on it. `assembleStoreBundle` takes the injectable
// parts (so tests and the dev store reuse it); `createBrowserStoreBundle` is the production
// wiring (sqlite3mc worker on OPFS, Web Locks, localStorage + IndexedDB header).

import type {
  CoachNoteStore,
  EncryptedStore,
  LocalDataEraser,
  SavedStore,
  VaultStore,
} from '@anc/core';
import { attachAutoLock } from './auto-lock';
import type { StoreBackend } from './backend';
import { ChangeBus } from './change-bus';
import { STORE_WORKER_NAME } from './constants';
import { engineBasePath } from './engine-pin';
import { IndexedDbHeaderCopy } from './header-copy';
import { DatabaseKeyValueStore, type KeyValueStore } from './key-value-store';
import { WebLocalDataEraser } from './local-data-eraser';
import { WebLocksStoreLock, type StoreLock } from './locks';
import { browserMetaStorage, type MetaStorage } from './meta-storage';
import { StoreController, type StoreControllerDeps } from './store-controller';
import { WebCoachNoteStore } from './web-coach-note-store';
import { WebEncryptedStore } from './web-encrypted-store';
import { WebSavedStore } from './web-saved-store';
import { WebVaultStore } from './web-vault-store';
import { OpfsPoolDirectory, WorkerStoreBackend, type WorkerPort } from './worker/client';

export interface StoreBundle {
  readonly controller: StoreController;
  readonly store: EncryptedStore;
  readonly notes: CoachNoteStore;
  /** Saved meals and home recipes (schema v3). */
  readonly saved: SavedStore;
  /** The whole store as a vault snapshot, and applying one (schema v4; no UI uses it yet). */
  readonly vault: VaultStore;
  readonly kv: KeyValueStore;
  readonly eraser: LocalDataEraser;
  /** Stop listening to the page (auto-lock) and release the controller. */
  dispose(): void;
}

export interface AssembleOptions extends Omit<StoreControllerDeps, 'storage' | 'backend' | 'lock'> {
  readonly storage: MetaStorage;
  readonly backend: StoreBackend;
  readonly lock: StoreLock;
  /** Attach the page listeners that auto-lock the store (default: true in a browser). */
  readonly autoLock?: boolean;
}

export function assembleStoreBundle(options: AssembleOptions): StoreBundle {
  const { storage, backend, lock, autoLock, ...rest } = options;
  const controller = new StoreController({ storage, backend, lock, ...rest });
  const bus = new ChangeBus();
  const detach =
    autoLock === false || typeof window === 'undefined' ? null : attachAutoLock(controller);
  return {
    controller,
    store: new WebEncryptedStore(controller, bus, rest.clock ? { now: rest.clock } : {}),
    notes: new WebCoachNoteStore(controller, bus, rest.clock ? { now: rest.clock } : {}),
    saved: new WebSavedStore(controller, rest.clock ? { now: rest.clock } : {}),
    vault: new WebVaultStore(controller, bus),
    kv: new DatabaseKeyValueStore(controller),
    eraser: new WebLocalDataEraser(controller, storage),
    dispose() {
      detach?.();
      controller.dispose();
    },
  };
}

/** The production store: encrypted sqlite3mc in a dedicated worker on the OPFS `opfs-sahpool` VFS. */
export function createBrowserStoreBundle(overrides: Partial<AssembleOptions> = {}): StoreBundle {
  const engineUrl = new URL(engineBasePath(import.meta.env.BASE_URL), globalThis.location.href)
    .href;
  const backend = new WorkerStoreBackend({
    // The `new Worker(new URL(...))` form is what lets the bundler emit the worker chunk.
    workerFactory: () =>
      new Worker(new URL('./worker/store.worker.ts', import.meta.url), {
        type: 'module',
        name: STORE_WORKER_NAME,
      }) as unknown as WorkerPort,
    headerCopy: new IndexedDbHeaderCopy(),
    pool: new OpfsPoolDirectory(),
    engineUrl,
  });
  return assembleStoreBundle({
    storage: browserMetaStorage(),
    backend,
    lock: new WebLocksStoreLock(),
    ...overrides,
  });
}
