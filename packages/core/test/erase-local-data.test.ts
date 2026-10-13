import { describe, expect, it } from 'vitest';
import {
  createEraseLocalData,
  ERASE_STEPS,
  ERASE_SUCCESS,
  eraseLocalDataFailure,
  eraseResultEquals,
  storeFailure,
  storeFailureCategory,
  type EraseLocalDataResult,
  type LocalDataEraser,
} from '../src/index';

function eraser(behaviour: () => Promise<EraseLocalDataResult>) {
  let calls = 0;
  const e: LocalDataEraser & { readonly calls: () => number } = {
    eraseAll: () => {
      calls++;
      return behaviour();
    },
    calls: () => calls,
  };
  return e;
}

describe('EraseLocalData', () => {
  it('delegates to the port and returns its success', async () => {
    const e = eraser(() => Promise.resolve(ERASE_SUCCESS));
    expect((await createEraseLocalData(e)()).kind).toBe('eraseLocalDataSuccess');
    expect(e.calls()).toBe(1);
  });

  it('passes a typed failure through untouched', async () => {
    const e = eraser(() => Promise.resolve(eraseLocalDataFailure(['secureStorage'])));
    const result = await createEraseLocalData(e)();
    expect(result).toEqual({ kind: 'eraseLocalDataFailure', failedSteps: ['secureStorage'] });
  });

  it('an adapter that throws is collapsed to a failure naming every step as unconfirmed', async () => {
    const e = eraser(() => Promise.reject(new Error('boom')));
    const result = await createEraseLocalData(e)();
    expect(result.kind).toBe('eraseLocalDataFailure');
    expect(result.kind === 'eraseLocalDataFailure' && result.failedSteps).toEqual([...ERASE_STEPS]);
  });

  it('an adapter that throws synchronously is collapsed too', async () => {
    const e: LocalDataEraser = {
      eraseAll: () => {
        throw new Error('sync');
      },
    };
    expect((await createEraseLocalData(e)()).kind).toBe('eraseLocalDataFailure');
  });

  it('failure equality ignores step order', () => {
    expect(
      eraseResultEquals(
        eraseLocalDataFailure(['closeStore', 'exportFiles']),
        eraseLocalDataFailure(['exportFiles', 'closeStore']),
      ),
    ).toBe(true);
    expect(
      eraseResultEquals(
        eraseLocalDataFailure(['closeStore']),
        eraseLocalDataFailure(['exportFiles']),
      ),
    ).toBe(false);
    expect(eraseResultEquals(ERASE_SUCCESS, eraseLocalDataFailure([]))).toBe(false);
    expect(eraseResultEquals(ERASE_SUCCESS, ERASE_SUCCESS)).toBe(true);
  });

  it('failedSteps is an immutable copy', () => {
    const steps: ('closeStore' | 'exportFiles')[] = ['closeStore'];
    const r = eraseLocalDataFailure(steps);
    steps.push('exportFiles');
    expect(r.kind === 'eraseLocalDataFailure' && r.failedSteps).toEqual(['closeStore']);
  });
});

describe('EncryptedStoreFailure variants', () => {
  it('keyLost / storeOperation are distinct typed failures', () => {
    const lost = storeFailure('keyLost');
    const op = storeFailure('storeOperation');
    expect(storeFailureCategory(lost)).toBe('encryptedStore');
    expect(storeFailureCategory(op)).toBe('encryptedStore');
    expect(lost).not.toEqual(op);
    expect(storeFailure('keyLost')).toEqual(storeFailure('keyLost'));
  });
});
