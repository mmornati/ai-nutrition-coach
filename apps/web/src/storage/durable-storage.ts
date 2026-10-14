// Ask the browser for durable storage once after create/unlock (`navigator.storage.persist()`),
// and report the answer so the UI can show ONE plain line ("protected from automatic clean-up" or
// "the browser may clear this data..."). Never nag.

export type DurableStorage = 'persisted' | 'notPersisted' | 'unsupported';

interface StorageManagerLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

export async function requestDurableStorage(
  storage: StorageManagerLike | undefined = globalThis.navigator?.storage,
): Promise<DurableStorage> {
  if (!storage?.persist) return 'unsupported';
  try {
    if (storage.persisted && (await storage.persisted())) return 'persisted';
    return (await storage.persist()) ? 'persisted' : 'notPersisted';
  } catch {
    return 'unsupported';
  }
}
