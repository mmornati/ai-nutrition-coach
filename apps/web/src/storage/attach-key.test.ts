// Port of the earlier client: the ONE place the key is attached, against a recording
// double so every statement and its order is visible.
import { describe, expect, it } from 'vitest';
import { attachKeyAndVerify } from './attach-key';
import { StoreOpenError } from './errors';
import type { SqlHandle, SqlRow } from './sql-handle';

const KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const KEY_HEX = Array.from(KEY, (b) => b.toString(16).padStart(2, '0')).join('');

class Recorder implements SqlHandle {
  readonly statements: string[] = [];
  cipherRows: SqlRow[] = [{ cipher: 'chacha20' }];
  failOn: RegExp | null = null;
  failWith: Error = new Error('boom');

  private record(sql: string): void {
    this.statements.push(sql);
    if (this.failOn?.test(sql)) throw this.failWith;
  }
  run(sql: string): void {
    this.record(sql);
  }
  all(sql: string): SqlRow[] {
    this.record(sql);
    return /PRAGMA cipher$/.test(sql) ? this.cipherRows : [{ n: 0 }];
  }
  lastInsertRowid = () => 0;
  transaction<T>(fn: () => T): T {
    return fn();
  }
  close(): void {}
}

const reasonOf = (fn: () => void): string => {
  try {
    fn();
  } catch (error) {
    if (error instanceof StoreOpenError) return error.reason;
    throw error;
  }
  return 'no error';
};

describe('attachKeyAndVerify', () => {
  it('missing cipher support throws and never issues a key pragma', () => {
    const db = new Recorder();
    db.cipherRows = [];
    expect(reasonOf(() => attachKeyAndVerify(db, KEY))).toBe('missingCipher');
    expect(db.statements.join('\n')).not.toMatch(/hexkey|key =/i);
  });

  it('pins the cipher, then supplies the key with hexkey, then forces a page decrypt', () => {
    const db = new Recorder();
    attachKeyAndVerify(db, KEY);
    expect(db.statements).toEqual([
      'PRAGMA cipher',
      "PRAGMA cipher = 'chacha20'",
      `PRAGMA hexkey = '${KEY_HEX}'`,
      'SELECT count(*) AS n FROM sqlite_master',
    ]);
  });

  it('a failing verification read throws keyRejected', () => {
    const db = new Recorder();
    db.failOn = /sqlite_master/;
    expect(reasonOf(() => attachKeyAndVerify(db, KEY))).toBe('keyRejected');
  });

  it('a rejected keying statement does not leak the key via the cause', () => {
    const db = new Recorder();
    db.failOn = /hexkey/;
    db.failWith = new Error(`SQLITE_ERROR: PRAGMA hexkey = '${KEY_HEX}'`);
    let caught: unknown;
    try {
      attachKeyAndVerify(db, KEY);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StoreOpenError);
    expect(String(caught)).not.toContain(KEY_HEX);
    expect((caught as Error).cause).toBeUndefined();
  });

  it('a VFS without cipher support is a build problem (missingCipher), not a wrong passphrase', () => {
    const db = new Recorder();
    db.failOn = /hexkey/;
    db.failWith = new Error('Setting key failed. Encryption is not supported by the VFS.');
    expect(reasonOf(() => attachKeyAndVerify(db, KEY))).toBe('missingCipher');
  });

  it('a key of the wrong length is refused before touching the database', () => {
    const db = new Recorder();
    expect(reasonOf(() => attachKeyAndVerify(db, new Uint8Array(31)))).toBe('invalidKey');
    expect(reasonOf(() => attachKeyAndVerify(db, new Uint8Array(33)))).toBe('invalidKey');
    expect(db.statements).toEqual([]);
  });

  it('is synchronous (returns void, not a promise)', () => {
    expect(attachKeyAndVerify(new Recorder(), KEY)).toBeUndefined();
  });
});
