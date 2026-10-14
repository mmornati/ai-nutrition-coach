// Web implementation of the `LocalDataEraser` port. "Erase all local data" returns the browser to
// a first-run state:
//   1. closeStore      close the store (drops the handle, terminates the worker);
//   2. databaseFiles   delete the persisted store: the OPFS pool directory (database pages and
//                      journals), the IndexedDB header copy and the localStorage header, in that
//                      order (data before header, so a half-finished erase never leaves a
//                      database that looks recoverable);
//   3. secureStorage   sweep any other `ai_nutrition_coach.*` localStorage leftovers (but never the
//                      header while the database could not be deleted);
//   4. exportFiles     nothing to do: exports are browser downloads the app never keeps (and
//                      Erase cannot delete a file already downloaded or shared).
// This is also the recovery path for a forgotten passphrase and for "store can't be found". The
// steps are independent and best-effort; the result names every failed step.

import {
  ERASE_SUCCESS,
  eraseLocalDataFailure,
  type EraseStep,
  type LocalDataEraser,
  type EraseLocalDataResult,
} from '@anc/core';
import { STORE_META_KEY } from './constants';
import type { MetaStorage } from './meta-storage';
import type { StoreController } from './store-controller';

export class WebLocalDataEraser implements LocalDataEraser {
  constructor(
    private readonly controller: StoreController,
    private readonly storage: MetaStorage,
  ) {}

  async eraseAll(): Promise<EraseLocalDataResult> {
    const failed: EraseStep[] = [];
    try {
      await this.controller.prepareForErase();
    } catch {
      failed.push('closeStore');
    }
    try {
      await this.controller.eraseStore();
    } catch {
      failed.push('databaseFiles');
    }
    try {
      // If the database could not be deleted, the header is what keeps it recoverable (and what
      // another tab may be relying on): the sweep leaves it in place.
      const keep = failed.includes('databaseFiles') ? STORE_META_KEY : null;
      for (const key of this.storage.ownedKeys()) if (key !== keep) this.storage.remove(key);
    } catch {
      failed.push('secureStorage');
    }
    // Back to a first run (or, after a failure, to whatever is still in storage).
    try {
      await this.controller.initialize();
    } catch {
      // The status stays as it was; the result below still names what failed.
    }
    return failed.length === 0 ? ERASE_SUCCESS : eraseLocalDataFailure(failed);
  }
}
