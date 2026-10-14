// The synchronous SQL surface the store's queries run against. In production it wraps the
// sqlite3mc `oo1.DB` inside the worker; in unit tests it wraps the same engine on an in-memory
// file system, so the real SQL and the real encryption are exercised without a browser.

export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

export interface SqlHandle {
  /** Run a statement that returns no rows. */
  run(sql: string, bind?: readonly SqlValue[]): void;
  /** Run a query and return its rows as objects. */
  all(sql: string, bind?: readonly SqlValue[]): SqlRow[];
  /** `last_insert_rowid()` of this connection. */
  lastInsertRowid(): number;
  /** All-or-nothing: BEGIN IMMEDIATE ... COMMIT, ROLLBACK on a throw. */
  transaction<T>(fn: () => T): T;
  close(): void;
}

// A minimal structural view of the sqlite3 wasm `oo1.DB` (the package ships no types we can use).
export interface Oo1Db {
  exec(options: {
    sql: string;
    bind?: readonly SqlValue[];
    rowMode?: 'object';
    returnValue?: 'resultRows';
  }): unknown;
  transaction<T>(qualifier: string, callback: () => T): T;
  selectValue(sql: string): unknown;
  close(): void;
}

export function wrapOo1(db: Oo1Db): SqlHandle {
  return {
    run(sql, bind) {
      db.exec(bind ? { sql, bind } : { sql });
    },
    all(sql, bind) {
      const rows = db.exec({
        sql,
        ...(bind ? { bind } : {}),
        rowMode: 'object',
        returnValue: 'resultRows',
      });
      return rows as SqlRow[];
    },
    lastInsertRowid() {
      return Number(db.selectValue('SELECT last_insert_rowid()'));
    },
    transaction(fn) {
      return db.transaction('IMMEDIATE', fn);
    },
    close() {
      db.close();
    },
  };
}
