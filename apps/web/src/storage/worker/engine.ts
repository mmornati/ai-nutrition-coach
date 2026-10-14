// The store engine: runs INSIDE the worker (and, in unit tests, in Node on an in-memory file
// system). Derives the key, opens the sqlite3mc database through a cipher-wrapped VFS, attaches
// and verifies the key, brings the schema up to date and then serves the store operations.
//
// The key exists only here, only for the duration of `open`: it is zeroed as soon as the keying
// statement has run, and terminating the worker (what locking does) frees the wasm heap.

import { DATABASE_FILENAME } from '../constants';
import { attachKeyAndVerify } from '../attach-key';
import { SQLITE_NOTADB, StoreOpenError, StoreUnavailableError } from '../errors';
import {
  KDF_MAX_ITERATIONS,
  KDF_MIN_ITERATIONS,
  KDF_PBKDF2_SHA256,
  SESSION_KEY_BYTES,
  type DeriveKey,
  type KdfParams,
} from '../kdf';
import { STORE_OP_NAMES, type StoreDbOps, type StoreOpName } from '../ops';
import { ensureSchema } from '../schema';
import { SqliteStoreDb } from '../sqlite-store-db';
import { wipe } from '../bytes';
import { wrapOo1, type Oo1Db, type SqlHandle } from '../sql-handle';

/** The slice of the sqlite3 wasm module the store uses. */
export interface Sqlite3Module {
  readonly oo1: {
    readonly DB: new (options: { filename: string; flags: string; vfs?: string }) => Oo1Db;
  };
  readonly capi: {
    /** Registers `multipleciphers-<base>`, a VFS that enables the cipher pragmas over `base`. */
    sqlite3mc_vfs_create(baseVfsName: string, makeDefault: number): number;
  };
}

export interface EngineDeps {
  loadSqlite3(engineUrl: string): Promise<Sqlite3Module>;
  /**
   * Register the persistent VFS and return its name (production: the `opfs-sahpool` VFS; unit
   * tests: the module's built-in in-memory file system VFS).
   */
  installBaseVfs(sqlite3: Sqlite3Module): Promise<string>;
  deriveKey: DeriveKey;
  /** Floor for the iteration count; defaults to the production 600,000. */
  minIterations?: number;
  filename?: string;
}

export interface EngineOpenRequest {
  readonly engineUrl: string;
  readonly passphrase: Uint8Array;
  readonly salt: Uint8Array;
  readonly kdf: KdfParams;
  readonly expectExisting: boolean;
}

const SQLITE_CANTOPEN = 14;

function resultCode(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'resultCode' in error) {
    const code = (error as { resultCode: unknown }).resultCode;
    if (typeof code === 'number') return code & 0xff;
  }
  return null;
}

export class StoreEngine {
  private sqlite3: Sqlite3Module | null = null;
  private wrappedVfs: string | null = null;
  private handle: SqlHandle | null = null;
  private ops: StoreDbOps | null = null;

  constructor(private readonly deps: EngineDeps) {}

  get isOpen(): boolean {
    return this.ops !== null;
  }

  async open(request: EngineOpenRequest): Promise<void> {
    const passphrase = request.passphrase;
    let key: Uint8Array | null = null;
    try {
      if (this.ops) throw new StoreOpenError('invalidKey');
      const floor = this.deps.minIterations ?? KDF_MIN_ITERATIONS;
      if (
        request.kdf.name !== KDF_PBKDF2_SHA256 ||
        request.kdf.iterations < floor ||
        request.kdf.iterations > KDF_MAX_ITERATIONS
      ) {
        // A downgraded (or absurdly expensive) parameter set is refused here too, not only when the header is parsed.
        throw new StoreOpenError('invalidKey');
      }
      const sqlite3 = await this.loadEngine(request.engineUrl);
      const vfs = await this.registerVfs(sqlite3);
      key = await this.deps.deriveKey(passphrase, request.salt, request.kdf);
      if (key.length !== SESSION_KEY_BYTES) throw new StoreOpenError('invalidKey');
      this.handle = this.openHandle(sqlite3, vfs, request.expectExisting);
      try {
        attachKeyAndVerify(this.handle, key);
        ensureSchema(this.handle, request.expectExisting);
      } catch (error) {
        this.closeHandle();
        throw error;
      }
      this.ops = new SqliteStoreDb(this.handle);
    } finally {
      // The key is zeroed as soon as the keying statement has run (or failed); the passphrase
      // bytes are ours (a copy) and are wiped too.
      wipe(key);
      wipe(passphrase);
    }
  }

  call(op: StoreOpName, args: readonly unknown[]): unknown {
    if (!this.ops || !STORE_OP_NAMES.includes(op)) throw new StoreUnavailableError('storage');
    const fn = this.ops[op] as (...a: unknown[]) => unknown;
    return fn.apply(this.ops, [...args]);
  }

  close(): void {
    this.ops = null;
    this.closeHandle();
  }

  private async loadEngine(engineUrl: string): Promise<Sqlite3Module> {
    if (this.sqlite3) return this.sqlite3;
    try {
      this.sqlite3 = await this.deps.loadSqlite3(engineUrl);
    } catch {
      throw new StoreUnavailableError('engineMissing');
    }
    return this.sqlite3;
  }

  /** Install the persistent VFS once, then wrap it so the cipher pragmas work. */
  private async registerVfs(sqlite3: Sqlite3Module): Promise<string> {
    if (this.wrappedVfs === null) {
      let base: string;
      try {
        base = await this.deps.installBaseVfs(sqlite3);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        throw new StoreUnavailableError(
          /OPFS|access handle|getDirectory/i.test(message) ? 'noOpfs' : 'storage',
        );
      }
      const rc = sqlite3.capi.sqlite3mc_vfs_create(base, 0);
      if (rc !== 0) throw new StoreOpenError('missingCipher');
      this.wrappedVfs = `multipleciphers-${base}`;
    }
    return this.wrappedVfs;
  }

  private openHandle(sqlite3: Sqlite3Module, vfs: string, expectExisting: boolean): SqlHandle {
    // 'w' never creates: a returning user whose file is gone must not get a fresh empty store.
    const flags = expectExisting ? 'w' : 'c';
    try {
      const db = new sqlite3.oo1.DB({
        filename: this.deps.filename ?? DATABASE_FILENAME,
        flags,
        vfs,
      });
      return wrapOo1(db);
    } catch (error) {
      const code = resultCode(error);
      if (expectExisting && code === SQLITE_CANTOPEN) throw new StoreOpenError('dataMissing');
      if (code === SQLITE_NOTADB) throw new StoreOpenError('keyRejected');
      throw new StoreUnavailableError('storage');
    }
  }

  private closeHandle(): void {
    const handle = this.handle;
    this.handle = null;
    try {
      handle?.close();
    } catch {
      // The handle is dropped either way.
    }
  }
}
