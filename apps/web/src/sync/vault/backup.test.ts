// The encrypted backup end to end, with a fast stand-in for the KDF (the real one is exercised in
// kdf.test.ts and by the e2e): seal and open, and every way a file can be wrong. Whatever is
// wrong, the answer is a typed outcome and never a partial snapshot.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BACKUP_KDF,
  canonicalizeSnapshot,
  decodeBase64Url,
  ENVELOPE_LIMITS,
  encodeBase64Url,
  serializeEnvelope,
  type VaultEnvelope,
  type VaultSnapshot,
} from '@anc/core';
import { seedPlate, unlockedBundle } from '../../app/testing';
import { createBackupService, looksLikeEnvelopeText, type BackupService } from './backup';
import { sealEnvelope } from './envelope';
import { gzip } from './gzip';
import { backupKeyFromMaster, type VaultKdf } from './kdf';
import { readBackupFile } from './read-file';
import { constantKdf, fastBackupService, fastKdf } from './testing';

const PASSPHRASE = 'a long enough passphrase';
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

let snapshot: VaultSnapshot;
beforeAll(async () => {
  const bundle = await unlockedBundle();
  await seedPlate(bundle, Date.now(), [
    ['Salmon', 'protein'],
    ['Broccoli', 'vegFruit'],
  ]);
  await seedPlate(bundle, Date.now() - 86_400_000, [['Rice', 'starch']]);
  const read = await bundle.vault.readSnapshot();
  if (read.kind !== 'vault') throw new Error('could not read the snapshot');
  snapshot = read.value;
});

const sealed = async (service: BackupService = fastBackupService()): Promise<Uint8Array> => {
  const result = await service.seal(snapshot, PASSPHRASE);
  if (result.kind !== 'sealed') throw new Error('could not seal');
  return result.bytes;
};
const envelopeOf = (bytes: Uint8Array): Record<string, unknown> =>
  JSON.parse(text(bytes)) as Record<string, unknown>;
const fileOf = (envelope: unknown): Uint8Array => utf8(JSON.stringify(envelope));
const open = (bytes: Uint8Array, passphrase = PASSPHRASE, service = fastBackupService()) =>
  service.open(bytes, passphrase);

describe('seal and open', () => {
  it('round-trips the snapshot exactly', async () => {
    const result = await open(await sealed());
    expect(result.kind).toBe('opened');
    if (result.kind !== 'opened') return;
    expect(result.snapshot).toEqual(canonicalizeSnapshot(snapshot));
    expect(result.snapshot.plates).toHaveLength(2);
  });

  it('writes the documented envelope and nothing readable', async () => {
    const bytes = await sealed();
    const envelope = envelopeOf(bytes);
    expect(Object.keys(envelope)).toEqual([
      'v',
      'vaultId',
      'version',
      'alg',
      'kdf',
      'salt',
      'nonce',
      'ct',
    ]);
    expect(envelope['v']).toBe(1);
    expect(envelope['version']).toBe(1);
    expect(envelope['alg']).toBe('A256GCM');
    expect(envelope['kdf']).toEqual({ name: 'argon2id', v: 19, m: 65_536, t: 3, p: 1 });
    expect(decodeBase64Url(envelope['vaultId'] as string)).toHaveLength(16);
    expect(decodeBase64Url(envelope['salt'] as string)).toHaveLength(16);
    expect(decodeBase64Url(envelope['nonce'] as string)).toHaveLength(12);
    for (const secret of ['Salmon', 'Broccoli', 'plates', 'protein', PASSPHRASE]) {
      expect(text(bytes)).not.toContain(secret);
    }
    expect(bytes.length).toBeLessThan(ENVELOPE_LIMITS.maxFileBytes);
  });

  it('every file is its own: fresh vault id, salt and nonce each time', async () => {
    const a = envelopeOf(await sealed());
    const b = envelopeOf(await sealed());
    for (const field of ['vaultId', 'salt', 'nonce', 'ct']) {
      expect(a[field], field).not.toBe(b[field]);
    }
  });

  it('the same visible passphrase opens it whatever the keyboard composed (NFC)', async () => {
    const service = fastBackupService();
    const composed = await service.seal(snapshot, 'café au lait tonight');
    if (composed.kind !== 'sealed') throw new Error('seal');
    expect((await service.open(composed.bytes, 'café au lait tonight')).kind).toBe('opened');
  });

  it('seals with a stable canonical form: equal snapshots, equal plaintext', async () => {
    const shuffled: VaultSnapshot = { ...snapshot, plates: [...snapshot.plates].reverse() };
    const a = await open(await sealed());
    const service = fastBackupService();
    const other = await service.seal(shuffled, PASSPHRASE);
    if (other.kind !== 'sealed') throw new Error('seal');
    const b = await open(other.bytes);
    expect(a).toEqual(b);
  });

  it('a KDF that cannot run is "unavailable", on seal and on open, never a wrong passphrase', async () => {
    const broken: VaultKdf = () => Promise.reject(new Error('no wasm'));
    const bytes = await sealed();
    expect((await createBackupService({ kdf: broken }).open(bytes, PASSPHRASE)).kind).toBe(
      'unavailable',
    );
    expect((await createBackupService({ kdf: broken }).seal(snapshot, PASSPHRASE)).kind).toBe(
      'unavailable',
    );
  });

  it('wipes the passphrase bytes it handed the KDF', async () => {
    const buffers: Uint8Array[] = [];
    const spy: VaultKdf = (request) => {
      buffers.push(request.passphrase);
      return fastKdf(request);
    };
    await createBackupService({ kdf: spy }).seal(snapshot, PASSPHRASE);
    expect(buffers).toHaveLength(1);
    expect([...buffers[0]!].every((b) => b === 0)).toBe(true);
  });
});

