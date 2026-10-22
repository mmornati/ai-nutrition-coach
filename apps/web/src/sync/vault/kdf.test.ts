// The KDF step against known answers. The served Argon2id build (the very file the worker loads)
// must reproduce the reference vector, and agree with Node's own implementation on the parameters
// the backup uses; a re-pin that changed the algorithm's output would fail here.
import { argon2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { BACKUP_KDF, BACKUP_KDF as COST } from '@anc/core';
import { ARGON2_FILE, ARGON2_VERSION } from './argon2-pin';
import { deriveBackupKey, backupKeyFromMaster, type VaultKdf } from './kdf';
import { constantKdf, fastKdf } from './testing';

interface HashWasm {
  argon2id(options: {
    password: Uint8Array | string;
    salt: Uint8Array | string;
    iterations: number;
    memorySize: number;
    parallelism: number;
    hashLength: number;
    outputType: 'binary';
  }): Promise<Uint8Array>;
}

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const utf8 = (text: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;

let hashwasm: HashWasm;
beforeAll(() => {
  // The worker `import()`s this file as a module; evaluating it as a classic script is the same
  // code path for the UMD wrapper (it finds no `exports` or `define` and sets globalThis.hashwasm).
  const file = resolve(__dirname, `../../../public/argon2/${ARGON2_VERSION}/${ARGON2_FILE}`);
  runInThisContext(readFileSync(file, 'utf8'));
  hashwasm = (globalThis as unknown as { hashwasm: HashWasm }).hashwasm;
});

describe('the served Argon2id build', () => {
  it('reproduces the reference vector (argon2id, t=2, m=65536, p=1, "password" / "somesalt")', async () => {
    const out = await hashwasm.argon2id({
      password: 'password',
      salt: 'somesalt',
      iterations: 2,
      memorySize: 65_536,
      parallelism: 1,
      hashLength: 32,
      outputType: 'binary',
    });
    expect(hex(out)).toBe('09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7');
  });

  it("agrees with Node's argon2 on the backup's own cost (m=64 MiB, t=3, p=1)", async () => {
    const password = utf8('correct horse battery staple');
    const salt = Uint8Array.from({ length: 16 }, (_, i) => i * 7 + 1);
    const ours = await hashwasm.argon2id({
      password,
      salt,
      iterations: COST.t,
      memorySize: COST.m,
      parallelism: COST.p,
      hashLength: 32,
      outputType: 'binary',
    });
    const node = argon2Sync('argon2id', {
      message: password,
      nonce: salt,
      passes: COST.t,
      memory: COST.m,
      parallelism: COST.p,
      tagLength: 32,
    });
    expect(hex(ours)).toBe(hex(node));
    expect(ours).toHaveLength(32);
  }, 60_000);
});

describe('deriveBackupKey', () => {
  const salt = new Uint8Array(16).fill(3);

  it('makes a non-extractable AES-256-GCM key', async () => {
    const key = await deriveBackupKey(fastKdf, 'a long enough passphrase', salt, BACKUP_KDF);
    expect(key.type).toBe('secret');
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
    expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt']);
  });

  it('hands the KDF the NFC UTF-8 bytes, the salt and the cost, and wipes its buffer afterwards', async () => {
    let seen: Parameters<VaultKdf>[0] | null = null;
    const spy: VaultKdf = (request) => {
      seen = request;
      return constantKdf(request);
    };
    // "é" typed decomposed (e + U+0301) is the same passphrase as the composed form.
    await deriveBackupKey(spy, 'café au lait tonight', salt, BACKUP_KDF);
    const request = seen as unknown as Parameters<VaultKdf>[0];
    expect(request.salt).toEqual(salt);
    expect([request.memoryKib, request.passes, request.parallelism]).toEqual([65_536, 3, 1]);
    // Wiped once it was used (a worker KDF takes the buffer over instead).
    expect([...request.passphrase].every((b) => b === 0)).toBe(true);
  });

  it('survives a KDF that took the passphrase buffer over (transferred, so detached and unwritable)', async () => {
    const taking: VaultKdf = (request) => {
      structuredClone(request.passphrase.buffer, { transfer: [request.passphrase.buffer] });
      expect(request.passphrase.length).toBe(0);
      return constantKdf(request);
    };
    const key = await deriveBackupKey(taking, 'a long enough passphrase', salt, BACKUP_KDF);
    expect(key.type).toBe('secret');
  });

  it('is HKDF-separated: the same master key opens nothing outside this purpose', async () => {
    // The key is derived with the info string, so it is not the raw master key.
    const master = new Uint8Array(32).fill(7);
    const a = await backupKeyFromMaster(master);
    const raw = await globalThis.crypto.subtle.importKey('raw', master, 'AES-GCM', false, [
      'encrypt',
    ]);
    const iv = new Uint8Array(12);
    const sealedWithDerived = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      a,
      utf8('x'),
    );
    const sealedWithRaw = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      raw,
      utf8('x'),
    );
    expect(hex(new Uint8Array(sealedWithDerived))).not.toBe(hex(new Uint8Array(sealedWithRaw)));
  });

  it('a KDF that fails, or answers the wrong length, fails the derivation', async () => {
    await expect(
      deriveBackupKey(
        () => Promise.reject(new Error('no memory')),
        'a long enough passphrase',
        salt,
        BACKUP_KDF,
      ),
    ).rejects.toThrow();
    await expect(
      deriveBackupKey(
        () => Promise.resolve(new Uint8Array(16)),
        'a long enough passphrase',
        salt,
        BACKUP_KDF,
      ),
    ).rejects.toThrow();
  });
});
