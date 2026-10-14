// Port of the earlier client (the mapper part): typed failures, no cause text.
import { describe, expect, it } from 'vitest';
import {
  classifyOpenError,
  fromWireError,
  isProgrammingError,
  mapStoreError,
  SchemaTooNewError,
  SqliteCodeError,
  StoreOpenError,
  StoreOperationError,
  StoreUnavailableError,
  toWireError,
} from './errors';

describe('mapStoreError', () => {
  it('NOTADB and AUTH map to a key failure', () => {
    expect(mapStoreError(new SqliteCodeError(26))).toEqual({
      kind: 'storeFailure',
      reason: 'secureKey',
    });
    expect(mapStoreError(new SqliteCodeError(23)).reason).toBe('secureKey');
  });

  it('other SQLite errors map to a storage-operation failure, not a key failure', () => {
    for (const code of [1, 5, 8, 13, 19]) {
      expect(mapStoreError(new SqliteCodeError(code)).reason).toBe('storeOperation');
    }
  });

  it('a StoreOpenError (lost key / cipher problem) is distinct from a generic storage error', () => {
    for (const reason of ['missingCipher', 'invalidKey', 'keyRejected', 'dataMissing'] as const) {
      expect(mapStoreError(new StoreOpenError(reason)).reason).toBe('secureKey');
    }
    expect(mapStoreError(new StoreOperationError()).reason).toBe('storeOperation');
  });

  it('unknown errors map to a storage-operation failure and carry no text', () => {
    const failure = mapStoreError(new Error('SELECT secret FROM key_material /tmp/path'));
    expect(failure).toEqual({ kind: 'storeFailure', reason: 'storeOperation' });
    expect(JSON.stringify(failure)).not.toContain('secret');
    expect(mapStoreError('a string')).toEqual({ kind: 'storeFailure', reason: 'storeOperation' });
  });

  it('a programming error is recognised so it can surface instead of being relabelled', () => {
    expect(isProgrammingError(new TypeError('x'))).toBe(true);
    expect(isProgrammingError(new RangeError('x'))).toBe(true);
    expect(isProgrammingError(new SqliteCodeError(1))).toBe(false);
    expect(isProgrammingError(new Error('x'))).toBe(false);
  });
});

describe('errors across the worker boundary', () => {
  it('survive the round trip with their reason and nothing else', () => {
    const cases: Error[] = [
      new StoreOpenError('keyRejected'),
      new SchemaTooNewError(7, 1),
      new StoreUnavailableError('noOpfs'),
      new SqliteCodeError(26),
    ];
    for (const original of cases) {
      const wire = toWireError(original);
      expect(JSON.parse(JSON.stringify(wire))).toEqual(wire);
      expect(fromWireError(wire)).toMatchObject({ name: original.name });
    }
    expect(fromWireError(toWireError(new StoreOpenError('dataMissing')))).toMatchObject({
      reason: 'dataMissing',
    });
    expect(fromWireError(toWireError(new SchemaTooNewError(7, 1)))).toMatchObject({
      found: 7,
      supported: 1,
    });
  });

  it('turns a raw SQLite3Error into its primary result code, dropping the message', () => {
    const raw = Object.assign(new Error('SQLITE_NOTADB: PRAGMA hexkey = abcd (key material)'), {
      resultCode: 26,
    });
    expect(toWireError(raw)).toEqual({ kind: 'sqlite', code: 26 });
    const extended = Object.assign(new Error('x'), { resultCode: 26 | (3 << 8) });
    expect(toWireError(extended)).toEqual({ kind: 'sqlite', code: 26 });
    expect(JSON.stringify(toWireError(raw))).not.toContain('abcd');
  });

  it('turns anything else into an anonymous storage error', () => {
    expect(toWireError(new Error('/some/path leaked'))).toEqual({ kind: 'other' });
    expect(toWireError('text')).toEqual({ kind: 'other' });
    expect(fromWireError({ kind: 'other' }).message).not.toContain('path');
  });

  it('error messages are fixed strings (no cause text can ride along)', () => {
    expect(new StoreOpenError('keyRejected').message).toBe('StoreOpenError(keyRejected)');
    expect(new SqliteCodeError(26).message).toBe('SqliteCodeError(26)');
  });
});

describe('classifyOpenError', () => {
  it('classifies each distinct outcome', () => {
    expect(classifyOpenError(new StoreOpenError('keyRejected'))).toEqual({ kind: 'wrongKey' });
    expect(classifyOpenError(new SqliteCodeError(26))).toEqual({ kind: 'wrongKey' });
    expect(classifyOpenError(new StoreOpenError('dataMissing'))).toEqual({ kind: 'dataMissing' });
    expect(classifyOpenError(new SchemaTooNewError(2, 1))).toEqual({ kind: 'newerVersion' });
    expect(classifyOpenError(new StoreOpenError('missingCipher'))).toEqual({
      kind: 'unavailable',
      reason: 'engineMissing',
    });
    expect(classifyOpenError(new StoreUnavailableError('insecureContext'))).toEqual({
      kind: 'unavailable',
      reason: 'insecureContext',
    });
  });

  it('an unrecognised failure is "unavailable", NEVER a wrong passphrase', () => {
    expect(classifyOpenError(new Error('anything'))).toEqual({
      kind: 'unavailable',
      reason: 'storage',
    });
    expect(classifyOpenError(new SqliteCodeError(10))).toEqual({
      kind: 'unavailable',
      reason: 'storage',
    });
  });
});
