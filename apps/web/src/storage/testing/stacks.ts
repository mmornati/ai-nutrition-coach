// Test support (Node only): complete store stacks for the contract suite and the controller tests.
//
//   realStack    the PRODUCTION path end to end except the browser: the worker client, the worker
//                dispatcher, the engine, real sqlite3mc encryption (PBKDF2 at a test-sized cost) on
//                an in-memory file system, the in-memory header copy and Web Lock stand-ins.
//   memoryStack  the unencrypted in-memory reference.
//
// "Reloading the page" is building a new controller over the same storage, header copy and file.

import type { StoreBackend } from '../backend';
import { InMemoryHeaderCopy } from '../header-copy';
import { InMemoryStoreLock } from '../locks';
import { MemoryBackend } from '../memory-backend';
import { InMemoryMetaStorage } from '../meta-storage';
import { assembleStoreBundle, type StoreBundle } from '../store-bundle';
import type { StoreControllerDeps } from '../store-controller';
import { WorkerStoreBackend } from '../worker/client';
import { createTestEngine, inProcessWorkerFactory, memfsPool } from './node-sqlite';
import type { ContractSubject } from './store-contract';

export const GOOD_PASSPHRASE = 'correct horse battery staple';
export const WRONG_PASSPHRASE = 'wrong passphrase 12';
export const FAST_KDF = { name: 'pbkdf2-hmac-sha256', iterations: 1000 } as const;

let counter = 0;

export interface RealStack {
  readonly filename: string;
  readonly storage: InMemoryMetaStorage;
  readonly headerCopy: InMemoryHeaderCopy;
  readonly lock: InMemoryStoreLock;
  readonly pool: ReturnType<typeof memfsPool>;
  /** Wrap the backend (to spy or inject failures). */
  backendWrapper: (backend: StoreBackend) => StoreBackend;
  makeBackend(): StoreBackend;
  bundle(overrides?: Partial<StoreControllerDeps>): StoreBundle;
}

export function realStack(): RealStack {
  const filename = `/anc-test-${counter++}.db`;
  const storage = new InMemoryMetaStorage();
  const headerCopy = new InMemoryHeaderCopy();
  const lock = new InMemoryStoreLock();
  const pool = memfsPool(filename);
  const stack: RealStack = {
    filename,
    storage,
    headerCopy,
    lock,
    pool,
    backendWrapper: (b) => b,
    makeBackend() {
      return stack.backendWrapper(
        new WorkerStoreBackend({
          workerFactory: inProcessWorkerFactory(() => createTestEngine({ filename })),
          headerCopy,
          pool,
          engineUrl: 'test:',
          closeTimeoutMs: 100,
        }),
      );
    },
    bundle(overrides = {}) {
      return assembleStoreBundle({
        storage,
        backend: stack.makeBackend(),
        lock,
        kdfParams: FAST_KDF,
        minIterations: 1000,
        isSecureContext: () => true,
        requestDurable: () => Promise.resolve('persisted'),
        autoLock: false,
        ...overrides,
      });
    },
  };
  return stack;
}

async function subjectFrom(bundle: StoreBundle): Promise<ContractSubject> {
  await bundle.controller.initialize();
  const outcome = await bundle.controller.createStore(GOOD_PASSPHRASE);
  if (outcome.kind !== 'unlocked')
    throw new Error(`could not create the test store: ${outcome.kind}`);
  return {
    store: bundle.store,
    notes: bundle.notes,
    kv: bundle.kv,
    lock: () => bundle.controller.lock(),
    dispose: async () => {
      await bundle.controller.lock();
      bundle.dispose();
    },
  };
}

/** A real encrypted store (sqlite3mc, in-process worker protocol, in-memory file system). */
export function createRealSubject(): Promise<ContractSubject> {
  return subjectFrom(realStack().bundle());
}

/** The unencrypted in-memory reference behind the same controller and facades. */
export function createMemorySubject(): Promise<ContractSubject> {
  return subjectFrom(
    assembleStoreBundle({
      storage: new InMemoryMetaStorage(),
      backend: new MemoryBackend(),
      lock: new InMemoryStoreLock(),
      isSecureContext: () => true,
      requestDurable: () => Promise.resolve('persisted'),
      autoLock: false,
    }),
  );
}
