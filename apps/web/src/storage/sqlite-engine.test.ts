// The real engine (sqlite3mc ChaCha20-Poly1305, the production SQL, the production key attach and
// schema code) on the wasm build's in-memory file system. Ports of sqlite_key_attach_test,
// schema_migration_test (new schema only), the encryption tests of web_store_controller_test and
// the delete-cascade and resilience tests; the OPFS persistence itself is covered in the browser by
// e2e/storage.spec.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { DATABASE_FILENAME, PINNED_CIPHER, SCHEMA_VERSION } from './constants';
import { SchemaTooNewError, StoreOpenError, StoreUnavailableError } from './errors';
import type { EntryInsert, EntryRow } from './ops';
import { passphraseBytes } from './passphrase';
import { mapPlateRows } from './row-mapping';
import { TABLE_NAMES } from './schema';
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
      ]);
      const indexes = raw
        .all(
          "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name",
        )
        .map((r) => r['name']);
      expect(indexes).toEqual([
        'idx_entry_plate',
        'idx_note_plate',
        'idx_plate_logged_at',
        'idx_recipe_item_recipe',
        'idx_saved_meal_item_meal',
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
      // No sync table: v1 has no transport.
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
    raw.run("INSERT INTO plate_log (logged_at_utc) VALUES ('2026-08-16T12:00:00.000Z')");
    raw.run(
      `INSERT INTO food_entry (plate_log_id, source_ref, display_name, source, food_group,
         quantity_low, quantity_high, quantity_unit, quantity_display_label)
       VALUES (1, 'manual:old', 'Old', 'manual', 'other', '1', '2', 'piece', '~1')`,
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
    expect(check.all('PRAGMA user_version')[0]?.['user_version']).toBe(3);
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
      raw.run("INSERT INTO plate_log (logged_at_utc) VALUES ('not-a-date')");
      const good = db.insertPlate('2026-01-02T00:00:00.000Z', [entry('G')]).plateId;
      raw.run(
        `INSERT INTO food_entry (plate_log_id, source_ref, display_name, source, quantity_low, quantity_high, quantity_unit, quantity_display_label)
         VALUES (${good}, 'manual:x', 'X', 'manual', 'NaN', '2', 'piece', '~1'), (${good}, 'manual:x', 'X', 'manual', '1', 'Infinity', 'piece', '~1')`,
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
