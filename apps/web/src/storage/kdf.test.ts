// Port of web_kdf_test.dart. The production KDF is WebCrypto's PBKDF2; these are the published
// PBKDF2-HMAC-SHA256 vectors (the RFC 6070 inputs with SHA-256, cross-checked against Python's
// hashlib.pbkdf2_hmac), so a wrong construction cannot hide behind a self-consistent test.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hexEncode } from './bytes';
import {
  DEFAULT_KDF_PARAMS,
  deriveKeyWithWebCrypto,
  isSecureCryptoAvailable,
  KDF_ITERATIONS,
  KDF_MIN_ITERATIONS,
  KDF_PBKDF2_SHA256,
  SESSION_KEY_BYTES,
  STORE_SALT_BYTES,
} from './kdf';
import { StoreUnavailableError } from './errors';

const utf8 = (s: string) => new TextEncoder().encode(s);
const derive = async (password: string, salt: string, iterations: number) =>
  hexEncode(
    await deriveKeyWithWebCrypto(utf8(password), utf8(salt), {
      name: KDF_PBKDF2_SHA256,
      iterations,
    }),
  );

afterEach(() => vi.unstubAllGlobals());

describe('PBKDF2-HMAC-SHA256 published vectors', () => {
  it.each([
    [1, '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b'],
    [2, 'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43'],
    [4096, 'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a'],
  ])('c=%i, dkLen=32', async (iterations, expected) => {
    expect(await derive('password', 'salt', iterations)).toBe(expected);
  });

  it('the production cost (600,000 iterations)', async () => {
    const salt = Uint8Array.from({ length: 16 }, (_, i) => i);
    const key = await deriveKeyWithWebCrypto(utf8('correct horse battery staple'), salt, {
      name: KDF_PBKDF2_SHA256,
      iterations: KDF_ITERATIONS,
    });
    expect(hexEncode(key)).toBe('ef177144eec9420cbc1093d2a8b344a92bc506d0d4ec9c028dd19f8324d8c1e6');
  });
});

describe('production parameters', () => {
  it('are at least the OWASP PBKDF2-SHA256 floor and 32-byte keys', () => {
    expect(KDF_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    expect(KDF_MIN_ITERATIONS).toBe(600_000);
    expect(SESSION_KEY_BYTES).toBe(32);
    expect(STORE_SALT_BYTES).toBe(16);
    expect(DEFAULT_KDF_PARAMS).toEqual({ name: 'pbkdf2-hmac-sha256', iterations: 600_000 });
  });

  it('refuses an unknown KDF name', async () => {
    await expect(
      deriveKeyWithWebCrypto(utf8('p'), utf8('s'), { name: 'md5', iterations: 600_000 }),
    ).rejects.toBeInstanceOf(StoreUnavailableError);
  });

  it('reports an insecure context (no crypto.subtle) as unavailable, never as a wrong passphrase', async () => {
    vi.stubGlobal('crypto', {});
    expect(isSecureCryptoAvailable()).toBe(false);
    await expect(derive('password', 'salt', 1)).rejects.toMatchObject({
      reason: 'insecureContext',
    });
  });
});