describe('a wrong passphrase or a damaged file (not told apart)', () => {
  it('a wrong passphrase', async () => {
    expect((await open(await sealed(), 'a different long passphrase')).kind).toBe(
      'wrongPassphraseOrDamaged',
    );
    expect((await open(await sealed(), '')).kind).toBe('wrongPassphraseOrDamaged');
  });

  const flipByte = (b64: string, index: number): string => {
    const bytes = decodeBase64Url(b64)!;
    bytes[index] = bytes[index]! ^ 0x01;
    return encodeBase64Url(bytes);
  };

  it('a changed byte anywhere in the ciphertext (first, middle, tag)', async () => {
    const original = envelopeOf(await sealed());
    const length = decodeBase64Url(original['ct'] as string)!.length;
    for (const index of [0, Math.floor(length / 2), length - 1]) {
      const tampered = { ...original, ct: flipByte(original['ct'] as string, index) };
      expect((await open(fileOf(tampered))).kind, `byte ${index}`).toBe('wrongPassphraseOrDamaged');
    }
  });

  it('a changed nonce', async () => {
    const original = envelopeOf(await sealed());
    const tampered = { ...original, nonce: flipByte(original['nonce'] as string, 0) };
    expect((await open(fileOf(tampered))).kind).toBe('wrongPassphraseOrDamaged');
  });

  it('a truncated ciphertext', async () => {
    const original = envelopeOf(await sealed());
    const ct = decodeBase64Url(original['ct'] as string)!;
    const tampered = { ...original, ct: encodeBase64Url(ct.slice(0, ct.length - 5)) };
    expect((await open(fileOf(tampered))).kind).toBe('wrongPassphraseOrDamaged');
  });
});

describe('the header is authenticated (associated data)', () => {
  // A KDF that ignores salt, cost and passphrase isolates the header: the key is identical, so only
  // the associated data can reject an edited field.
  const service = createBackupService({ kdf: constantKdf });
  const sealWithConstantKey = async (): Promise<Record<string, unknown>> => {
    const result = await service.seal(snapshot, PASSPHRASE);
    if (result.kind !== 'sealed') throw new Error('seal');
    return envelopeOf(result.bytes);
  };

  it('control: the untouched file opens', async () => {
    const original = await sealWithConstantKey();
    expect((await service.open(fileOf(original), PASSPHRASE)).kind).toBe('opened');
  });

  it.each([
    [
      'vaultId (swapping in another vault)',
      { vaultId: encodeBase64Url(new Uint8Array(16).fill(9)) },
    ],
    ['version (replaying under another version)', { version: 2 }],
    ['salt', { salt: encodeBase64Url(new Uint8Array(16).fill(9)) }],
    ['nonce', { nonce: encodeBase64Url(new Uint8Array(12).fill(9)) }],
  ])('an edited %s fails authentication', async (_name, patch) => {
    const original = await sealWithConstantKey();
    expect((await service.open(fileOf({ ...original, ...patch }), PASSPHRASE)).kind).toBe(
      'wrongPassphraseOrDamaged',
    );
  });

  it.each([
    ['a stronger-looking memory cost', { m: 65_537 }],
    ['a stronger-looking pass count', { t: 4 }],
  ])('an edited KDF (%s) fails authentication', async (_name, patch) => {
    const original = await sealWithConstantKey();
    const kdf = { ...(original['kdf'] as object), ...patch };
    expect((await service.open(fileOf({ ...original, kdf }), PASSPHRASE)).kind).toBe(
      'wrongPassphraseOrDamaged',
    );
  });

  it('key order in the file is irrelevant to the associated data', async () => {
    const original = await sealWithConstantKey();
    const reordered = Object.fromEntries(Object.entries(original).reverse());
    expect((await service.open(fileOf(reordered), PASSPHRASE)).kind).toBe('opened');
  });
});

