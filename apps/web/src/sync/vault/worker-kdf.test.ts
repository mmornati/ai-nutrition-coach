// The browser KDF around a scripted worker: what it sends, that the password buffer is handed over,
// and that the worker is always terminated, whatever happens. (The worker itself runs in the e2e.)
import { describe, expect, it, vi } from 'vitest';
import { createWorkerKdf, type Argon2WorkerPort } from './worker-kdf';
import type { Argon2Request, Argon2Response } from './worker-protocol';

class FakeWorker implements Argon2WorkerPort {
  onmessage: ((event: MessageEvent<Argon2Response>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminate = vi.fn();
  sent: { message: Argon2Request; transfer: Transferable[] }[] = [];
  constructor(private readonly respond: (self: FakeWorker) => void) {}
  postMessage(message: Argon2Request, transfer: Transferable[]): void {
    this.sent.push({ message, transfer });
    queueMicrotask(() => this.respond(this));
  }
  answer(response: Argon2Response): void {
    this.onmessage?.({ data: response } as MessageEvent<Argon2Response>);
  }
}

const request = () => ({
  passphrase: new TextEncoder().encode('a long enough passphrase'),
  salt: new Uint8Array(16).fill(5),
  memoryKib: 65_536,
  passes: 3,
  parallelism: 1,
});

describe('createWorkerKdf', () => {
  it('sends the cost (and no script URL: the worker knows its own), transfers the password and returns the key', async () => {
    const key = new Uint8Array(32).fill(9);
    const worker = new FakeWorker((w) => w.answer({ ok: true, key }));
    const kdf = createWorkerKdf({ workerFactory: () => worker });
    const input = request();
    const password = input.passphrase;
    const out = await kdf(input);
    expect(out).toBe(key);
    const { message, transfer } = worker.sent[0]!;
    expect(message).toMatchObject({
      memoryKib: 65_536,
      passes: 3,
      parallelism: 1,
      keyBytes: 32,
    });
    expect(message.password).toBe(password);
    expect(transfer).toEqual([password.buffer]);
    expect(Array.from(message.salt)).toEqual(Array.from(input.salt));
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('does not use a salt that aliases the caller’s buffer', async () => {
    const worker = new FakeWorker((w) => w.answer({ ok: true, key: new Uint8Array(32) }));
    const kdf = createWorkerKdf({ workerFactory: () => worker });
    const input = request();
    await kdf(input);
    expect(worker.sent[0]!.message.salt).not.toBe(input.salt);
  });

  it.each([
    ['the worker says it failed', (w: FakeWorker) => w.answer({ ok: false })],
    [
      'the worker answers a key of the wrong length',
      (w: FakeWorker) => w.answer({ ok: true, key: new Uint8Array(16) }),
    ],
    [
      'the worker errors (file missing, no wasm)',
      (w: FakeWorker) => w.onerror?.(new Event('error')),
    ],
    [
      'a message cannot be read',
      (w: FakeWorker) => w.onmessageerror?.(new MessageEvent('messageerror')),
    ],
  ])('rejects, and terminates the worker, when %s', async (_name, respond) => {
    const worker = new FakeWorker(respond);
    const kdf = createWorkerKdf({ workerFactory: () => worker });
    await expect(kdf(request())).rejects.toThrow('could not run');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.onmessage).toBeNull();
  });

  it('rejects when no worker can be made, or the message cannot be posted', async () => {
    const none = createWorkerKdf({
      workerFactory: () => {
        throw new Error('no workers here');
      },
    });
    await expect(none(request())).rejects.toThrow('no workers here');
    const worker = new FakeWorker(() => undefined);
    worker.postMessage = () => {
      throw new Error('DataCloneError');
    };
    const bad = createWorkerKdf({ workerFactory: () => worker });
    await expect(bad(request())).rejects.toThrow('DataCloneError');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('uses a fresh worker for every derivation', async () => {
    const made: FakeWorker[] = [];
    const kdf = createWorkerKdf({
      workerFactory: () => {
        const w = new FakeWorker((self) => self.answer({ ok: true, key: new Uint8Array(32) }));
        made.push(w);
        return w;
      },
    });
    await kdf(request());
    await kdf(request());
    expect(made).toHaveLength(2);
    expect(made.every((w) => w.terminate.mock.calls.length === 1)).toBe(true);
  });
});
