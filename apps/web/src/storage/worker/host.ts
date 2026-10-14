// Request dispatcher of the store worker. Pure: it takes a `post` function, so the exact
// production dispatch runs in unit tests against an in-process client.

import { toWireError } from '../errors';
import type { StoreEngine } from './engine';
import type { WorkerRequest, WorkerResponse } from './protocol';

export interface WorkerHost {
  /** Handle one request; responses are posted in request order. */
  handle(request: WorkerRequest): Promise<void>;
}

export function createWorkerHost(
  makeEngine: () => StoreEngine,
  post: (response: WorkerResponse) => void,
): WorkerHost {
  const engine = makeEngine();
  let queue: Promise<void> = Promise.resolve();

  const run = async (request: WorkerRequest): Promise<void> => {
    try {
      switch (request.type) {
        case 'open':
          await engine.open({
            engineUrl: request.engineUrl,
            passphrase: request.passphrase,
            salt: request.salt,
            kdf: request.kdf,
            expectExisting: request.expectExisting,
          });
          post({ id: request.id, ok: true });
          return;
        case 'call':
          post({ id: request.id, ok: true, result: engine.call(request.op, request.args) });
          return;
        case 'close':
          engine.close();
          post({ id: request.id, ok: true });
          return;
      }
    } catch (error) {
      post({ id: request.id, ok: false, error: toWireError(error) });
    }
  };

  return {
    handle(request) {
      // One request at a time, in order: an `open` finishes before the first query runs.
      queue = queue.then(() => run(request));
      return queue;
    },
  };
}
