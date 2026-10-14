// The main-thread side of the store worker: the RPC session, the backend built on it (copies,
// termination, erase order) and the OPFS pool directory the eraser removes.
import { describe, expect, it, vi } from 'vitest';
import { STORE_OP_NAMES } from './ops';
import { OPFS_POOL_DIRECTORY } from './constants';
import { SessionClosedError, StoreUnavailableError } from './errors';
import { InMemoryHeaderCopy } from './header-copy';
import {
  OpfsPoolDirectory,
  WorkerSession,
  WorkerStoreBackend,
  type DirectoryHandleLike,
  type EntryHandleLike,
  type WorkerPort,
} from './worker/client';
import type { WorkerRequest, WorkerResponse } from './worker/protocol';

class FakePort implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null;
  onerror: WorkerPort['onerror'] = null;
  onmessageerror: WorkerPort['onmessageerror'] = null;
  sent: { message: WorkerRequest; transfer: Transferable[] | undefined }[] = [];
  terminated = false;
  auto: ((req: WorkerRequest) => WorkerResponse | null) | null = (r) => ({ id: r.id, ok: true });
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void {
    this.sent.push({ message, transfer });
    const reply = this.auto?.(message);
    if (reply) queueMicrotask(() => this.onmessage?.({ data: reply }));
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe('WorkerSession', () => {
  it('correlates responses by id, in any order', async () => {
    const port = new FakePort();
    port.auto = null;
    const session = new WorkerSession(() => port);
    const a = session.request((id) => ({ id, type: 'close' }));
    const b = session.request((id) => ({ id, type: 'close' }));
    port.onmessage?.({ data: { id: 2, ok: true, result: 'second' } });
    port.onmessage?.({ data: { id: 1, ok: true, result: 'first' } });
    expect(await a).toBe('first');
    expect(await b).toBe('second');
  });

  it('rehydrates a wire error into a typed error with no text', async () => {
    const port = new FakePort();
    port.auto = (r) => ({ id: r.id, ok: false, error: { kind: 'open', reason: 'keyRejected' } });
    const session = new WorkerSession(() => port);
    await expect(session.request((id) => ({ id, type: 'close' }))).rejects.toMatchObject({
      name: 'StoreOpenError',
      reason: 'keyRejected',
    });
  });

  it('a worker that fails to load is "unavailable", not a wrong passphrase', async () => {
    const port = new FakePort();
    port.auto = null;
    const session = new WorkerSession(() => port);
    const pending = session.request((id) => ({ id, type: 'close' }));
    port.onerror?.(new Event('error'));
    await expect(pending).rejects.toBeInstanceOf(StoreUnavailableError);
    await expect(pending).rejects.toMatchObject({ reason: 'engineMissing' });
  });

  it('a worker error kills the session: terminated, later requests are session-closed, the owner is told', async () => {
    const port = new FakePort();
    port.auto = null;
    const session = new WorkerSession(() => port);
    const lost = vi.fn();
    session.onLost = lost;
    port.onerror?.(new Event('error'));
    port.onerror?.(new Event('error')); // only once
    expect(session.isDead).toBe(true);
    expect(port.terminated).toBe(true);
    expect(lost).toHaveBeenCalledTimes(1);
    await expect(session.request((id) => ({ id, type: 'close' }))).rejects.toBeInstanceOf(
      SessionClosedError,
    );
  });

  it('a deliberate terminate does not report a lost worker', () => {
    const port = new FakePort();
    const session = new WorkerSession(() => port);
    const lost = vi.fn();
    session.onLost = lost;
    session.terminate();
    expect(lost).not.toHaveBeenCalled();
  });

  it('terminate stops the worker, rejects what is pending and refuses new requests', async () => {
    const port = new FakePort();
    port.auto = null;
    const session = new WorkerSession(() => port);
    const pending = session.request((id) => ({ id, type: 'close' }));
    session.terminate();
    session.terminate(); // idempotent
    expect(port.terminated).toBe(true);
    await expect(pending).rejects.toBeInstanceOf(SessionClosedError);
    await expect(session.request((id) => ({ id, type: 'close' }))).rejects.toBeInstanceOf(
      SessionClosedError,
    );
  });

  it('ignores a response nobody is waiting for', () => {
    const port = new FakePort();
    new WorkerSession(() => port);
    expect(() => port.onmessage?.({ data: { id: 99, ok: true } })).not.toThrow();
  });
});

describe('WorkerStoreBackend', () => {
  const pool = (over: Partial<{ exists: boolean; failRemove: boolean }> = {}) => {
    const calls: string[] = [];
    return {
      calls,
      exists: () => Promise.resolve(over.exists ?? false),
      remove: () => {
        calls.push('pool.remove');
        return over.failRemove ? Promise.reject(new Error('busy')) : Promise.resolve();
      },
    };
  };
  const request = () => ({
    passphrase: Uint8Array.from([1, 2, 3]),
    salt: Uint8Array.from({ length: 16 }, (_, i) => i),
    kdf: { name: 'pbkdf2-hmac-sha256', iterations: 600_000 },
    expectExisting: true,
  });

  it('gives the worker its OWN copy of the passphrase (transferred); the caller keeps and wipes its own', async () => {
    const port = new FakePort();
    const backend = new WorkerStoreBackend({
      workerFactory: () => port,
      headerCopy: new InMemoryHeaderCopy(),
      pool: pool(),
      engineUrl: 'https://app.test/sqlite3mc/2.5.1/',
    });
    const req = request();
    await backend.open(req);
    const open = port.sent[0];
    expect(open?.message).toMatchObject({
      type: 'open',
      engineUrl: 'https://app.test/sqlite3mc/2.5.1/',
    });
    expect(open?.transfer).toHaveLength(1);
    expect([...req.passphrase]).toEqual([1, 2, 3]); // not detached
    expect(open?.message.type === 'open' && open.message.passphrase).not.toBe(req.passphrase);
  });

  it('a failed open terminates the worker (nothing is left running)', async () => {
    const port = new FakePort();
    port.auto = (r) => ({ id: r.id, ok: false, error: { kind: 'open', reason: 'keyRejected' } });
    const backend = new WorkerStoreBackend({
      workerFactory: () => port,
      headerCopy: new InMemoryHeaderCopy(),
      pool: pool(),
      engineUrl: 'x/',
    });
    await expect(backend.open(request())).rejects.toMatchObject({ reason: 'keyRejected' });
    expect(port.terminated).toBe(true);
  });

  it('every store operation is forwarded with its name and arguments; close terminates the worker', async () => {
    const port = new FakePort();
    port.auto = (r) => ({
      id: r.id,
      ok: true,
      result: r.type === 'call' ? `${r.op}:${JSON.stringify(r.args)}` : undefined,
    });
    const backend = new WorkerStoreBackend({
      workerFactory: () => port,
      headerCopy: new InMemoryHeaderCopy(),
      pool: pool(),
      engineUrl: 'x/',
    });
    const db = await backend.open(request());
    expect(await db.kvGet('a.b')).toBe('kvGet:["a.b"]');
    expect(await db.insertDismissal('k', 'iso')).toBe('insertDismissal:["k","iso"]');
    expect(Object.keys(db).sort()).toEqual([...STORE_OP_NAMES, 'close'].sort());
    await db.close();
    expect(port.terminated).toBe(true);
    expect(port.sent.at(-1)?.message.type).toBe('close');
  });

  it('terminates a worker that never answers the polite close', async () => {
    const port = new FakePort();
    const backend = new WorkerStoreBackend({
      workerFactory: () => port,
      headerCopy: new InMemoryHeaderCopy(),
      pool: pool(),
      engineUrl: 'x/',
      closeTimeoutMs: 20,
    });
    const db = await backend.open(request());
    port.auto = null;
    await db.close();
    expect(port.terminated).toBe(true);
  });

  it('erase: closes the worker, removes the pool, THEN the header copy; a failed removal keeps the header', async () => {
    const copy = new InMemoryHeaderCopy();
    copy.value = '{"header":1}';
    const port = new FakePort();
    const ok = pool();
    const backend = new WorkerStoreBackend({
      workerFactory: () => port,
      headerCopy: copy,
      pool: ok,
      engineUrl: 'x/',
    });
    await backend.open(request());
    await backend.erase();
    expect(port.terminated).toBe(true);
    expect(ok.calls).toEqual(['pool.remove']);
    expect(copy.value).toBeNull();

    copy.value = '{"header":1}';
    const failing = new WorkerStoreBackend({
      workerFactory: () => new FakePort(),
      headerCopy: copy,
      pool: pool({ failRemove: true }),
      engineUrl: 'x/',
    });
    await expect(failing.erase()).rejects.toThrow('busy');
    expect(copy.value).toBe('{"header":1}');
  });

  it('exists/readHeaderCopy/writeHeaderCopy delegate to the seams', async () => {
    const copy = new InMemoryHeaderCopy();
    const backend = new WorkerStoreBackend({
      workerFactory: () => new FakePort(),
      headerCopy: copy,
      pool: pool({ exists: true }),
      engineUrl: 'x/',
    });
    expect(await backend.exists()).toBe(true);
    await backend.writeHeaderCopy('h');
    expect(await backend.readHeaderCopy()).toBe('h');
  });
});

// ── the OPFS pool directory ───────────────────────────────────────────────────────────────────

type Tree = { [name: string]: Tree | number };

function fakeDirectory(
  tree: Tree,
  hooks: {
    removeError?: () => unknown;
    getDirectoryError?: () => unknown;
    getFileError?: () => unknown;
  } = {},
): DirectoryHandleLike {
  const make = (node: Tree): DirectoryHandleLike => ({
    getDirectoryHandle: async (name) => {
      const refusal = hooks.getDirectoryError?.();
      if (refusal !== undefined) throw refusal;
      const child = node[name];
      if (child === undefined || typeof child === 'number') {
        throw new DOMException('not found', 'NotFoundError');
      }
      return make(child);
    },
    removeEntry: async (name) => {
      const error = hooks.removeError?.();
      if (error) throw error;
      if (node[name] === undefined) throw new DOMException('not found', 'NotFoundError');
      delete node[name];
    },
    entries: async function* () {
      for (const [name, child] of Object.entries(node)) {
        const handle: EntryHandleLike =
          typeof child === 'number'
            ? {
                kind: 'file',
                getFile: () => {
                  const refusal = hooks.getFileError?.();
                  return refusal === undefined
                    ? Promise.resolve({ size: child })
                    : Promise.reject(refusal);
                },
              }
            : { kind: 'directory', entries: () => make(child).entries() };
        yield [name, handle] as [string, EntryHandleLike];
      }
    },
  });
  return make(tree);
}

describe('OpfsPoolDirectory', () => {
  const sleep = () => Promise.resolve();

  it('a failure to inspect is a typed, retryable "unavailable", never "no store" and never a raw throw', async () => {
    const tree: Tree = { [OPFS_POOL_DIRECTORY]: { x: 9000 } };
    const transient = fakeDirectory(tree, {
      getDirectoryError: () => new DOMException('unknown transient reason', 'UnknownError'),
    });
    await expect(
      new OpfsPoolDirectory(() => Promise.resolve(transient), { sleep }).exists(),
    ).rejects.toMatchObject({ name: 'StoreUnavailableError', reason: 'transient' });

    // Another tab's worker holds the files: getFile fails with an InvalidState/NoModification error.
    const busy = fakeDirectory(tree, {
      getFileError: () => new DOMException('held', 'NoModificationAllowedError'),
    });
    await expect(
      new OpfsPoolDirectory(() => Promise.resolve(busy), { sleep }).exists(),
    ).rejects.toMatchObject({ name: 'StoreUnavailableError', reason: 'inUse' });
  });

  it('there is no store when the pool directory does not exist', async () => {
    const dir = new OpfsPoolDirectory(() => Promise.resolve(fakeDirectory({})), { sleep });
    expect(await dir.exists()).toBe(false);
  });

  it('a pool that was initialised but never got a schema (slot files only) is a first run, not an orphan', async () => {
    const tree: Tree = { [OPFS_POOL_DIRECTORY]: { '.opaque': { a: 4096, b: 4096, c: 4096 } } };
    expect(
      await new OpfsPoolDirectory(() => Promise.resolve(fakeDirectory(tree)), { sleep }).exists(),
    ).toBe(false);
  });

  it('a pool holding database bytes exists', async () => {
    const tree: Tree = { [OPFS_POOL_DIRECTORY]: { '.opaque': { a: 4096, db: 20_480 } } };
    expect(
      await new OpfsPoolDirectory(() => Promise.resolve(fakeDirectory(tree)), { sleep }).exists(),
    ).toBe(true);
  });

  it('removes exactly the pool directory and nothing else', async () => {
    const tree: Tree = { [OPFS_POOL_DIRECTORY]: { '.opaque': { a: 9000 } }, other: { keep: 1 } };
    await new OpfsPoolDirectory(() => Promise.resolve(fakeDirectory(tree)), { sleep }).remove();
    expect(Object.keys(tree)).toEqual(['other']);
  });

  it('removing something already gone succeeds', async () => {
    await new OpfsPoolDirectory(() => Promise.resolve(fakeDirectory({})), { sleep }).remove();
  });

  it('retries while a just-terminated worker is still releasing its handles', async () => {
    let failures = 3;
    const tree: Tree = { [OPFS_POOL_DIRECTORY]: { x: 9000 } };
    const dir = fakeDirectory(tree, {
      removeError: () =>
        failures-- > 0 ? new DOMException('locked', 'NoModificationAllowedError') : undefined,
    });
    const slept = vi.fn(sleep);
    await new OpfsPoolDirectory(() => Promise.resolve(dir), { sleep: slept, retries: 10 }).remove();
    expect(slept).toHaveBeenCalledTimes(3);
    expect(tree).toEqual({});
  });

  it('fails closed when another tab keeps the handles (never claims a delete that did not happen)', async () => {
    const tree: Tree = { [OPFS_POOL_DIRECTORY]: { x: 9000 } };
    const dir = fakeDirectory(tree, {
      removeError: () => new DOMException('locked', 'NoModificationAllowedError'),
    });
    await expect(
      new OpfsPoolDirectory(() => Promise.resolve(dir), { sleep, retries: 3 }).remove(),
    ).rejects.toMatchObject({ name: 'NoModificationAllowedError' });
    expect(Object.keys(tree)).toEqual([OPFS_POOL_DIRECTORY]);
  });

  it('any other error is not retried', async () => {
    const dir = fakeDirectory({}, { removeError: () => new DOMException('x', 'SecurityError') });
    const slept = vi.fn(sleep);
    await expect(
      new OpfsPoolDirectory(() => Promise.resolve(dir), { sleep: slept }).remove(),
    ).rejects.toMatchObject({
      name: 'SecurityError',
    });
    expect(slept).not.toHaveBeenCalled();
  });
});
