// The browser `VaultKdf`: one fresh module worker per derivation, terminated as soon as it answers
// (or fails), so the Argon2 heap and the key material do not outlive the call. No timeout is
// imposed: a slow phone is slow, and a derivation that cannot start fails at once (no worker, the
// file missing, an engine without WebAssembly), which is reported as "could not run", never as a
// wrong passphrase.

import { MASTER_KEY_BYTES, type VaultKdf } from './kdf';
import type { Argon2Request, Argon2Response } from './worker-protocol';

/** The part of a Worker this module uses; tests substitute a scripted port. */
export interface Argon2WorkerPort {
  onmessage: ((event: MessageEvent<Argon2Response>) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: Argon2Request, transfer: Transferable[]): void;
  terminate(): void;
}

export interface WorkerKdfOptions {
  readonly workerFactory?: () => Argon2WorkerPort;
}

function defaultWorker(): Argon2WorkerPort {
  // The `new Worker(new URL(...))` form is what lets the bundler emit the worker chunk.
  return new Worker(new URL('./argon2.worker.ts', import.meta.url), {
    type: 'module',
    name: 'anc-argon2',
  }) as unknown as Argon2WorkerPort;
}

export function createWorkerKdf(options: WorkerKdfOptions = {}): VaultKdf {
  const makeWorker = options.workerFactory ?? defaultWorker;
  return (request) =>
    new Promise<Uint8Array>((resolve, reject) => {
      let worker: Argon2WorkerPort;
      try {
        worker = makeWorker();
      } catch (error) {
        reject(error instanceof Error ? error : new Error('worker'));
        return;
      }
      const finish = (settle: () => void): void => {
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        worker.terminate();
        settle();
      };
      worker.onmessage = (event) => {
        const response = event.data;
        finish(() => {
          if (response.ok && response.key.length === MASTER_KEY_BYTES) resolve(response.key);
          else reject(new Error('The key derivation could not run'));
        });
      };
      worker.onerror = () => finish(() => reject(new Error('The key derivation could not run')));
      worker.onmessageerror = worker.onerror;
      const message: Argon2Request = {
        password: request.passphrase,
        salt: new Uint8Array(request.salt),
        memoryKib: request.memoryKib,
        passes: request.passes,
        parallelism: request.parallelism,
        keyBytes: MASTER_KEY_BYTES,
      };
      try {
        // The password buffer is handed over: the page keeps no copy.
        worker.postMessage(message, [request.passphrase.buffer as ArrayBuffer]);
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error('worker')));
      }
    });
}
