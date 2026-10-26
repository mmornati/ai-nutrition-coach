// The real engine (sqlite3mc ChaCha20-Poly1305, the production SQL, the production key attach and
// schema code) on the wasm build's in-memory file system. Ports of sqlite_key_attach_test,
// schema_migration_test (new schema only), the encryption tests of web_store_controller_test and
// the delete-cascade and resilience tests; the OPFS persistence itself is covered in the browser by
// e2e/storage.spec.ts.
import { isUuid, parseVaultSnapshot, type VaultSnapshot } from '@anc/core';
import { afterEach, describe, expect, it } from 'vitest';
import { DATABASE_FILENAME, PINNED_CIPHER, SCHEMA_VERSION } from './constants';
import { SchemaTooNewError, StoreOpenError, StoreUnavailableError } from './errors';
import type { EntryInsert, EntryRow } from './ops';
import { passphraseBytes } from './passphrase';
import { mapPlateRows } from './row-mapping';
import { ensureSchema, migrateTo, TABLE_NAMES } from './schema';
import type { VaultEnv } from './vault-clock';
import { SqliteStoreDb } from './sqlite-store-db';
import { StoreEngine, type EngineOpenRequest, type Sqlite3Module } from './worker/engine';
import {
  createPlaintextDb,
  createTestEngine,
  loadNodeSqlite3,
  memfsFileExists,
  plainReadFailureCode,
  openRawKeyed,
  testKey,
} from './testing/node-sqlite';

const FAST = { name: 'pbkdf2-hmac-sha256', iterations: 1000 } as const;
const SALT = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const GOOD = 'correct horse battery staple';

let counter = 0;
const newFile = () => `/engine-${counter++}.db`;
const open = (
  engine: StoreEngine,
  over: Partial<Omit<EngineOpenRequest, 'passphrase'>> & { passphrase?: Uint8Array | string } = {},
) => {
  const { passphrase, ...rest } = over;
  return engine.open({
    engineUrl: 'test:',
    passphrase:
      typeof passphrase === 'string'
        ? passphraseBytes(passphrase)
        : (passphrase ?? passphraseBytes(GOOD)),
    salt: SALT,
    kdf: FAST,
    expectExisting: false,
    ...rest,
  });
};
const entry = (name: string, over: Partial<EntryInsert> = {}): EntryInsert => ({
  sourceRef: `manual:${name}`,
  displayName: name,
  source: 'manual',
  foodGroup: 'other',
  quantityLow: '1',
  quantityHigh: '2',
  quantityUnit: 'piece',
  quantityDisplayLabel: '~1',
  ...over,
});
const openEngines: StoreEngine[] = [];
const engineFor = (filename: string, minIterations = 1000) => {
  const engine = createTestEngine({ filename, minIterations });
  openEngines.push(engine);
  return engine;
};
afterEach(() => {
  for (const engine of openEngines.splice(0)) engine.close();
});

const reasonOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (error) {
    if (error instanceof StoreOpenError) return error.reason;
    throw error;
  }
  return 'no error';
};

describe('encryption at rest', () => {
  it('pins ChaCha20-Poly1305', () => {
    expect(PINNED_CIPHER).toBe('chacha20');
  });

  it('the file is not a readable plaintext SQLite database (a keyless reader gets NOTADB)', async () => {
    const file = newFile();
    const engine = engineFor(file);
    await open(engine);
    engine.call('insertPlate', ['2026-08-16T12:00:00.000Z', [entry('Apple-ZZ')]]);
    engine.call('kvSet', ['ai.byokKey', 'sk-super-secret-key']);
    engine.close();
    // The raw OPFS bytes of the real store are inspected in e2e/storage.spec.ts.
    expect(await plainReadFailureCode(file)).toBe(26);
  });

  it('data persists across a close and the right passphrase opens it', async () => {
    const file = newFile();
    const first = engineFor(file);
    await open(first);
    first.call('insertPlate', ['2026-08-16T12:00:00.000Z', [entry('Apple')]]);
    first.close();

    const second = engineFor(file);
    await open(second, { expectExisting: true });
    const rows = second.call('readPlateRows', [null, null]) as { plates: unknown[] };
    expect(rows.plates).toHaveLength(1);
  });

  it('a wrong passphrase can never open the store and retains nothing', async () => {
    const file = newFile();
    const first = engineFor(file);
    await open(first);
    first.call('insertPlate', ['2026-08-16T12:00:00.000Z', [entry('A')]]);
    first.close();

    const attempt = engineFor(file);
    expect(
      await reasonOf(open(attempt, { passphrase: 'wrong passphrase 12', expectExisting: true })),
    ).toBe('keyRejected');
    expect(attempt.isOpen).toBe(false);
    expect(() => attempt.call('readPlateRows', [null, null])).toThrow(StoreUnavailableError);

    // The store is still fully readable with the right one, with its data intact.
    const again = engineFor(file);
    await open(again, { expectExisting: true });
    const rows = again.call('readPlateRows', [null, null]) as { plates: unknown[] };
    expect(rows.plates).toHaveLength(1);
  });

  it('an empty passphrase is just a wrong passphrase', async () => {
    const file = newFile();
    await open(engineFor(file));
    expect(await reasonOf(open(engineFor(file), { passphrase: '', expectExisting: true }))).toBe(
      'keyRejected',
    );
  });

  it('the same passphrase with a different salt is a different key and fails', async () => {
    const file = newFile();
    await open(engineFor(file));
    const otherSalt = Uint8Array.from({ length: 16 }, (_, i) => 200 - i);
    expect(await reasonOf(open(engineFor(file), { salt: otherSalt, expectExisting: true }))).toBe(
      'keyRejected',
    );
  });

  it('a plaintext database cannot be opened with a key (a plaintext/different-key open fails)', async () => {
    const file = newFile();
    await createPlaintextDb(
      file,
      'CREATE TABLE plate_log (id INTEGER); INSERT INTO plate_log VALUES (1)',
    );
    expect(await reasonOf(open(engineFor(file), { expectExisting: true }))).toBe('keyRejected');
  });

  it('a returning user whose data is gone gets dataMissing and NO empty store is minted', async () => {
    const file = newFile();
    expect(await reasonOf(open(engineFor(file), { expectExisting: true }))).toBe('dataMissing');
    expect(await memfsFileExists(file)).toBe(false);
  });

  it('a stored header promising data over an empty keyed file is dataMissing too', async () => {
    const file = newFile();
    const key = await testKey(GOOD, SALT);
    (await openRawKeyed(file, key, true)).close(); // keyed, but no schema
    expect(await reasonOf(open(engineFor(file), { expectExisting: true }))).toBe('dataMissing');
  });
});

