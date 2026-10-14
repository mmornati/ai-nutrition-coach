// Main-thread side of the store worker: a request/response RPC over `postMessage`, the
// `StoreBackend` built on it, and the OPFS pool directory the eraser removes.
//
// The worker is created on unlock and TERMINATED on lock: that releases the exclusive OPFS access
// handles (so another tab can take over) and frees the wasm heap the key lived in.

import { OPFS_POOL_DIRECTORY } from '../constants';
import {
  fromWireError,
  SessionClosedError,
  StoreOperationError,
  StoreUnavailableError,
} from '../errors';
import type { HeaderCopyStore } from '../header-copy';
import { STORE_OP_NAMES, type StoreDb, type StoreOpName } from '../ops';
import type { OpenRequest, StoreBackend } from '../backend';
import type { WorkerRequest, WorkerResponse } from './protocol';

/** The slice of `Worker` the client uses (so tests can run the engine in-process). */
export interface WorkerPort {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: { data: WorkerResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
}

export type WorkerFactory = () => WorkerPort;

type Pending = { resolve(value: unknown): void; reject(error: Error): void };

/** One live worker and its outstanding requests. */
export class WorkerSession {
  private readonly port: WorkerPort;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private dead = false;
  /**
   * Called once when the worker dies on its own (a load failure, a crash, an unreadable message).
   * Not called for a deliberate `terminate`.
   */
  onLost: (() => void) | null = null;

  constructor(factory: WorkerFactory) {
    this.port = factory();
    this.port.onmessage = (event) => {
      const response = event.data;
      const entry = this.pending.get(response.id);
      if (!entry) return;
      this.pending.delete(response.id);
      if (response.ok) entry.resolve(response.result);
      else entry.reject(fromWireError(response.error));
    };
    // A worker that fails to load (blocked by CSP, script missing) or dies later is an unusable
    // store, never a wrong passphrase. Either way the session is dead for good: later requests
    // answer `SessionClosedError` (the locked failure) and the owner is told to lock.
    const lost = () => this.lose(new StoreUnavailableError('engineMissing'));
    this.port.onerror = lost;
    this.port.onmessageerror = lost;
  }

  request(build: (id: number) => WorkerRequest, transfer: Transferable[] = []): Promise<unknown> {
    if (this.dead) return Promise.reject(new SessionClosedError());
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.port.postMessage(build(id), transfer);
      } catch {
        this.pending.delete(id);
        reject(new StoreOperationError());
      }
    });
  }

  get isDead(): boolean {
    return this.dead;
  }

  terminate(): void {
    if (this.dead) return;
    this.dead = true;
    this.port.onmessage = null;
    this.port.terminate();
    this.failAll(new SessionClosedError());
  }

  private lose(error: Error): void {
    if (this.dead) return;
    this.dead = true;
    this.port.onmessage = null;
    try {
      this.port.terminate();
    } catch {
      // Already gone.
    }
    this.failAll(error);
    this.onLost?.();
  }

  private failAll(error: Error): void {
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
  }
}

/** The async view of the engine's operations over a live session. */
export function remoteStoreDb(session: WorkerSession, onClose: () => Promise<void>): StoreDb {
  const out: Record<string, unknown> = {};
  for (const op of STORE_OP_NAMES) {
    out[op] = (...args: unknown[]) =>
      session.request((id) => ({ id, type: 'call', op: op as StoreOpName, args }));
  }
  out['close'] = onClose;
  return out as unknown as StoreDb;
}

// ── the OPFS pool directory ────────────────────────────────────────────────────────────────────

/** Structural subset of the OPFS directory handle (so tests can fake it). */
export interface DirectoryHandleLike {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterable<[string, EntryHandleLike]>;
}
export interface EntryHandleLike {
  readonly kind: 'file' | 'directory';
  getFile?(): Promise<{ readonly size: number }>;
  entries?(): AsyncIterable<[string, EntryHandleLike]>;
}

/** Where the pool's files live; the eraser deletes the whole directory. */
export interface PoolDirectory {
  /** True when the pool holds database bytes (an initialised but empty pool is "no store"). */
  exists(): Promise<boolean>;
  /** Delete the directory and everything in it. Resolves when it is gone (or never existed). */
  remove(): Promise<void>;
}

const SAH_SLOT_HEADER_BYTES = 4096;
const isNotFound = (e: unknown) => e instanceof DOMException && e.name === 'NotFoundError';
const isStillLocked = (e: unknown) =>
  e instanceof DOMException &&
  (e.name === 'NoModificationAllowedError' || e.name === 'InvalidStateError');

function inspectionFailure(error: unknown): StoreUnavailableError {
  return new StoreUnavailableError(isStillLocked(error) ? 'inUse' : 'transient');
}

