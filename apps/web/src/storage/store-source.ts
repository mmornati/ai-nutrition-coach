import type { StoreDb } from './ops';

/** Where the data stores read the open database from. */
export interface StoreSource {
  /** The open database, or `null` while locked. */
  database(): StoreDb | null;
  /** Lock the store (drop the database, discard the key). */
  lock(): Promise<void>;
}