describe('the key is short-lived', () => {
  it('the derived key and the passphrase copy are zeroed after a successful open', async () => {
    const keys: Uint8Array[] = [];
    const engine = createTestEngine({
      filename: newFile(),
      deriveKey: async (p, s, k) => {
        const { deriveKeyWithWebCrypto } = await import('./kdf');
        const key = await deriveKeyWithWebCrypto(p, s, k);
        keys.push(key);
        return key;
      },
    });
    openEngines.push(engine);
    const passphrase = passphraseBytes(GOOD);
    await open(engine, { passphrase });
    expect(keys).toHaveLength(1);
    expect(keys[0]?.length).toBe(32);
    expect(keys[0]?.every((b) => b === 0)).toBe(true);
    expect(passphrase.every((b) => b === 0)).toBe(true);
  });

  it('a failed attempt zeroes the candidate key and passphrase bytes too', async () => {
    const file = newFile();
    await open(engineFor(file));
    const keys: Uint8Array[] = [];
    const engine = createTestEngine({
      filename: file,
      deriveKey: async (p, s, k) => {
        const { deriveKeyWithWebCrypto } = await import('./kdf');
        const key = await deriveKeyWithWebCrypto(p, s, k);
        keys.push(key);
        return key;
      },
    });
    openEngines.push(engine);
    const passphrase = passphraseBytes('wrong passphrase 12');
    await expect(open(engine, { passphrase, expectExisting: true })).rejects.toBeInstanceOf(
      StoreOpenError,
    );
    expect(keys[0]?.every((b) => b === 0)).toBe(true);
    expect(passphrase.every((b) => b === 0)).toBe(true);
  });
});

describe('parameters are enforced inside the engine too', () => {
  it('refuses a downgraded iteration count before touching any file', async () => {
    const file = newFile();
    const strict = createTestEngine({ filename: file, minIterations: 600_000 });
    openEngines.push(strict);
    expect(await reasonOf(open(strict, { kdf: FAST }))).toBe('invalidKey');
    expect(await memfsFileExists(file)).toBe(false);
  });

  it('refuses an absurdly expensive iteration count before touching any file', async () => {
    const file = newFile();
    const engine = engineFor(file);
    expect(
      await reasonOf(open(engine, { kdf: { name: 'pbkdf2-hmac-sha256', iterations: 10_000_001 } })),
    ).toBe('invalidKey');
    expect(await memfsFileExists(file)).toBe(false);
  });

  it('refuses an unknown KDF', async () => {
    expect(
      await reasonOf(open(engineFor(newFile()), { kdf: { name: 'md5', iterations: 1000 } })),
    ).toBe('invalidKey');
  });

  it('refuses to open twice', async () => {
    const engine = engineFor(newFile());
    await open(engine);
    expect(await reasonOf(open(engine))).toBe('invalidKey');
  });

  it('an operation before open is unavailable, not a crash', () => {
    expect(() => engineFor(newFile()).call('kvGet', ['x'])).toThrow(StoreUnavailableError);
  });

  it('an operation outside the allow-list is refused', async () => {
    const engine = engineFor(newFile());
    await open(engine);
    expect(() => engine.call('constructor' as never, [])).toThrow(StoreUnavailableError);
  });
});

describe('engine start-up failures are "unavailable", never a wrong passphrase', () => {
  const deps = (over: Partial<ConstructorParameters<typeof StoreEngine>[0]>) =>
    new StoreEngine({
      loadSqlite3: () => loadNodeSqlite3(),
      installBaseVfs: () => Promise.resolve('unix-none'),
      deriveKey: async () => new Uint8Array(32),
      minIterations: 1000,
      filename: newFile(),
      ...over,
    });
  const reason = async (engine: StoreEngine) => {
    try {
      await open(engine);
    } catch (error) {
      return error instanceof StoreUnavailableError || error instanceof StoreOpenError
        ? error.reason
        : 'other';
    }
    return 'no error';
  };

  it('the wasm asset cannot be loaded -> engineMissing', async () => {
    expect(await reason(deps({ loadSqlite3: () => Promise.reject(new Error('404')) }))).toBe(
      'engineMissing',
    );
  });

  it('OPFS synchronous access is missing -> noOpfs', async () => {
    expect(
      await reason(
        deps({ installBaseVfs: () => Promise.reject(new Error('Missing required OPFS APIs.')) }),
      ),
    ).toBe('noOpfs');
  });

  it('any other VFS failure -> storage', async () => {
    expect(await reason(deps({ installBaseVfs: () => Promise.reject(new Error('quota')) }))).toBe(
      'storage',
    );
  });

  it('a build without cipher support (the wrapper cannot be registered) -> missingCipher', async () => {
    const real = await loadNodeSqlite3();
    const plain: Sqlite3Module = {
      oo1: real.oo1,
      capi: { sqlite3mc_vfs_create: () => 1 },
    };
    expect(await reason(deps({ loadSqlite3: () => Promise.resolve(plain) }))).toBe('missingCipher');
  });
});