export class OpfsPoolDirectory implements PoolDirectory {
  constructor(
    private readonly root: () => Promise<DirectoryHandleLike> = () =>
      navigator.storage.getDirectory() as unknown as Promise<DirectoryHandleLike>,
    private readonly options: {
      name?: string;
      retries?: number;
      retryDelayMs?: number;
      sleep?: (ms: number) => Promise<void>;
    } = {},
  ) {}

  private get name(): string {
    return this.options.name ?? OPFS_POOL_DIRECTORY;
  }

  /**
   * "Database bytes exist" is a file in the pool bigger than its 4 KiB slot header (an unused
   * slot is exactly that header). A pool that was initialised but never got a schema (a tab that
   * died mid-create) is therefore a first run, not an orphan.
   */
  async exists(): Promise<boolean> {
    // A failure to INSPECT is never "no store" and never "lost": it is a typed, retryable
    // `StoreUnavailableError` (another tab's worker holds the files, or the browser failed for a
    // reason that may pass).
    let dir: DirectoryHandleLike;
    try {
      dir = await (await this.root()).getDirectoryHandle(this.name);
    } catch (error) {
      if (isNotFound(error)) return false;
      throw inspectionFailure(error);
    }
    try {
      return await hasDataFile(dir);
    } catch (error) {
      throw inspectionFailure(error);
    }
  }

  async remove(): Promise<void> {
    const retries = this.options.retries ?? 20;
    const delay = this.options.retryDelayMs ?? 150;
    const sleep =
      this.options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const root = await this.root();
    for (let attempt = 0; ; attempt++) {
      try {
        await root.removeEntry(this.name, { recursive: true });
        return;
      } catch (error) {
        if (isNotFound(error)) return;
        // A just-terminated worker releases its sync handles a moment later; another tab keeps
        // them for good (then this fails closed after the retries).
        if (!isStillLocked(error) || attempt >= retries) throw error;
        await sleep(delay);
      }
    }
  }
}

async function hasDataFile(dir: DirectoryHandleLike): Promise<boolean> {
  for await (const [, handle] of dir.entries()) {
    if (handle.kind === 'directory' && handle.entries) {
      if (await hasDataFile(handle as unknown as DirectoryHandleLike)) return true;
    } else if (handle.kind === 'file' && handle.getFile) {
      if ((await handle.getFile()).size > SAH_SLOT_HEADER_BYTES) return true;
    }
  }
  return false;
}

// ── the backend ────────────────────────────────────────────────────────────────────────────────

export interface WorkerBackendOptions {
  readonly workerFactory: WorkerFactory;
  readonly headerCopy: HeaderCopyStore;
  readonly pool: PoolDirectory;
  /** Directory URL (trailing slash) the versioned engine is served from. */
  readonly engineUrl: string;
  /** How long a polite close may take before the worker is terminated anyway. */
  readonly closeTimeoutMs?: number;
}

export class WorkerStoreBackend implements StoreBackend {
  private session: WorkerSession | null = null;
  private lostListener: (() => void) | null = null;

  constructor(private readonly options: WorkerBackendOptions) {}

  onSessionLost(listener: () => void): void {
    this.lostListener = listener;
  }

  exists(): Promise<boolean> {
    return this.options.pool.exists();
  }

  readHeaderCopy(): Promise<string | null> {
    return this.options.headerCopy.read();
  }

  writeHeaderCopy(header: string): Promise<void> {
    return this.options.headerCopy.write(header);
  }

  async open(request: OpenRequest): Promise<StoreDb> {
    await this.closeSession();
    const session = new WorkerSession(this.options.workerFactory);
    // The worker gets its OWN copies (it wipes them); the caller's buffers stay the caller's.
    const passphrase = request.passphrase.slice();
    try {
      await session.request(
        (id) => ({
          id,
          type: 'open',
          engineUrl: this.options.engineUrl,
          passphrase,
          salt: request.salt.slice(),
          kdf: request.kdf,
          expectExisting: request.expectExisting,
        }),
        [passphrase.buffer],
      );
    } catch (error) {
      session.terminate();
      throw error;
    }
    this.session = session;
    session.onLost = () => {
      if (this.session === session) this.session = null;
      this.lostListener?.();
    };
    return remoteStoreDb(session, () => this.closeSession());
  }

  async erase(): Promise<void> {
    await this.closeSession();
    // Data first, then the header copy, so a half-finished erase never leaves a database that
    // looks recoverable.
    await this.options.pool.remove();
    await this.options.headerCopy.delete();
  }

  /** Close the database politely, then terminate the worker (releases OPFS, frees the heap). */
  private async closeSession(): Promise<void> {
    const session = this.session;
    this.session = null;
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        session.request((id) => ({ id, type: 'close' })),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, this.options.closeTimeoutMs ?? 3000);
        }),
      ]);
    } catch {
      // Terminated below either way.
    } finally {
      clearTimeout(timer);
    }
    session.terminate();
  }
}
