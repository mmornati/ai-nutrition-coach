// "Something was written": the one place every ordinary write to the store passes, seen from outside.
// The relay backup (phase S2) needs to know that the device has changed since the relay last
// acknowledged it, whichever screen made the change (a plate, a note, a saved meal, a setting, a
// delete, a restore), without every writer having to remember to say so. So the open database is
// handed out wrapped: each WRITE operation that succeeds tells the listeners, after it has landed.
//
// What does NOT count: reads, the pruning of expired "open plate" markers (local housekeeping), a
// write to a `kv` key that never leaves the device (the backup's own bookkeeping lives there, so
// counting it would make the backup mark itself dirty forever), and a snapshot the store refused.

import { isSyncedKvKey } from '@anc/core';
import type { StoreDb, StoreOpName } from './ops';

const WRITES: ReadonlySet<StoreOpName> = new Set<StoreOpName>([
  'insertPlate',
  'deletePlate',
  'insertNote',
  'insertDismissal',
  'insertInteraction',
  'deleteNotesForPlate',
  'insertSavedMeal',
  'renameSavedMeal',
  'deleteSavedMeal',
  'insertRecipe',
  'deleteRecipe',
]);

/** `db`, with `onWrite` called after each write that landed. The wrapper forwards everything else untouched. */
export function observeWrites(db: StoreDb, onWrite: () => void): StoreDb {
  const notify = (): void => {
    try {
      onWrite();
    } catch {
      // A listener must never turn a committed write into a failure.
    }
  };
  return new Proxy(db, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== 'function') return value;
      const op = property as StoreOpName;
      const call = (value as (...args: unknown[]) => unknown).bind(target);
      if (WRITES.has(op)) {
        return (...args: unknown[]) => {
          const done = call(...args) as Promise<unknown>;
          return done.then((result) => {
            notify();
            return result;
          });
        };
      }
      if (op === 'kvSet' || op === 'kvDelete') {
        return (...args: unknown[]) => {
          const done = call(...args) as Promise<unknown>;
          const key = args[0];
          return done.then((result) => {
            if (typeof key === 'string' && isSyncedKvKey(key)) notify();
            return result;
          });
        };
      }
      if (op === 'applyVault') {
        return (...args: unknown[]) => {
          const done = call(...args) as Promise<unknown>;
          return done.then((result) => {
            if (result !== 'clockAhead' && result !== 'conflict') notify();
            return result;
          });
        };
      }
      return call;
    },
  });
}
