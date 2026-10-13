import type { LocalDataEraser } from '../ports/local-data-eraser';
import { ERASE_STEPS, eraseLocalDataFailure, type EraseLocalDataResult } from '../results/erase';

export type EraseLocalData = () => Promise<EraseLocalDataResult>;

/** Never throws: an adapter that throws is a failure naming every step as unconfirmed. */
export function createEraseLocalData(eraser: LocalDataEraser): EraseLocalData {
  return async () => {
    try {
      return await eraser.eraseAll();
    } catch {
      return eraseLocalDataFailure(ERASE_STEPS);
    }
  };
}