describe('schema (current version)', () => {
  it('creates exactly the documented tables and indexes, with no foreign keys', async () => {
    const file = newFile();
    await open(engineFor(file));
    const key = await testKey(GOOD, SALT);
    const raw = await openRawKeyed(file, key);
    try {
      const tables = raw
        .all(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .map((r) => r['name']);
      expect(tables).toEqual([...TABLE_NAMES].sort());
      expect(TABLE_NAMES).toEqual([
        'plate_log',
        'food_entry',
        'coach_note',
        'coach_interaction',
        'coach_dismissal',
        'kv',
        'saved_meal',
        'saved_meal_item',
        'recipe',
        'recipe_item',
        'tombstone',
      ]);
      const indexes = raw
        .all(
          "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name",
        )
        .map((r) => r['name']);
      expect(indexes).toEqual([
        'idx_coach_interaction_uid',
        'idx_coach_note_uid',
        'idx_entry_plate',
        'idx_food_entry_uid',
        'idx_note_plate',
        'idx_plate_log_uid',
        'idx_plate_logged_at',
        'idx_recipe_item_recipe',
        'idx_recipe_item_uid',
        'idx_recipe_uid',
        'idx_saved_meal_item_meal',
        'idx_saved_meal_item_uid',
        'idx_saved_meal_uid',
      ]);
      for (const table of TABLE_NAMES) {
        expect(raw.all(`PRAGMA foreign_key_list(${table})`)).toEqual([]);
      }
      expect(raw.all('PRAGMA user_version')[0]?.['user_version']).toBe(SCHEMA_VERSION);
      // The primary keys the contract names.
      expect(
        raw.all("SELECT name FROM pragma_table_info('coach_dismissal') WHERE pk = 1")[0]?.['name'],
      ).toBe('dismissal_key');
      expect(raw.all("SELECT name FROM pragma_table_info('kv') WHERE pk = 1")[0]?.['name']).toBe(
        'key',
      );
      // No sync table (the outbox is in memory); `tombstone` records deletions, not a queue.
      expect(tables.some((t) => String(t).includes('sync'))).toBe(false);
    } finally {
      raw.close();
    }
  });

  it('refuses data from a NEWER schema and leaves it untouched', async () => {
    const file = newFile();
    await open(engineFor(file));
    const key = await testKey(GOOD, SALT);
    const raw = await openRawKeyed(file, key);
    raw.run('PRAGMA user_version = 7');
    raw.close();

    const attempt = engineFor(file);
    await expect(open(attempt, { expectExisting: true })).rejects.toMatchObject({
      name: 'SchemaTooNewError',
      found: 7,
      supported: SCHEMA_VERSION,
    });
    await expect(open(engineFor(file), { expectExisting: true })).rejects.toBeInstanceOf(
      SchemaTooNewError,
    );
    expect(attempt.isOpen).toBe(false);
    const check = await openRawKeyed(file, key);
    expect(check.all('PRAGMA user_version')[0]?.['user_version']).toBe(7);
    check.close();
  });

  it('upgrades a v1 database to v2: old rows stay readable, the new columns are null', async () => {
    const file = newFile();
    const key = await testKey(GOOD, SALT);
    const first = engineFor(file);
    await open(first);
    first.close();
    // Rebuild the v1 shape: drop the v2 columns and rewind the version.
    const raw = await openRawKeyed(file, key);
    for (const c of [
      'quantity_grams',
      'quantity_grams_estimated',
      'nutrients_per_100g',
      'food_extra',
    ]) {
      raw.run(`ALTER TABLE food_entry DROP COLUMN ${c}`);
    }
    raw.run(
      "INSERT INTO plate_log (uid, logged_at_utc) VALUES ('00000000-0000-7000-8000-0000000000a1', '2026-08-16T12:00:00.000Z')",
    );
    raw.run(
      `INSERT INTO food_entry (uid, plate_log_id, source_ref, display_name, source, food_group,
         quantity_low, quantity_high, quantity_unit, quantity_display_label)
       VALUES ('00000000-0000-7000-8000-0000000000a2', 1, 'manual:old', 'Old', 'manual', 'other', '1', '2', 'piece', '~1')`,
    );
    raw.run('PRAGMA user_version = 1');
    raw.close();

    const second = engineFor(file);
    await open(second, { expectExisting: true });
    const rows = second.call('readPlateRows', [null, null]) as { entries: EntryRow[] };
    expect(rows.entries).toHaveLength(1);
    expect(rows.entries[0]).toMatchObject({
      displayName: 'Old',
      quantityGrams: null,
      quantityGramsEstimated: null,
      nutrientsPer100g: null,
      foodExtra: null,
    });
    second.call('insertPlate', [
      '2026-08-17T12:00:00.000Z',
      [
        entry('New', {
          quantityGrams: '90',
          quantityGramsEstimated: 0,
          nutrientsPer100g: '{"salt":1}',
        }),
      ],
    ]);
    second.close();
    const check = await openRawKeyed(file, key);
    // The chain carries on to the current version.
    expect(check.all('PRAGMA user_version')[0]?.['user_version']).toBe(SCHEMA_VERSION);
    check.close();
  });

  it('upgrades a v2 database to v3: every plate and the kv row stay, the new tables are empty', async () => {
    const file = newFile();
    const key = await testKey(GOOD, SALT);
    const first = engineFor(file);
    await open(first);
    first.call('insertPlate', [
      '2026-08-16T12:00:00.000Z',
      [entry('Kept', { quantityGrams: '80', nutrientsPer100g: '{"salt":1}' })],
    ]);
    first.call('kvSet', ['k', 'v']);
    first.close();
    // Rebuild the v2 shape: no v3 tables, version 2.
    const raw = await openRawKeyed(file, key);
    for (const table of ['saved_meal_item', 'saved_meal', 'recipe_item', 'recipe']) {
      raw.run(`DROP TABLE ${table}`);
    }
    raw.run('PRAGMA user_version = 2');
    raw.close();

    const second = engineFor(file);
    await open(second, { expectExisting: true });
    const rows = second.call('readPlateRows', [null, null]) as { entries: EntryRow[] };
    expect(rows.entries).toHaveLength(1);
    expect(rows.entries[0]).toMatchObject({ displayName: 'Kept', quantityGrams: '80' });
    expect(second.call('kvGet', ['k'])).toBe('v');
    expect((second.call('readSavedMeals', []) as { meals: unknown[] }).meals).toEqual([]);
    expect((second.call('readRecipes', []) as { recipes: unknown[] }).recipes).toEqual([]);
    const id = second.call('insertSavedMeal', [
      'Usual',
      '2026-08-17T07:00:00.000Z',
      [entry('Oats')],
    ]);
    expect(id).toBe(1);
    second.close();
    const check = await openRawKeyed(file, key);
    expect(check.all('PRAGMA user_version')[0]?.['user_version']).toBe(SCHEMA_VERSION);
    check.close();
  });

  it('re-running the v3 migration is a no-op: saved meals and recipes keep every row', async () => {
    const file = newFile();
    const key = await testKey(GOOD, SALT);
    const first = engineFor(file);
    await open(first);
    first.call('insertSavedMeal', [
      'Usual',
      '2026-08-17T07:00:00.000Z',
      [entry('Oats'), entry('Milk')],
    ]);
    first.call('insertRecipe', ['Stew', 4, '1200', '2026-08-17T07:00:00.000Z', [entry('Beans')]]);
    first.close();
    const raw = await openRawKeyed(file, key);
    raw.run('PRAGMA user_version = 2'); // as if the v3 step had been rolled back
    raw.close();
    const second = engineFor(file);
    await open(second, { expectExisting: true });
    const meals = second.call('readSavedMeals', []) as { meals: unknown[]; items: unknown[] };
    expect(meals.meals).toHaveLength(1);
    expect(meals.items).toHaveLength(2);
    const recipes = second.call('readRecipes', []) as {
      recipes: { servings: number; cookedWeightGrams: string }[];
      items: unknown[];
    };
    expect(recipes.recipes[0]).toMatchObject({ servings: 4, cookedWeightGrams: '1200' });
    expect(recipes.items).toHaveLength(1);
    second.close();
  });

  it('re-running the v2 migration is a no-op (columns exist once)', async () => {
    const file = newFile();
    const key = await testKey(GOOD, SALT);
    const first = engineFor(file);
    await open(first);
    first.call('insertPlate', [
      '2026-08-16T12:00:00.000Z',
      [entry('Kept', { quantityGrams: '50' })],
    ]);
    first.close();
    const raw = await openRawKeyed(file, key);
    raw.run('PRAGMA user_version = 1');
    raw.close();
    const second = engineFor(file);
    await open(second, { expectExisting: true });
    const rows = second.call('readPlateRows', [null, null]) as { entries: EntryRow[] };
    expect(rows.entries[0]?.quantityGrams).toBe('50');
    second.close();
    const check = await openRawKeyed(file, key);
    const names = check.all('PRAGMA table_info(food_entry)').map((r) => r['name']);
    expect(names.filter((n) => n === 'quantity_grams')).toHaveLength(1);
    check.close();
  });

  it('is re-runnable: a rolled-back user_version reopens and keeps every row', async () => {
    const file = newFile();
    const first = engineFor(file);
    await open(first);
    first.call('insertPlate', ['2026-08-16T12:00:00.000Z', [entry('Kept')]]);
    first.call('kvSet', ['k', 'v']);
    first.close();
    const key = await testKey(GOOD, SALT);
    const raw = await openRawKeyed(file, key);
    raw.run('PRAGMA user_version = 0'); // a restored backup / downgrade then upgrade
    raw.close();

    const second = engineFor(file);
    await open(second, { expectExisting: false });
    expect(
      (second.call('readPlateRows', [null, null]) as { plates: unknown[] }).plates,
    ).toHaveLength(1);
    expect(second.call('kvGet', ['k'])).toBe('v');
    second.close();
    const check = await openRawKeyed(file, key);
    expect(check.all('PRAGMA user_version')[0]?.['user_version']).toBe(SCHEMA_VERSION);
    check.close();
  });
});

describe('SQL behaviour', () => {
  async function withDb(
    run: (db: SqliteStoreDb, raw: Awaited<ReturnType<typeof openRawKeyed>>) => void | Promise<void>,
  ) {
    const file = newFile();
    const key = await testKey(GOOD, SALT);
    const raw = await openRawKeyed(file, key, true);
    const { ensureSchema } = await import('./schema');
    ensureSchema(raw, false);
    try {
      await run(new SqliteStoreDb(raw), raw);
    } finally {
      raw.close();
    }
  }

  it('a failing item insert leaves no saved meal and no recipe row: each is one transaction', async () => {
    await withDb((db, raw) => {
      const bad = { ...entry('Broken'), sourceRef: null as unknown as string };
      expect(() =>
        db.insertSavedMeal('Usual', '2026-08-17T07:00:00.000Z', [entry('Fine'), bad]),
      ).toThrow();
      expect(() =>
        db.insertRecipe('Stew', 2, null, '2026-08-17T07:00:00.000Z', [entry('Fine'), bad]),
      ).toThrow();
      for (const table of ['saved_meal', 'saved_meal_item', 'recipe', 'recipe_item']) {
        expect(raw.all(`SELECT count(*) AS n FROM ${table}`)[0]?.['n']).toBe(0);
      }
      // The database is still usable after the rollback.
      expect(db.insertSavedMeal('Again', '2026-08-17T07:00:00.000Z', [entry('Fine')])).toBe(1);
    });
  });

  it('the range read SEARCHes by index and never SCANs the plates (cost follows the range)', async () => {
    await withDb((db, raw) => {
      const seen: string[] = [];
      const spy = new SqliteStoreDb({
        ...raw,
        run: (s, b) => raw.run(s, b),
        all: (s, b) => {
          seen.push(s);
          return raw.all(s, b);
        },
        lastInsertRowid: () => raw.lastInsertRowid(),
        transaction: (f) => raw.transaction(f),
        close: () => undefined,
      });
      db.insertPlate('2026-08-16T12:00:00.000Z', [entry('A')]);
      spy.readPlateRows('2026-08-16T00:00:00.000Z', '2026-08-17T00:00:00.000Z');
      const plan = raw
        .all(`EXPLAIN QUERY PLAN ${seen.at(-1)}`, [
          '2026-08-16T00:00:00.000Z',
          '2026-08-17T00:00:00.000Z',
        ])
        .map((r) => String(r['detail']))
        .join('\n');
      expect(plan).toMatch(/SEARCH p USING (COVERING )?INDEX idx_plate_logged_at/);
      expect(plan).not.toMatch(/SCAN p\b/);
      expect(plan).toMatch(/idx_entry_plate/);
    });
  });

  it('coach notes are looked up by plate via idx_note_plate', async () => {
    await withDb((_db, raw) => {
      const plan = raw
        .all(
          'EXPLAIN QUERY PLAN SELECT id FROM coach_note WHERE plate_log_id = ? ORDER BY id ASC',
          [1],
        )
        .map((r) => String(r['detail']))
        .join('\n');
      expect(plan).toMatch(/idx_note_plate/);
    });
  });

  const count = (
    raw: { all: (s: string) => Record<string, unknown>[] },
    table: string,
    where = '1=1',
  ) => Number(raw.all(`SELECT count(*) AS n FROM ${table} WHERE ${where}`)[0]?.['n']);
  const counts = (raw: { all: (s: string) => Record<string, unknown>[] }) =>
    ['plate_log', 'food_entry', 'coach_note', 'coach_interaction', 'coach_dismissal'].map((t) =>
      count(raw, t),
    );
  function seed(db: SqliteStoreDb): number {
    const first = db.insertPlate('2026-08-16T12:00:00.000Z', [entry('A'), entry('B')]).plateId;
    const second = db.insertPlate('2026-08-16T13:00:00.000Z', [entry('C'), entry('D')]).plateId;
    for (const plate of [first, second]) {
      const note = db.insertNote({
        plateLogId: plate,
        anchor: 'postResolve',
        questionKey: 'k',
        noteText: 't',
        generatedAt: '2026-08-16T12:00:00.000Z',
      });
      db.insertInteraction(note, 'sure', '2026-08-16T12:00:00.000Z');
      db.insertDismissal(`note:${note}`, '2026-08-16T12:00:00.000Z');
    }
    return first;
  }

  it('deletePlate removes the plate, entries, notes, interactions and dismissals - and only those', async () => {
    await withDb((db, raw) => {
      const first = seed(db);
      expect(counts(raw)).toEqual([2, 4, 2, 2, 2]);
      db.deletePlate(first);
      expect(counts(raw)).toEqual([1, 2, 1, 1, 1]);
      expect(count(raw, 'food_entry', `plate_log_id = ${first}`)).toBe(0);
      expect(count(raw, 'coach_note', `plate_log_id = ${first}`)).toBe(0);
    });
  });

  it('is all or nothing: when the plate row cannot be deleted, everything else is still there', async () => {
    await withDb((db, raw) => {
      const first = seed(db);
      const before = counts(raw);
      raw.run(
        "CREATE TRIGGER block_plate_delete BEFORE DELETE ON plate_log BEGIN SELECT RAISE(ABORT, 'blocked'); END",
      );
      expect(() => db.deletePlate(first)).toThrow();
      expect(counts(raw)).toEqual(before); // rolled back as one unit
    });
  });

  it('insertPlate is one transaction: a failing entry leaves no half-written plate', async () => {
    await withDb((db, raw) => {
      raw.run(
        "CREATE TRIGGER block_entry BEFORE INSERT ON food_entry WHEN NEW.display_name = 'boom' BEGIN SELECT RAISE(ABORT, 'blocked'); END",
      );
      expect(() =>
        db.insertPlate('2026-08-16T12:00:00.000Z', [entry('ok'), entry('boom')]),
      ).toThrow();
      expect(counts(raw)).toEqual([0, 0, 0, 0, 0]);
    });
  });

  it('a corrupt row is skipped and reported, never poisoning the read (content-free)', async () => {
    await withDb((db, raw) => {
      raw.run(
        "INSERT INTO plate_log (uid, logged_at_utc) VALUES ('00000000-0000-7000-8000-0000000000b1', 'not-a-date')",
      );
      const good = db.insertPlate('2026-01-02T00:00:00.000Z', [entry('G')]).plateId;
      raw.run(
        `INSERT INTO food_entry (uid, plate_log_id, source_ref, display_name, source, quantity_low, quantity_high, quantity_unit, quantity_display_label)
         VALUES ('00000000-0000-7000-8000-0000000000b2', ${good}, 'manual:x', 'X', 'manual', 'NaN', '2', 'piece', '~1'),
                ('00000000-0000-7000-8000-0000000000b3', ${good}, 'manual:x', 'X', 'manual', '1', 'Infinity', 'piece', '~1')`,
      );
      const reports: string[] = [];
      const plates = mapPlateRows(db.readPlateRows(null, null), (id, reason) =>
        reports.push(`${id}:${reason}`),
      );
      expect(plates.map((p) => p.id)).toEqual([good]);
      expect(plates[0]?.entries).toHaveLength(1);
      expect(reports).toHaveLength(3);
      expect(reports.join('|')).not.toMatch(/not-a-date|NaN|Infinity/);
    });
  });

  it('timestamps are stored as fixed-width UTC text, so the text bounds are exact', async () => {
    await withDb((db, raw) => {
      db.insertPlate('2026-08-16T23:59:59.999Z', [entry('A')]);
      db.insertPlate('2026-08-17T00:00:00.000Z', [entry('B')]);
      expect(
        raw.all('SELECT length(logged_at_utc) AS n FROM plate_log').every((r) => r['n'] === 24),
      ).toBe(true);
      const day = db.readPlateRows('2026-08-16T00:00:00.000Z', '2026-08-17T00:00:00.000Z');
      expect(day.plates).toHaveLength(1);
    });
  });

  it('key/value: upsert, read, delete', async () => {
    await withDb((db) => {
      expect(db.kvGet('a')).toBeNull();
      db.kvSet('a', '1');
      db.kvSet('a', '2');
      expect(db.kvGet('a')).toBe('2');
      db.kvDelete('a');
      db.kvDelete('a');
      expect(db.kvGet('a')).toBeNull();
    });
  });

  it('the default database file name is under the anc_pwa prefix', () => {
    expect(DATABASE_FILENAME).toContain('anc_pwa');
  });
});

describe('schema v4: uid, stamps and tombstones (docs/encrypted-sync-plan.md S0)', () => {
  const V3_TABLES = [
    'plate_log',
    'food_entry',
    'coach_note',
    'coach_interaction',
    'coach_dismissal',
    'kv',
    'saved_meal',
    'saved_meal_item',
    'recipe',
    'recipe_item',
  ] as const;
  const NEW_COLUMNS = new Set(['uid', 'updated_at_hlc']);

  /** Every table as it is stored, without the columns v4 adds. */
  const dump = (raw: Awaited<ReturnType<typeof openRawKeyed>>) =>
    Object.fromEntries(
      V3_TABLES.map((table) => [
        table,
        raw
          .all(
            `SELECT * FROM ${table} ORDER BY ${table === 'kv' ? 'key' : table === 'coach_dismissal' ? 'dismissal_key' : 'id'}`,
          )
          // The device id the migration adds is not one of the rows that were there.
          .filter((row) => row['key'] !== 'sync.deviceId')
          .map((row) =>
            Object.fromEntries(Object.entries(row).filter(([name]) => !NEW_COLUMNS.has(name))),
          ),
      ]),
    );

  const seededEnv = (): VaultEnv => {
    let n = 0;
    return {
      now: () => 1_800_000_000_000,
      randomBytes: (length) => Uint8Array.from({ length }, () => (n++ * 37 + 11) % 256),
    };
  };

  /** A database exactly as v3 left it: only the first three migrations ran, then rows were written. */
  async function v3Database() {
    const file = newFile();
    const key = await testKey(GOOD, SALT);
    const raw = await openRawKeyed(file, key, true);
    migrateTo(raw, 3);
    expect(raw.all('PRAGMA user_version')[0]?.['user_version']).toBe(3);
    raw.run(
      "INSERT INTO plate_log (logged_at_utc) VALUES ('2026-08-16T12:00:00.000Z'), ('2026-08-17T08:00:00.000Z')",
    );
    const food = (plate: number, name: string) =>
      `(${plate}, 'manual:${name}', '${name}', 'manual', 'starch', '1', '2', 'piece', '~1', '80', 1, '{"salt":1}', NULL)`;
    raw.run(
      `INSERT INTO food_entry (plate_log_id, source_ref, display_name, source, food_group, quantity_low,
         quantity_high, quantity_unit, quantity_display_label, quantity_grams, quantity_grams_estimated,
         nutrients_per_100g, food_extra)
       VALUES ${food(1, 'A')}, ${food(1, 'B')}, ${food(2, 'C')}`,
    );
    raw.run(
      `INSERT INTO coach_note (plate_log_id, anchor, question_key, note_text, generated_at)
       VALUES (1, 'postResolve', 'k', 'Nice', '2026-08-16T12:00:01.000Z')`,
    );
    raw.run(
      "INSERT INTO coach_interaction (coach_note_id, kind, at) VALUES (1, 'sure', '2026-08-16T12:00:02.000Z')",
    );
    raw.run(
      "INSERT INTO coach_dismissal (dismissal_key, dismissed_at_utc) VALUES ('note:1', '2026-08-16T12:00:03.000Z')",
    );
    raw.run(
      "INSERT INTO kv (key, value) VALUES ('ui.locale', 'fr'), ('ai.byokKey', 'sk-secret-value-123'), ('profile', '{}')",
    );
    raw.run(
      "INSERT INTO saved_meal (name, created_at_utc) VALUES ('Usual', '2026-08-17T07:00:00.000Z')",
    );
    raw.run(
      `INSERT INTO saved_meal_item (saved_meal_id, position, source_ref, display_name, source, food_group,
         quantity_low, quantity_high, quantity_unit, quantity_display_label)
       VALUES (1, 0, 'manual:Oats', 'Oats', 'manual', 'starch', '1', '1', 'bowl', '1 bowl'),
              (1, 1, 'manual:Milk', 'Milk', 'manual', 'dairy', '1', '1', 'cup', '1 cup')`,
    );
    raw.run(
      "INSERT INTO recipe (name, servings, cooked_weight_grams, created_at_utc) VALUES ('Stew', 4, '1200', '2026-08-18T07:00:00.000Z')",
    );
    raw.run(
      `INSERT INTO recipe_item (recipe_id, position, source_ref, display_name, source, food_group,
         quantity_low, quantity_high, quantity_unit, quantity_display_label, quantity_grams)
       VALUES (1, 0, 'seed:Beans', 'Beans', 'seed', 'protein', '300', '300', 'g', '300 g', '300')`,
    );
    return { file, key, raw };
  }

  it('upgrades a v3 database losslessly: every row stays, each gains a distinct UUIDv7 uid in id order', async () => {
    const { raw } = await v3Database();
    try {
      const before = dump(raw);
      ensureSchema(raw, false, seededEnv());
      expect(raw.all('PRAGMA user_version')[0]?.['user_version']).toBe(4);
      expect(dump(raw)).toEqual(before);

      const allUids: string[] = [];
      for (const table of [
        'plate_log',
        'food_entry',
        'coach_note',
        'coach_interaction',
        'saved_meal',
        'saved_meal_item',
        'recipe',
        'recipe_item',
      ]) {
        const uids = raw
          .all(`SELECT uid FROM ${table} ORDER BY id ASC`)
          .map((r) => String(r['uid']));
        expect(uids.length).toBeGreaterThan(0);
        expect(uids.every(isUuid)).toBe(true);
        expect(uids.every((u) => u[14] === '7')).toBe(true);
        expect([...uids].sort()).toEqual(uids); // the order of the uids is the order the rows were written
        allUids.push(...uids);
      }
      expect(new Set(allUids).size).toBe(allUids.length);
      expect(allUids).toHaveLength(2 + 3 + 1 + 1 + 1 + 2 + 1 + 1);

      // The unique index is real.
      expect(() =>
        raw.run(
          "INSERT INTO plate_log (uid, logged_at_utc) SELECT uid, 'x' FROM plate_log LIMIT 1",
        ),
      ).toThrow();

      // Saved meals and recipes get a legacy stamp from their creation time; kv rows the zero stamp.
      const stamps = raw.all(
        'SELECT updated_at_hlc AS s FROM saved_meal UNION ALL SELECT updated_at_hlc FROM recipe',
      );
      expect(stamps.map((r) => r['s'])).toEqual([
        `${String(Date.parse('2026-08-17T07:00:00.000Z')).padStart(13, '0')}-0000-0000000000000000`,
        `${String(Date.parse('2026-08-18T07:00:00.000Z')).padStart(13, '0')}-0000-0000000000000000`,
      ]);
      const device = String(
        raw.all("SELECT value FROM kv WHERE key = 'sync.deviceId'")[0]?.['value'],
      );
      expect(device).toMatch(/^[0-9a-f]{16}$/);
      expect(
        raw
          .all("SELECT DISTINCT updated_at_hlc AS s FROM kv WHERE key <> 'sync.deviceId'")
          .map((r) => r['s']),
      ).toEqual([`0000000000000-0000-${device}`]); // wall time 0 on this device: loses to any real write
      expect(raw.all('SELECT count(*) AS n FROM tombstone')[0]?.['n']).toBe(0);
    } finally {
      raw.close();
    }
  });

  it('re-running the v4 migration is a no-op: no uid, stamp or row changes', async () => {
    const { raw } = await v3Database();
    try {
      ensureSchema(raw, false, seededEnv());
      const dumpAll = () =>
        [...V3_TABLES, 'tombstone'].map((t) => raw.all(`SELECT * FROM ${t} ORDER BY 1`));
      const once = dumpAll();
      raw.run('PRAGMA user_version = 3'); // as if the v4 step had been rolled back
      ensureSchema(raw, false); // a different random source: it must not matter
      expect(dumpAll()).toEqual(once);
      expect(raw.all('PRAGMA user_version')[0]?.['user_version']).toBe(4);
      const columns = raw.all('PRAGMA table_info(plate_log)').map((r) => r['name']);
      expect(columns.filter((c) => c === 'uid')).toHaveLength(1);
    } finally {
      raw.close();
    }
  });

  it('a half-finished migration resumes: rows that already have a uid keep it, the rest get one', async () => {
    const { raw } = await v3Database();
    try {
      ensureSchema(raw, false, seededEnv());
      const keep = String(raw.all('SELECT uid FROM plate_log WHERE id = 1')[0]?.['uid']);
      raw.run('UPDATE plate_log SET uid = NULL WHERE id = 2');
      raw.run('PRAGMA user_version = 3');
      ensureSchema(raw, false);
      const uids = raw.all('SELECT uid FROM plate_log ORDER BY id').map((r) => String(r['uid']));
      expect(uids[0]).toBe(keep);
      expect(isUuid(uids[1])).toBe(true);
      expect(new Set(uids).size).toBe(2);
    } finally {
      raw.close();
    }
  });

  it('a migrated store reads back through the engine and keeps working; the BYOK key stays out of the snapshot', async () => {
    const { file, raw } = await v3Database();
    raw.close();
    const engine = engineFor(file);
    await open(engine, { expectExisting: true });
    const rows = engine.call('readPlateRows', [null, null]) as {
      plates: unknown[];
      entries: EntryRow[];
    };
    expect(rows.plates).toHaveLength(2);
    expect(rows.entries.map((e) => e.displayName)).toEqual(['C', 'A', 'B']); // newest plate first
    const snapshot = engine.call('readVault', []) as VaultSnapshot;
    expect(parseVaultSnapshot(snapshot).kind).toBe('vaultSnapshotParsed');
    expect(snapshot.plates).toHaveLength(2);
    expect(snapshot.plates[0]?.notes[0]?.interactions).toHaveLength(1);
    expect(snapshot.dismissals).toHaveLength(1);
    expect(snapshot.dismissals[0]?.key).toBe(`note:${snapshot.plates[0]?.notes[0]?.uid}`);
    expect(snapshot.savedMeals[0]?.items.map((i) => i.displayName)).toEqual(['Oats', 'Milk']);
    expect(snapshot.recipes[0]?.cookedWeightGrams).toBe('1200');
    expect(snapshot.kv.map((e) => e.key)).toEqual(['profile', 'ui.locale']);
    expect(JSON.stringify(snapshot)).not.toContain('sk-secret');
    expect(engine.call('kvGet', ['ai.byokKey'])).toBe('sk-secret-value-123');
    // New rows after the upgrade also get uids.
    const added = engine.call('insertPlate', ['2026-08-19T12:00:00.000Z', [entry('D')]]) as {
      plateId: number;
    };
    expect(added.plateId).toBe(3);
    const after = engine.call('readVault', []) as VaultSnapshot;
    expect(after.plates).toHaveLength(3);
    expect(after.plates.every((p) => isUuid(p.uid))).toBe(true);
    // The id <-> uid bridge the per-plate sync status is looked up through.
    const identities = engine.call('readPlateUids', []) as { id: number; uid: string }[];
    expect(identities.map((i) => i.id)).toEqual([3, 2, 1]);
    expect(identities.map((i) => i.uid).sort()).toEqual(after.plates.map((p) => p.uid).sort());
  });

  async function withDb(
    run: (db: SqliteStoreDb, raw: Awaited<ReturnType<typeof openRawKeyed>>) => void | Promise<void>,
    env?: VaultEnv,
  ) {
    const key = await testKey(GOOD, SALT);
    const raw = await openRawKeyed(newFile(), key, true);
    ensureSchema(raw, false);
    try {
      await run(new SqliteStoreDb(raw, env), raw);
    } finally {
      raw.close();
    }
  }
  const tombstones = (raw: Awaited<ReturnType<typeof openRawKeyed>>) =>
    Number(raw.all('SELECT count(*) AS n FROM tombstone')[0]?.['n']);

  it('deletePlate writes its tombstones in the same transaction: a delete that fails leaves none', async () => {
    await withDb((db, raw) => {
      const plate = db.insertPlate('2026-08-16T12:00:00.000Z', [entry('A'), entry('B')]).plateId;
      const note = db.insertNote({
        plateLogId: plate,
        anchor: 'postResolve',
        questionKey: 'k',
        noteText: 't',
        generatedAt: '2026-08-16T12:00:00.000Z',
      });
      db.insertInteraction(note, 'sure', '2026-08-16T12:00:00.000Z');
      raw.run(
        "CREATE TRIGGER block_plate_delete BEFORE DELETE ON plate_log BEGIN SELECT RAISE(ABORT, 'blocked'); END",
      );
      expect(() => db.deletePlate(plate)).toThrow();
      expect(tombstones(raw)).toBe(0); // rolled back with everything else
      expect(raw.all('SELECT count(*) AS n FROM food_entry')[0]?.['n']).toBe(2);
      raw.run('DROP TRIGGER block_plate_delete');
      db.deletePlate(plate);
      expect(
        raw
          .all(
            'SELECT table_name AS t, count(*) AS n FROM tombstone GROUP BY table_name ORDER BY 1',
          )
          .map((r) => [r['t'], r['n']]),
      ).toEqual([
        ['coach_interaction', 1],
        ['coach_note', 1],
        ['food_entry', 2],
        ['plate_log', 1],
      ]);
      // One stamp for the whole delete.
      expect(raw.all('SELECT DISTINCT deleted_at_hlc FROM tombstone')).toHaveLength(1);
    });
  });

  it('deleteNotesForPlate leaves tombstones for the notes and their interactions only', async () => {
    await withDb((db, raw) => {
      const plate = db.insertPlate('2026-08-16T12:00:00.000Z', [entry('A')]).plateId;
      const note = db.insertNote({
        plateLogId: plate,
        anchor: 'postResolve',
        questionKey: 'k',
        noteText: 't',
        generatedAt: '2026-08-16T12:00:00.000Z',
      });
      db.insertInteraction(note, 'sure', '2026-08-16T12:00:00.000Z');
      db.deleteNotesForPlate(plate);
      expect(
        raw.all('SELECT table_name AS t FROM tombstone ORDER BY 1').map((r) => r['t']),
      ).toEqual(['coach_interaction', 'coach_note']);
      expect(raw.all('SELECT count(*) AS n FROM plate_log')[0]?.['n']).toBe(1);
    });
  });

  it('a template delete is one transaction with its tombstones', async () => {
    await withDb((db, raw) => {
      const meal = db.insertSavedMeal('Usual', '2026-08-17T07:00:00.000Z', [
        entry('Oats'),
        entry('Milk'),
      ]);
      raw.run(
        "CREATE TRIGGER block_meal_delete BEFORE DELETE ON saved_meal BEGIN SELECT RAISE(ABORT, 'blocked'); END",
      );
      expect(() => db.deleteSavedMeal(meal)).toThrow();
      expect(tombstones(raw)).toBe(0);
      expect(raw.all('SELECT count(*) AS n FROM saved_meal_item')[0]?.['n']).toBe(2);
    });
  });

  it('applying a snapshot is all or nothing', async () => {
    await withDb((db, raw) => {
      const source = new SqliteStoreDb(raw);
      source.insertPlate('2026-08-16T12:00:00.000Z', [entry('A')]);
      source.insertSavedMeal('Usual', '2026-08-17T07:00:00.000Z', [entry('Oats')]);
      const snapshot = source.readVault();
      raw.run('DELETE FROM plate_log');
      raw.run('DELETE FROM food_entry');
      raw.run('DELETE FROM saved_meal');
      raw.run('DELETE FROM saved_meal_item');
      raw.run(
        "CREATE TRIGGER block_meal BEFORE INSERT ON saved_meal BEGIN SELECT RAISE(ABORT, 'blocked'); END",
      );
      expect(() => db.applyVault(snapshot)).toThrow();
      // The plate, applied before the meal failed, was rolled back with it.
      expect(raw.all('SELECT count(*) AS n FROM plate_log')[0]?.['n']).toBe(0);
      expect(raw.all('SELECT count(*) AS n FROM food_entry')[0]?.['n']).toBe(0);
      raw.run('DROP TRIGGER block_meal');
      db.applyVault(snapshot);
      expect(raw.all('SELECT count(*) AS n FROM plate_log')[0]?.['n']).toBe(1);
    });
  });

  it('the device id is made once and kept in the store (its key never travels); stamps never go back', async () => {
    const times = [1_800_000_000_000, 1_800_000_000_000, 1_799_999_000_000];
    let i = 0;
    const env: VaultEnv = {
      now: () => times[Math.min(i++, times.length - 1)] ?? 0,
      randomBytes: (length) => Uint8Array.from({ length }, (_, k) => k + 1),
    };
    await withDb((db, raw) => {
      db.kvSet('ui.locale', 'en');
      const device = db.kvGet('sync.deviceId');
      expect(device).toMatch(/^[0-9a-f]{16}$/);
      db.kvSet('ui.locale', 'fr');
      expect(db.kvGet('sync.deviceId')).toBe(device);
      const stamps = raw.all('SELECT updated_at_hlc AS s FROM kv WHERE key = ?', ['ui.locale']);
      expect(String(stamps[0]?.['s']).endsWith(`-${device}`)).toBe(true);
      // The key never travels; the id itself is part of each stamp by design (it breaks ties).
      expect(db.readVault().kv.map((e) => e.key)).toEqual(['ui.locale']);
      // A new connection (a restart) with a clock that went BACK still stamps after what is stored.
      const later = new SqliteStoreDb(raw, { ...env, now: () => 1_799_990_000_000 });
      later.kvSet('ui.locale', 'de');
      const newest = String(
        raw.all('SELECT updated_at_hlc AS s FROM kv WHERE key = ?', ['ui.locale'])[0]?.['s'],
      );
      expect(newest > String(stamps[0]?.['s'])).toBe(true);
      expect(later.kvGet('sync.deviceId')).toBe(device);
    }, env);
  });

  it('refuses a row without a uid, in every synced table', async () => {
    await withDb((_db, raw) => {
      const bare: Record<string, string> = {
        plate_log: "INSERT INTO plate_log (logged_at_utc) VALUES ('x')",
        food_entry:
          "INSERT INTO food_entry (plate_log_id, source_ref, display_name, source, quantity_low, quantity_high, quantity_unit, quantity_display_label) VALUES (1, 'a', 'a', 'manual', '1', '1', 'u', 'l')",
        coach_note:
          "INSERT INTO coach_note (plate_log_id, anchor, question_key, note_text, generated_at) VALUES (1, 'a', 'k', 't', 'x')",
        coach_interaction:
          "INSERT INTO coach_interaction (coach_note_id, kind, at) VALUES (1, 'k', 'x')",
        saved_meal: "INSERT INTO saved_meal (name, created_at_utc) VALUES ('n', 'x')",
        saved_meal_item:
          "INSERT INTO saved_meal_item (saved_meal_id, position, source_ref, display_name, source, quantity_low, quantity_high, quantity_unit, quantity_display_label) VALUES (1, 0, 'a', 'a', 'manual', '1', '1', 'u', 'l')",
        recipe: "INSERT INTO recipe (name, servings, created_at_utc) VALUES ('n', 1, 'x')",
        recipe_item:
          "INSERT INTO recipe_item (recipe_id, position, source_ref, display_name, source, quantity_low, quantity_high, quantity_unit, quantity_display_label) VALUES (1, 0, 'a', 'a', 'manual', '1', '1', 'u', 'l')",
      };
      for (const [table, sql] of Object.entries(bare)) {
        expect(() => raw.run(sql), table).toThrow(/uid is required/);
      }
    });
  });

  it('the device id exists as soon as the store is open, before any write', async () => {
    await withDb((db) => {
      expect(db.kvGet('sync.deviceId')).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  it('a restart does not issue a smaller uid than one stored, nor build on an absurd stamp', async () => {
    const base = 1_800_000_000_000;
    await withDb((first, raw) => {
      first.insertPlate('2026-08-16T12:00:00.000Z', [entry('A')]);
      first.kvSet('ui.locale', 'en');
      // The wall clock is now an hour behind what is stored.
      const back: VaultEnv = { ...seededEnv(), now: () => base - 3_600_000 };
      const second = new SqliteStoreDb(raw, back);
      second.insertPlate('2026-08-16T13:00:00.000Z', [entry('B')]);
      const uids = raw.all('SELECT uid FROM plate_log ORDER BY id').map((r) => String(r['uid']));
      expect(uids[1] && uids[0] && uids[1] > uids[0]).toBe(true);
      // A stamp planted far in the future (a damaged store) is not built on.
      raw.run(
        "INSERT INTO tombstone (uid, table_name, deleted_at_hlc) VALUES (?, 'plate_log', ?)",
        ['00000000-0000-7000-8000-0000000000ee', '9000000000000-0000-bbbbbbbbbbbbbbbb'],
      );
      const third = new SqliteStoreDb(raw, { ...seededEnv(), now: () => base });
      third.kvSet('ui.locale', 'fr');
      const stamp = String(
        raw.all("SELECT updated_at_hlc AS s FROM kv WHERE key = 'ui.locale'")[0]?.['s'],
      );
      expect(stamp.startsWith(String(base))).toBe(true);
    }, seededEnv());
  });

  it('a tombstone for a device-only key is never read into a snapshot', async () => {
    await withDb((db, raw) => {
      raw.run(
        "INSERT INTO tombstone (uid, table_name, deleted_at_hlc) VALUES ('kv:ai.byokKey', 'kv', '0000000000001-0000-bbbbbbbbbbbbbbbb')",
      );
      raw.run(
        "INSERT INTO tombstone (uid, table_name, deleted_at_hlc) VALUES ('kv:ui.locale', 'kv', '0000000000001-0000-bbbbbbbbbbbbbbbb')",
      );
      expect(db.readVault().tombstones.map((t) => t.uid)).toEqual(['kv:ui.locale']);
    });
  });

  it('the same uid may be tombstoned as two kinds in the table, but is looked up by kind', async () => {
    await withDb((_db, raw) => {
      raw.run(
        "INSERT INTO tombstone VALUES ('00000000-0000-7000-8000-0000000000aa', 'plate_log', '0000000000001-0000-bbbbbbbbbbbbbbbb')",
      );
      raw.run(
        "INSERT INTO tombstone VALUES ('00000000-0000-7000-8000-0000000000aa', 'food_entry', '0000000000002-0000-bbbbbbbbbbbbbbbb')",
      );
      expect(() =>
        raw.run(
          "INSERT INTO tombstone VALUES ('00000000-0000-7000-8000-0000000000aa', 'food_entry', 'x')",
        ),
      ).toThrow();
    });
  });

  it('uids and stamps come from the injected clock and random source', async () => {
    await withDb((db) => {
      db.insertPlate('2026-08-16T12:00:00.000Z', [entry('A'), entry('B')]);
      const snapshot = db.readVault();
      const prefix = (1_800_000_000_000).toString(16).padStart(12, '0');
      const [first, second] = snapshot.plates[0]?.entries ?? [];
      expect(first?.uid.replace(/-/g, '').startsWith(prefix)).toBe(true);
      expect((first?.uid ?? '') < (second?.uid ?? '')).toBe(true);
    }, seededEnv());
  });
});
