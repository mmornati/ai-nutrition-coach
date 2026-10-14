import type { KdfParams } from './kdf';
import type { StoreDb } from './ops';

export interface OpenRequest {
  /** NFC + UTF-8 bytes. The backend works on its own copy; the caller wipes this buffer. */
  readonly passphrase: Uint8Array;
  readonly salt: Uint8Array;
  readonly kdf: KdfParams;
  /**
   * True for a returning user: the database MUST already hold a schema, otherwise the open is
   * refused (`dataMissing`) instead of minting an empty store.
   */
  readonly expectExisting: boolean;
}

/**
 * Hides WHERE the keyed database lives. Production is sqlite3mc in a dedicated worker on OPFS
 * (worker/client.ts); the dev store and the unit tests plug in memory or an in-process engine.
 */
export interface StoreBackend {
  /** Whether persisted database bytes exist. Rejects when the storage cannot be inspected. */
  exists(): Promise<boolean>;
  /** The header copy kept next to the data, or `null`. */
  readHeaderCopy(): Promise<string | null>;
  /** Persist a header copy next to the data. */
  writeHeaderCopy(header: string): Promise<void>;
  /**
   * Derive the key, open the database keyed with it (creating it when absent) and return the
   * handle. Throws `StoreOpenError` for a rejected key, a missing cipher or missing data,
   * `SchemaTooNewError` for newer data, `StoreUnavailableError` when the browser cannot run the
   * store. On any failure nothing is left open.
   */
  open(request: OpenRequest): Promise<StoreDb>;
  /** Delete every persisted byte: database pages, journals and the header copy. */
  erase(): Promise<void>;
  /**
   * Optional: registers the one listener told when the open session dies on its own (the worker
   * crashed). The controller locks when it fires.
   */
  onSessionLost?(listener: () => void): void;
}