describe('the envelope parser guards the door', () => {
  const never = vi.fn(fastKdf);
  const guarded = createBackupService({ kdf: never });
  const refused = async (file: Uint8Array) => {
    never.mockClear();
    const result = await guarded.open(file, PASSPHRASE);
    expect(never, 'no key derivation for a refused file').not.toHaveBeenCalled();
    return result;
  };

  it('refuses a KDF downgrade before deriving anything', async () => {
    const original = envelopeOf(await sealed());
    const withKdf = (patch: object) =>
      fileOf({ ...original, kdf: { ...(original['kdf'] as object), ...patch } });
    for (const patch of [{ m: 32_768 }, { m: 8 }, { t: 2 }, { t: 1 }]) {
      expect(await refused(withKdf(patch)), JSON.stringify(patch)).toEqual({
        kind: 'notABackup',
        problem: 'kdfDowngrade',
      });
    }
  });

  it('refuses an absurd KDF cost before deriving anything', async () => {
    const original = envelopeOf(await sealed());
    const withKdf = (patch: object) =>
      fileOf({ ...original, kdf: { ...(original['kdf'] as object), ...patch } });
    for (const patch of [{ m: 4_194_304 }, { m: 262_145 }, { t: 11 }, { t: 1_000_000 }]) {
      expect(await refused(withKdf(patch)), JSON.stringify(patch)).toEqual({
        kind: 'notABackup',
        problem: 'kdfTooCostly',
      });
    }
  });

  it('refuses extra and missing fields, and non-canonical base64url', async () => {
    const original = envelopeOf(await sealed());
    expect(await refused(fileOf({ ...original, extra: 1 }))).toEqual({
      kind: 'notABackup',
      problem: 'malformed',
    });
    const withoutSalt = { ...original };
    delete withoutSalt['salt'];
    expect(await refused(fileOf(withoutSalt))).toEqual({
      kind: 'notABackup',
      problem: 'malformed',
    });
    expect(await refused(fileOf({ ...original, ct: `${original['ct'] as string}==` }))).toEqual({
      kind: 'notABackup',
      problem: 'malformed',
    });
    expect(
      await refused(
        fileOf({ ...original, ct: (original['ct'] as string).replace(/[-_]/g, '+') + '+' }),
      ),
    ).toEqual({ kind: 'notABackup', problem: 'malformed' });
  });

  it('is not fooled by things that are not backups at all', async () => {
    for (const bytes of [
      new Uint8Array(0),
      utf8('plates,csv,export\n1,2,3\n'),
      utf8('{"not":"a backup"}'),
      utf8('[]'),
      utf8('null'),
      Uint8Array.of(0xff, 0xfe, 0x00, 0x80),
      utf8(JSON.stringify(snapshot)),
    ]) {
      const result = await refused(bytes);
      expect(result.kind).toBe('notABackup');
    }
  });

  it('looks at the shape before parsing: deep nesting, floods of brackets, a leading array', async () => {
    const hostile = [
      '['.repeat(2_000_000),
      `{"a":${'['.repeat(100_000)}`,
      `{"v":1,"x":{"y":{"z":1}}}`,
      `[${JSON.stringify(Object.fromEntries([['v', 1]]))}]`,
      ` ${JSON.stringify(envelopeOf(await sealed()))}`,
      `{"v":1,"a":[1],"b":[2],"c":[3],"d":[4]}`,
    ];
    for (const text of hostile) {
      expect(looksLikeEnvelopeText(text), text.slice(0, 20)).toBe(false);
      expect(await refused(utf8(text)), text.slice(0, 20)).toEqual({
        kind: 'notABackup',
        problem: 'notJson',
      });
    }
    // A brace inside a string does not count; a real file passes.
    expect(looksLikeEnvelopeText('{"a":"{{{{{[[[[[","b":"\\"[["}')).toBe(true);
    expect(looksLikeEnvelopeText(text(await sealed()))).toBe(true);
  });

  it('names a file from a newer format', async () => {
    const original = envelopeOf(await sealed());
    expect(await refused(fileOf({ ...original, v: 2, somethingNew: true }))).toEqual({
      kind: 'schemaTooNew',
    });
  });

  it('refuses a file over the size cap before reading any of it, and a picker file by its size', async () => {
    expect(await refused(new Uint8Array(ENVELOPE_LIMITS.maxFileBytes + 1))).toEqual({
      kind: 'tooLarge',
    });
    const arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const huge = { size: ENVELOPE_LIMITS.maxFileBytes + 1, arrayBuffer } as unknown as Blob;
    expect(await readBackupFile(huge)).toEqual({ kind: 'tooLarge' });
    expect(arrayBuffer).not.toHaveBeenCalled();
    const small = new Blob([Uint8Array.of(1, 2, 3)]);
    expect(await readBackupFile(small)).toEqual({ kind: 'read', bytes: Uint8Array.of(1, 2, 3) });
    const unreadable = {
      size: 3,
      arrayBuffer: () => Promise.reject(new Error('io')),
    } as unknown as Blob;
    expect(await readBackupFile(unreadable)).toEqual({ kind: 'unreadable' });
  });

  it('refuses a ciphertext past its bound by the length of the text alone', async () => {
    const original = envelopeOf(await sealed());
    const bound = Math.ceil((ENVELOPE_LIMITS.maxCiphertextBytes * 4) / 3);
    const result = await refused(fileOf({ ...original, ct: 'A'.repeat(bound + 1) }));
    expect(result).toEqual({ kind: 'tooLarge' });
  });
});

