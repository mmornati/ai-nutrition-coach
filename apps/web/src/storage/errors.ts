// Typed store errors. None of them carries cause text: SQLite messages can embed SQL, file paths
// or (for the keying statement) key material, so `message` is always a fixed string and the
// underlying exception is deliberately NOT chained.

import { storeFailure, type StoreFailure } from '@anc/core';

export type StoreOpenReason =
  /** The linked SQLite has no multiple-ciphers support. Opening would write plaintext: refused. */
  | 'missingCipher'
  /** The key is malformed (wrong length). */
  | 'invalidKey'
  /** The key was applied but the database could not be read with it (wrong key, plaintext file). */
  | 'keyRejected'
  /** The header says a database exists but the storage holds none. */
  | 'dataMissing';

export class StoreOpenError extends Error {
  readonly reason: StoreOpenReason;
  constructor(reason: StoreOpenReason) {
    super(`StoreOpenError(${reason})`);
    this.name = 'StoreOpenError';
    this.reason = reason;
  }
}

/** The data on disk was written by a NEWER schema than this build knows (never run old code over it). */
export class SchemaTooNewError extends Error {
  readonly found: number;
  readonly supported: number;
  constructor(found: number, supported: number) {
    super(`SchemaTooNewError(found: ${found}, supported: ${supported})`);
    this.name = 'SchemaTooNewError';
    this.found = found;
    this.supported = supported;
  }
}

export type UnavailableReason =
  /** `crypto.subtle` is undefined: plain HTTP. The UI explains HTTPS, never "wrong passphrase". */
  | 'insecureContext'
  /** No OPFS synchronous access (very old browser, or private mode). */
  | 'noOpfs'
  /** The wasm engine could not be loaded (asset missing, blocked). */
  | 'engineMissing'
  /** Anything else the browser storage refused (blocked IndexedDB, quota, ...). */
  | 'storage'
  /** localStorage or IndexedDB refused a READ (blocked cookies, a locked-down profile). */
  | 'storageRefused'
  /** The browser failed for a reason that may pass (WebKit "unknown transient reason"). */
  | 'transient'
  /** Another tab's worker holds the store's files right now. */
  | 'inUse';

export class StoreUnavailableError extends Error {
  readonly reason: UnavailableReason;
  constructor(reason: UnavailableReason) {
    super(`StoreUnavailableError(${reason})`);
    this.name = 'StoreUnavailableError';
    this.reason = reason;
  }
}

/** A SQLite failure reduced to its numeric result code. */
export class SqliteCodeError extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`SqliteCodeError(${code})`);
    this.name = 'SqliteCodeError';
    this.code = code;
  }
}

/** A write while the store is locked. A lock must never look like "value gone". */
export class KeyValueStoreLocked extends Error {
  constructor() {
    super('KeyValueStoreLocked()');
    this.name = 'KeyValueStoreLocked';
  }
}

/**
 * The worker session is gone (locked, closed, or the worker died). Operations on it answer the
 * same typed `webSessionKey` failure as a locked store, never a generic `storeOperation`.
 */
export class SessionClosedError extends Error {
  constructor() {
    super('SessionClosedError()');
    this.name = 'SessionClosedError';
  }
}

/** Any other storage-layer failure. */
export class StoreOperationError extends Error {
  constructor() {
    super('StoreOperationError()');
    this.name = 'StoreOperationError';
  }
}

export const SQLITE_AUTH = 23;
export const SQLITE_NOTADB = 26;

/** Failure as it crosses the worker boundary (structured-cloneable, no cause text). */
export type WireError =
  | { readonly kind: 'open'; readonly reason: StoreOpenReason }
  | { readonly kind: 'schemaTooNew'; readonly found: number; readonly supported: number }
  | { readonly kind: 'unavailable'; readonly reason: UnavailableReason }
  | { readonly kind: 'sqlite'; readonly code: number }
  | { readonly kind: 'other' };

function resultCodeOf(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'resultCode' in error) {
    const code = (error as { resultCode: unknown }).resultCode;
    if (typeof code === 'number') return code & 0xff; // primary code of an extended one
  }
  return null;
}

export function toWireError(error: unknown): WireError {
  if (error instanceof StoreOpenError) return { kind: 'open', reason: error.reason };
  if (error instanceof SchemaTooNewError) {
    return { kind: 'schemaTooNew', found: error.found, supported: error.supported };
  }
  if (error instanceof StoreUnavailableError) return { kind: 'unavailable', reason: error.reason };
  if (error instanceof SqliteCodeError) return { kind: 'sqlite', code: error.code };
  const code = resultCodeOf(error);
  if (code !== null) return { kind: 'sqlite', code };
  return { kind: 'other' };
}

export function fromWireError(wire: WireError): Error {
  switch (wire.kind) {
    case 'open':
      return new StoreOpenError(wire.reason);
    case 'schemaTooNew':
      return new SchemaTooNewError(wire.found, wire.supported);
    case 'unavailable':
      return new StoreUnavailableError(wire.reason);
    case 'sqlite':
      return new SqliteCodeError(wire.code);
    case 'other':
      return new StoreOperationError();
  }
}

/** A bug in OUR code must surface, not be relabelled as a store failure. */
export function isProgrammingError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    error instanceof RangeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError
  );
}

/**
 * Maps any error caught at a store boundary to a typed `StoreFailure` with no cause text.
 * A key or cipher problem is distinct from a generic storage error.
 */
export function mapStoreError(error: unknown): StoreFailure {
  if (error instanceof SessionClosedError) return LOCKED_FAILURE;
  if (error instanceof StoreOpenError) return storeFailure('secureKey');
  if (error instanceof SqliteCodeError) {
    return error.code === SQLITE_NOTADB || error.code === SQLITE_AUTH
      ? storeFailure('secureKey')
      : storeFailure('storeOperation');
  }
  return storeFailure('storeOperation');
}

/** The failure a locked store answers every write with. */
export const LOCKED_FAILURE: StoreFailure = storeFailure('webSessionKey');

export type OpenFailure =
  /** The passphrase-derived key does not decrypt the store. */
  | { readonly kind: 'wrongKey' }
  /** The header promises data the storage no longer holds. */
  | { readonly kind: 'dataMissing' }
  /** The storage or cipher is unusable in this browser or build. */
  | { readonly kind: 'unavailable'; readonly reason: UnavailableReason }
  /** Written by a newer schema: reload to get the newer build (never counted as a wrong passphrase). */
  | { readonly kind: 'newerVersion' };

export function classifyOpenError(error: unknown): OpenFailure {
  if (error instanceof SchemaTooNewError) return { kind: 'newerVersion' };
  if (error instanceof StoreOpenError) {
    switch (error.reason) {
      case 'keyRejected':
        return { kind: 'wrongKey' };
      case 'dataMissing':
        return { kind: 'dataMissing' };
      case 'missingCipher':
      case 'invalidKey':
        return { kind: 'unavailable', reason: 'engineMissing' };
    }
  }
  if (error instanceof SqliteCodeError && error.code === SQLITE_NOTADB) {
    return { kind: 'wrongKey' };
  }
  if (error instanceof StoreUnavailableError) {
    return { kind: 'unavailable', reason: error.reason };
  }
  return { kind: 'unavailable', reason: 'storage' };
}
