// Test support (Node only): load the pinned sqlite3mc wasm build from `public/sqlite3mc/<version>/`
// (written by scripts/fetch_web_sqlite3mc.sh, which `pnpm test` runs first) and run it on its
// in-memory file system. The real SQL, the real cipher pragmas and the real page encryption are
// exercised; only OPFS is browser-only (that is covered by the Playwright e2e).

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SQLITE3MC_VERSION } from '../engine-pin';
import { deriveKeyWithWebCrypto } from '../kdf';
import { StoreEngine, type Sqlite3Module } from '../worker/engine';
import { createWorkerHost } from '../worker/host';
import type { WorkerRequest, WorkerResponse } from '../worker/protocol';
import type { WorkerPort } from '../worker/client';
import type { PoolDirectory } from '../worker/client';
import { attachKeyAndVerify } from '../attach-key';
import { passphraseBytes } from '../passphrase';
import { wrapOo1, type Oo1Db, type SqlHandle } from '../sql-handle';

export const ENGINE_DIR = fileURLToPath(
  new URL(`../../../public/sqlite3mc/${SQLITE3MC_VERSION}/`, import.meta.url),
);

/** The unwrapped in-memory VFS that sqlite3mc's wrapper sits on. */
export const MEMFS_BASE_VFS = 'unix-none';

/** Extra surface the tests use beyond what the engine needs. */
export interface TestSqlite3 extends Sqlite3Module {
  readonly oo1: Sqlite3Module['oo1'] & {
    readonly DB: new (o: {
      filename: string;
      flags: string;
      vfs?: string;
    }) => Oo1Db & { readonly pointer: number };
  };
  readonly capi: Sqlite3Module['capi'] & { sqlite3_vfs_find(name: string): number };
  readonly wasm: {
    scopedAllocPush(): unknown;
    scopedAllocPop(scope: unknown): void;
    scopedAllocCString(text: string): number;
    readonly exports: { sqlite3__wasm_vfs_unlink(pVfs: number, name: number): number };
  };
}

let loaded: Promise<TestSqlite3> | undefined;

export function loadNodeSqlite3(): Promise<TestSqlite3> {
  loaded ??= (async () => {
    const wasm = readFileSync(`${ENGINE_DIR}sqlite3.wasm`);
    const mod = (await import(
      /* @vite-ignore */ pathToFileURL(`${ENGINE_DIR}sqlite3.mjs`).href
    )) as {
      default: (options: unknown) => Promise<TestSqlite3>;
    };
    // The module probes OPFS at start-up and warns when it is absent (Node); silence that.
    const quiet = { warn() {}, log() {}, error() {} };
    (globalThis as Record<string, unknown>)['sqlite3ApiConfig'] = quiet;
    return mod.default({
      instantiateWasm: (
        imports: WebAssembly.Imports,
        onSuccess: (i: WebAssembly.Instance, m: WebAssembly.Module) => void,
      ) => {
        void WebAssembly.instantiate(wasm, imports).then((r) => onSuccess(r.instance, r.module));
        return {};
      },
      print() {},
      printErr() {},
    });
  })();
  return loaded;
}

/** A fresh engine over the in-memory file system. `filename` is where its database lives. */
export function createTestEngine(options: {
  filename: string;
  minIterations?: number;
  deriveKey?: typeof deriveKeyWithWebCrypto;
}): StoreEngine {
  return new StoreEngine({
    loadSqlite3: () => loadNodeSqlite3(),
    installBaseVfs: () => Promise.resolve(MEMFS_BASE_VFS),
    deriveKey: options.deriveKey ?? deriveKeyWithWebCrypto,
    minIterations: options.minIterations ?? 1000,
    filename: options.filename,
  });
}

/** Does the in-memory file exist? (A plain, unkeyed read-only open never creates it.) */
export async function memfsFileExists(filename: string): Promise<boolean> {
  const sqlite3 = await loadNodeSqlite3();
  try {
    new sqlite3.oo1.DB({ filename, flags: 'w', vfs: MEMFS_BASE_VFS }).close();
    return true;
  } catch {
    return false;
  }
}

