// The ONE place the sqlite3mc key is attached. Synchronous, so a thrown error can never escape as
// an unobserved promise and leave the connection open and UNKEYED.
//
// Sequence (order matters for sqlite3mc):
//   1. `PRAGMA cipher` must report a cipher at all. A plain-SQLite build returns no rows and
//      silently ignores every other cipher pragma, so this is the only way to notice.
//      -> `missingCipher`.
//   2. `PRAGMA cipher = 'chacha20'` pins the cipher explicitly BEFORE keying, so a future change
//      of sqlite3mc's default cannot silently change what is written, and an existing file is read
//      with the cipher it was created with.
//   3. `PRAGMA hexkey = '<64 hex chars>'` supplies the key. When the connection's VFS is not
//      wrapped by sqlite3mc ("Encryption is not supported by the VFS") that is a BUILD problem,
//      reported as `missingCipher`, never as a wrong passphrase.
//   4. Verify: `SELECT count(*) FROM sqlite_master` forces a real page read and decrypt, so a wrong
//      key or an unencrypted file fails here instead of on some later query. (Re-reading
//      `PRAGMA cipher` would prove nothing: it echoes the connection's configured cipher, not what
//      is on disk.)
// Any failure throws `StoreOpenError`, which carries a reason only: never the key, the hex string
// or the SQL (a raw SQLite error message includes the causing statement, which would contain the
// key), so the underlying exception is deliberately NOT chained.
//
// ChaCha20-Poly1305 is sqlite3mc's own default and most exercised cipher, and an AEAD: every page
// carries a Poly1305 tag, so a flipped or swapped page is detected rather than decrypted into
// garbage. User copy says "ChaCha20-Poly1305", never "AES-256".

import { PINNED_CIPHER } from './constants';
import { StoreOpenError } from './errors';
import { SESSION_KEY_BYTES } from './kdf';
import { hexEncode } from './bytes';
import type { SqlHandle } from './sql-handle';

function activeCipher(db: SqlHandle): string | null {
  try {
    const rows = db.all('PRAGMA cipher');
    const first = rows[0];
    if (!first) return null;
    const value = Object.values(first)[0];
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function isUnsupportedVfsError(error: unknown): boolean {
  return error instanceof Error && /not supported by the VFS/i.test(error.message);
}

/** Attach `key` to `db` and verify the result. Throws `StoreOpenError` on any problem. */
export function attachKeyAndVerify(
  db: SqlHandle,
  key: Uint8Array,
  expectedCipher: string = PINNED_CIPHER,
): void {
  if (key.length !== SESSION_KEY_BYTES) throw new StoreOpenError('invalidKey');
  if (activeCipher(db) === null) throw new StoreOpenError('missingCipher');
  try {
    db.run(`PRAGMA cipher = '${expectedCipher}'`);
    db.run(`PRAGMA hexkey = '${hexEncode(key)}'`);
  } catch (error) {
    // Do not chain: the message would include the keying statement.
    throw new StoreOpenError(isUnsupportedVfsError(error) ? 'missingCipher' : 'keyRejected');
  }
  try {
    db.all('SELECT count(*) AS n FROM sqlite_master');
  } catch {
    throw new StoreOpenError('keyRejected');
  }
}
