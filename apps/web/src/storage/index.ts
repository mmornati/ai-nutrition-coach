// Public surface of the encrypted web store (docs/adr/0005-web-encrypted-store.md).
export { attachAutoLock } from './auto-lock';
export { createBrowserStoreBundle, assembleStoreBundle, type StoreBundle } from './store-bundle';
export {
  StoreController,
  type StoreSnapshot,
  type StoreStatus,
  type UnlockOutcome,
} from './store-controller';
export { KV_KEYS, KeyValueStoreLocked, type KeyValueStore } from './key-value-store';
export { validateNewPassphrase, unlockDelayMs, type PassphraseIssue } from './passphrase';
export { IDLE_MINUTE_CHOICES } from './constants';
export type { DurableStorage } from './durable-storage';
export type { UnavailableReason } from './errors';
export { corruptRowsSkipped } from './corrupt-row-log';
export { probeStorageAvailability, type StorageAvailability } from './storage-probe';
