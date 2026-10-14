import { describe, expect, it } from 'vitest';
import { storeFailure, storeFailureCategory, type StoreFailureReason } from '../src/index';

describe('StoreFailure', () => {
  it('web WebSessionKey failure is an encrypted-store failure', () => {
    expect(storeFailureCategory(storeFailure('webSessionKey'))).toBe('encryptedStore');
  });

  it('mobile SecureKey failure is still an encrypted-store failure', () => {
    expect(storeFailureCategory(storeFailure('secureKey'))).toBe('encryptedStore');
  });

  // The Dart "exactly one field set" asserts are enforced by the type now: a failure carries
  // exactly one `reason`. These pin the three categories instead.
  it.each<[StoreFailureReason, string]>([
    ['unsupportedPlatform', 'platform'],
    ['emptyPlate', 'validation'],
    ['invalidQuantity', 'validation'],
    ['secureKey', 'encryptedStore'],
    ['webSessionKey', 'encryptedStore'],
    ['keyLost', 'encryptedStore'],
    ['storeOperation', 'encryptedStore'],
  ])('%s belongs to the %s category', (reason, category) => {
    expect(storeFailureCategory(storeFailure(reason))).toBe(category);
  });

  it('equality follows the discriminated reason', () => {
    expect(storeFailure('webSessionKey')).toEqual(storeFailure('webSessionKey'));
    expect(storeFailure('webSessionKey')).not.toEqual(storeFailure('secureKey'));
  });
});
