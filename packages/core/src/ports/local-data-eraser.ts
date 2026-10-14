import type { EraseLocalDataResult } from '../results/erase';

export interface LocalDataEraser {
  eraseAll(): Promise<EraseLocalDataResult>;
}