export async function memfsDelete(filename: string): Promise<void> {
  const { wasm, capi } = await loadNodeSqlite3();
  const scope = wasm.scopedAllocPush();
  try {
    const name = wasm.scopedAllocCString(filename);
    wasm.exports.sqlite3__wasm_vfs_unlink(capi.sqlite3_vfs_find(MEMFS_BASE_VFS), name);
  } finally {
    wasm.scopedAllocPop(scope);
  }
}

/**
 * What a plain (unkeyed) reader gets from the file: the SQLite result code when it is NOT a
 * readable database (an encrypted file is not), or `null` when it reads as plain SQLite.
 */
export async function plainReadFailureCode(filename: string): Promise<number | null> {
  const sqlite3 = await loadNodeSqlite3();
  const db = new sqlite3.oo1.DB({ filename, flags: 'w', vfs: MEMFS_BASE_VFS });
  try {
    db.selectValue('SELECT count(*) FROM sqlite_master');
    return null;
  } catch (error) {
    return (error as { resultCode?: number }).resultCode ?? -1;
  } finally {
    db.close();
  }
}

/** A worker port that runs the production dispatcher in-process (structured-clone semantics). */
export function inProcessWorkerFactory(engineFactory: () => StoreEngine): () => WorkerPort {
  return () => {
    let terminated = false;
    const port: WorkerPort = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage(message: WorkerRequest) {
        const copy = structuredClone(message);
        queueMicrotask(() => {
          if (terminated) return;
          void host.handle(copy);
        });
      },
      terminate() {
        terminated = true;
        engine.close();
      },
    };
    const engine = engineFactory();
    const host = createWorkerHost(
      () => engine,
      (response: WorkerResponse) => {
        if (!terminated) port.onmessage?.({ data: structuredClone(response) });
      },
    );
    return port;
  };
}

/** The pool seam over the in-memory file system. */
export function memfsPool(
  filename: string,
): PoolDirectory & { removeCalls: number; failRemove: boolean } {
  return {
    removeCalls: 0,
    failRemove: false,
    exists: () => memfsFileExists(filename),
    async remove() {
      this.removeCalls++;
      if (this.failRemove) throw new Error('remove refused');
      await memfsDelete(filename);
    },
  };
}

/** The derived key for a passphrase and salt, at a test-sized cost (same code path as production). */
export async function testKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  return deriveKeyWithWebCrypto(passphraseBytes(passphrase), salt, {
    name: 'pbkdf2-hmac-sha256',
    iterations: 1000,
  });
}

/**
 * A second, already-keyed connection to the same in-memory file, for tests that need raw SQL
 * (planting corrupt rows, a blocking trigger, a newer `user_version`). Close it before the engine
 * under test opens the file again.
 */
export async function openRawKeyed(
  filename: string,
  key: Uint8Array,
  create = false,
): Promise<SqlHandle> {
  const sqlite3 = await loadNodeSqlite3();
  sqlite3.capi.sqlite3mc_vfs_create(MEMFS_BASE_VFS, 0);
  const handle = wrapOo1(
    new sqlite3.oo1.DB({
      filename,
      flags: create ? 'c' : 'w',
      vfs: `multipleciphers-${MEMFS_BASE_VFS}`,
    }),
  );
  attachKeyAndVerify(handle, key);
  return handle;
}

/** Open an UNKEYED, plaintext database on the in-memory file system (what an unencrypted store would be). */
export async function createPlaintextDb(filename: string, sql: string): Promise<void> {
  const sqlite3 = await loadNodeSqlite3();
  const db = new sqlite3.oo1.DB({ filename, flags: 'c', vfs: MEMFS_BASE_VFS });
  try {
    db.exec({ sql });
  } finally {
    db.close();
  }
}