describe('authentic, but not a backup we can use', () => {
  const key = () => backupKeyFromMaster(new Uint8Array(32).fill(7));
  const service = createBackupService({ kdf: constantKdf });

  /** A file that really is encrypted with the key (so it authenticates) around any plaintext. */
  const around = async (plaintext: Uint8Array): Promise<Uint8Array> => {
    const envelope: VaultEnvelope = await sealEnvelope({
      key: await key(),
      vaultId: new Uint8Array(16).fill(1),
      version: 1,
      kdf: BACKUP_KDF,
      salt: new Uint8Array(16).fill(2),
      nonce: crypto.getRandomValues(new Uint8Array(12)),
      plaintext,
    });
    return utf8(serializeEnvelope(envelope));
  };
  const withJson = async (value: unknown): Promise<Uint8Array> =>
    around(await gzip(utf8(JSON.stringify(value))));

  it('control: a real snapshot opens', async () => {
    const file = await withJson(canonicalizeSnapshot(snapshot));
    expect((await service.open(file, PASSPHRASE)).kind).toBe('opened');
  });

  it('JSON that is not a snapshot', async () => {
    for (const value of [{ hello: 'world' }, [], 7, null, { ...snapshot, plates: 'x' }]) {
      expect((await service.open(await withJson(value), PASSPHRASE)).kind).toBe('invalidContent');
    }
  });

  it('a snapshot the strict parser refuses (an unknown field, a bad uid)', async () => {
    const extra = { ...canonicalizeSnapshot(snapshot), extra: true };
    expect((await service.open(await withJson(extra), PASSPHRASE)).kind).toBe('invalidContent');
    const badUid = canonicalizeSnapshot({
      ...snapshot,
      plates: snapshot.plates.map((p, i) => (i === 0 ? { ...p, uid: 'nope' } : p)),
    });
    expect((await service.open(await withJson(badUid), PASSPHRASE)).kind).toBe('invalidContent');
  });

  it('plaintext that is not gzip, not UTF-8 or not JSON', async () => {
    expect((await service.open(await around(utf8('{"plain":1}')), PASSPHRASE)).kind).toBe(
      'invalidContent',
    );
    expect((await service.open(await around(Uint8Array.of(1, 2, 3)), PASSPHRASE)).kind).toBe(
      'invalidContent',
    );
    expect(
      (await service.open(await around(await gzip(Uint8Array.of(0xff, 0xfe, 0xfd))), PASSPHRASE))
        .kind,
    ).toBe('invalidContent');
    expect((await service.open(await around(await gzip(utf8('not json'))), PASSPHRASE)).kind).toBe(
      'invalidContent',
    );
  });

  it('a snapshot from a newer schema or snapshot version says "newer", not "invalid"', async () => {
    const canonical = canonicalizeSnapshot(snapshot);
    const newerSchema = { ...canonical, schemaVersion: canonical.schemaVersion + 1 };
    expect((await service.open(await withJson(newerSchema), PASSPHRASE)).kind).toBe('schemaTooNew');
    // Even when the newer store has fields this parser would call malformed.
    const withNewField = { ...newerSchema, brandNewTable: [] };
    expect((await service.open(await withJson(withNewField), PASSPHRASE)).kind).toBe(
      'schemaTooNew',
    );
    const newerSnapshot = { ...canonical, snapshotVersion: 2 };
    expect((await service.open(await withJson(newerSnapshot), PASSPHRASE)).kind).toBe(
      'schemaTooNew',
    );
  });

  it('a gzip bomb: stops at the decompressed cap and keeps nothing', async () => {
    // A hundred-odd megabytes of zeros compress to about a hundred kilobytes.
    const zeros = new Uint8Array(ENVELOPE_LIMITS.maxPlaintextBytes + 1_048_576);
    const bomb = await gzip(zeros);
    expect(bomb.length).toBeLessThan(1_000_000);
    expect((await service.open(await around(bomb), PASSPHRASE)).kind).toBe('tooLarge');
  }, 60_000);
});
