import type { PlateLog } from '../entities/plate-log';

/**
 * Why a store operation failed. Exactly one reason is always present, by construction.
 * Categories: platform (`unsupportedPlatform`), validation (`emptyPlate`, `invalidQuantity`),
 * encrypted store (`secureKey`, `webSessionKey`, `keyLost`, `storeOperation`).
 */
export type StoreFailureReason =
  | 'unsupportedPlatform'
  | 'emptyPlate'
  | 'invalidQuantity'
  | 'secureKey'
  | 'webSessionKey'
  | 'keyLost'
  | 'storeOperation';

export type StoreFailureCategory = 'platform' | 'validation' | 'encryptedStore';

export interface StoreFailure {
  readonly kind: 'storeFailure';
  readonly reason: StoreFailureReason;
}

export function storeFailure(reason: StoreFailureReason): StoreFailure {
  return { kind: 'storeFailure', reason };
}

export function storeFailureCategory(failure: StoreFailure): StoreFailureCategory {
  switch (failure.reason) {
    case 'unsupportedPlatform':
      return 'platform';
    case 'emptyPlate':
    case 'invalidQuantity':
      return 'validation';
    case 'secureKey':
    case 'webSessionKey':
    case 'keyLost':
    case 'storeOperation':
      return 'encryptedStore';
  }
}

export type PostCommitStep = 'coachNote' | 'syncEnqueue';

export interface PostCommitWarning {
  readonly step: PostCommitStep;
}

export interface RecordPlateSuccess {
  readonly kind: 'recordPlateSuccess';
  readonly plateLog: PlateLog;
  /** Best-effort post-commit steps that did not complete. The plate is committed regardless. */
  readonly warnings: readonly PostCommitWarning[];
}

export function recordPlateSuccess(
  plateLog: PlateLog,
  warnings: readonly PostCommitWarning[] = [],
): RecordPlateSuccess {
  return { kind: 'recordPlateSuccess', plateLog, warnings: Object.freeze([...warnings]) };
}

export type RecordPlateResult = RecordPlateSuccess | StoreFailure;

export type ReadPlatesResult =
  | { readonly kind: 'platesRead'; readonly plates: readonly PlateLog[] }
  | { readonly kind: 'platesReadFailed'; readonly failure: StoreFailure };

export type DeletePlateResult =
  | { readonly kind: 'plateDeleted' }
  | { readonly kind: 'plateDeleteFailed'; readonly failure: StoreFailure };

export const PLATE_DELETED: DeletePlateResult = Object.freeze({ kind: 'plateDeleted' });

export const plateDeleteFailed = (failure: StoreFailure): DeletePlateResult => ({
  kind: 'plateDeleteFailed',
  failure,
});
