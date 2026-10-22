// DEV / E2E ONLY. The page behind `storage-harness.html`: it wires the REAL encrypted store (the
// sqlite3mc worker on OPFS, Web Locks, the IndexedDB header copy) and exposes it on
// `window.__harness` for Playwright (e2e/storage.spec.ts), together with a look at the raw OPFS
// bytes and the shared contract suite.
//
// It is a build input only when VITE_STORAGE_HARNESS=1 (the e2e server). A release build has no
// such page and no such code: tools/check_no_dev_store_in_build.sh fails `pnpm verify` otherwise.

import { HEADER_DB_NAME, STORAGE_KEY_PREFIX } from '../constants';
import { probeStorageAvailability } from '../storage-probe';
import { createBrowserStoreBundle } from '../store-bundle';
import { storeContractCases, type ContractSubject } from '../testing/store-contract';

export interface OpfsFileReport {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  /** Which of the probe strings appear as raw bytes in the file. */
  readonly hits: readonly string[];
  /** True when the file starts with the plaintext SQLite magic. */
  readonly sqliteHeader: boolean;
}

export interface OpfsReport {
  readonly rootEntries: readonly string[];
  readonly files: readonly OpfsFileReport[];
}

export interface ContractResult {
  readonly name: string;
  readonly ok: boolean;
  /** Not run: the case needs a second store, and this page has only one (named, never silent). */
  readonly skipped?: boolean;
  readonly error?: string;
}

const bundle = createBrowserStoreBundle();

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function includesBytes(haystack: Uint8Array, needle: string): boolean {
  const text = new TextDecoder('latin1').decode(haystack);
  return text.includes(needle);
}

/** Every byte this origin keeps in OPFS. Call while LOCKED: an open store holds exclusive handles. */
async function inspectOpfs(needles: readonly string[]): Promise<OpfsReport> {
  const root = await navigator.storage.getDirectory();
  const files: OpfsFileReport[] = [];
  const rootEntries: string[] = [];
  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    for await (const [name, handle] of dir.entries()) {
      if (prefix === '') rootEntries.push(name);
      if (handle.kind === 'directory') {
        await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`);
      } else {
        const file = await (handle as FileSystemFileHandle).getFile();
        const bytes = new Uint8Array(await file.arrayBuffer());
        files.push({
          path: `${prefix}${name}`,
          size: bytes.length,
          sha256: await sha256Hex(bytes),
          hits: needles.filter((n) => includesBytes(bytes, n)),
          sqliteHeader: includesBytes(bytes.slice(0, 16), 'SQLite format 3'),
        });
      }
    }
  }
  await walk(root, '');
  return { rootEntries, files };
}

async function everythingPersisted(): Promise<{
  opfsRoot: string[];
  indexedDb: string[];
  localStorage: string[];
}> {
  const root = await navigator.storage.getDirectory();
  const opfsRoot: string[] = [];
  for await (const [name] of root.entries()) opfsRoot.push(name);
  const databases = (await indexedDB.databases?.()) ?? [];
  const localStorageKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) localStorageKeys.push(key);
  }
  return {
    opfsRoot,
    indexedDb: databases.map((d) => d.name ?? ''),
    localStorage: localStorageKeys,
  };
}

/**
 * Start from a clean origin. Some browsers (WebKit under Playwright) keep OPFS beyond a throwaway
 * profile, so a test cannot assume it begins empty. Only call this with no store open.
 */
async function wipeBrowserState(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const names: string[] = [];
  for await (const [name] of root.entries()) names.push(name);
  for (const name of names) await root.removeEntry(name, { recursive: true });
  for (const db of (await indexedDB.databases?.()) ?? []) {
    if (db.name) indexedDB.deleteDatabase(db.name);
  }
  localStorage.clear();
}

function draft(name: string) {
  return {
    databaseFood: {
      sourceRef: `manual:${name}`,
      displayName: name,
      source: 'manual' as const,
      foodGroup: 'other' as const,
    },
    quantity: { low: 1, high: 2, unit: 'piece', displayLabel: '~1-2 pieces' },
  };
}

/** The whole contract suite against the real store: a fresh store per case. */
async function runContract(passphrase: string): Promise<ContractResult[]> {
  const results: ContractResult[] = [];
  for (const contractCase of storeContractCases) {
    if (contractCase.needsFresh) {
      results.push({ name: contractCase.name, ok: true, skipped: true });
      continue;
    }
    const { controller, store, notes, saved, vault, kv, eraser } = bundle;
    let outcome: ContractResult;
    try {
      await eraser.eraseAll();
      await controller.initialize();
      const created = await controller.createStore(passphrase);
      if (created.kind !== 'unlocked') throw new Error(`create failed: ${created.kind}`);
      const subject: ContractSubject = {
        store,
        notes,
        saved,
        vault,
        kv,
        lock: () => controller.lock(),
        dispose: () => controller.lock(),
      };
      await contractCase.run(subject);
      outcome = { name: contractCase.name, ok: true };
    } catch (error) {
      outcome = {
        name: contractCase.name,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    results.push(outcome);
  }
  await bundle.controller.lock();
  await bundle.eraser.eraseAll();
  return results;
}

const harness = {
  controller: bundle.controller,
  store: bundle.store,
  notes: bundle.notes,
  saved: bundle.saved,
  kv: bundle.kv,
  eraser: bundle.eraser,
  headerDbName: HEADER_DB_NAME,
  status: () => bundle.controller.getSnapshot().status,
  async recordPlate(name: string): Promise<number> {
    const result = await bundle.store.recordPlate({ entries: [draft(name)] });
    if (result.kind !== 'recordPlateSuccess')
      throw new Error(`record failed: ${JSON.stringify(result)}`);
    return result.plateLog.id;
  },
  async plateNames(): Promise<string[]> {
    const result = await bundle.store.readRange();
    if (result.kind !== 'platesRead')
      throw new Error(`read failed: ${JSON.stringify(result.failure)}`);
    return result.plates.flatMap((p) => p.entries.map((e) => e.databaseFood.displayName));
  },
  inspectOpfs,
  everythingPersisted,
  wipeBrowserState,
  probeStorageAvailability,
  runContract,
};

declare global {
  interface Window {
    __harness: typeof harness;
  }
}
window.__harness = harness;
document.documentElement.dataset['harness'] = 'ready';
