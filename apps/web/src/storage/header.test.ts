// Port of the earlier client.
import { describe, expect, it } from 'vitest';
import { base64UrlEncode } from './bytes';
import { STORE_FORMAT_VERSION } from './constants';
import { createStoreMeta, encodeStoreMeta, parseStoreMeta, PASSPHRASE_ENCODING } from './header';
import { DEFAULT_KDF_PARAMS, KDF_ITERATIONS, KDF_MAX_ITERATIONS, KDF_PBKDF2_SHA256 } from './kdf';

const salt = (length = 16) => Uint8Array.from({ length }, (_, i) => i + 1);

describe('the store header', () => {
  it('is absent when nothing is stored', () => {
    expect(parseStoreMeta(null)).toEqual({ kind: 'absent' });
  });

  it('round-trips salt, KDF name, iterations and version', () => {
    const meta = createStoreMeta(DEFAULT_KDF_PARAMS, salt());
    const read = parseStoreMeta(encodeStoreMeta(meta));
    expect(read.kind).toBe('present');
    if (read.kind !== 'present') return;
    expect([...read.meta.salt]).toEqual([...salt()]);
    expect(read.meta.kdf).toEqual(DEFAULT_KDF_PARAMS);
    expect(read.meta.version).toBe(STORE_FORMAT_VERSION);
  });

  it('is exactly the documented shape', () => {
    const parsed = JSON.parse(encodeStoreMeta(createStoreMeta(DEFAULT_KDF_PARAMS, salt())));
    expect(parsed).toEqual({
      v: 1,
      kdf: 'pbkdf2-hmac-sha256',
      iter: 600_000,
      pw: 'nfc-utf8',
      salt: base64UrlEncode(salt()),
    });
    expect(parsed.salt).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('accepts a padded base64url salt too (the earlier spelling)', () => {
    const padded = base64UrlEncode(salt()) + '==';
    const raw = JSON.stringify({
      v: 1,
      kdf: KDF_PBKDF2_SHA256,
      iter: KDF_ITERATIONS,
      pw: PASSPHRASE_ENCODING,
      salt: padded,
    });
    expect(parseStoreMeta(raw).kind).toBe('present');
  });

  const good = {
    v: 1,
    kdf: KDF_PBKDF2_SHA256,
    iter: KDF_ITERATIONS,
    pw: 'nfc-utf8',
    salt: base64UrlEncode(salt()),
  };

  it.each([
    ['not json', 'not json'],
    ['an array', '[]'],
    ['a bare version', JSON.stringify({ v: 1 })],
    ['an unknown version', JSON.stringify({ ...good, v: 2 })],
    ['an unknown KDF', JSON.stringify({ ...good, kdf: 'md5' })],
    ['a short salt', JSON.stringify({ ...good, salt: base64UrlEncode(salt(4)) })],
    ['downgraded iterations', JSON.stringify({ ...good, iter: 1000 })],
    ['an absurdly expensive iteration count', JSON.stringify({ ...good, iter: 10_000_001 })],
    ['fractional iterations', JSON.stringify({ ...good, iter: 600_000.5 })],
    ['a string iteration count', JSON.stringify({ ...good, iter: '600000' })],
    ['a different passphrase encoding', JSON.stringify({ ...good, pw: 'utf8' })],
    ['a missing passphrase encoding', JSON.stringify({ ...good, pw: undefined })],
    ['a salt that is not base64', JSON.stringify({ ...good, salt: '***not base64***' })],
    ['a truncated document', '{"v":1'],
  ])('refuses %s', (_name, raw) => {
    expect(parseStoreMeta(raw)).toEqual({ kind: 'invalid' });
  });

  it('accepts the upper bound itself', () => {
    const top = JSON.stringify({ ...good, iter: KDF_MAX_ITERATIONS });
    expect(parseStoreMeta(top).kind).toBe('present');
  });

  it('honours an injected floor (tests use a cheap one)', () => {
    const cheap = JSON.stringify({ ...good, iter: 1000 });
    expect(parseStoreMeta(cheap, 1000).kind).toBe('present');
    expect(parseStoreMeta(cheap).kind).toBe('invalid');
  });
});
