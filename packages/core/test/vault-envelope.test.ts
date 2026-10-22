import { describe, expect, it } from 'vitest';
import {
  BACKUP_KDF,
  decodeBase64Url,
  encodeBase64Url,
  ENVELOPE_KEYS,
  ENVELOPE_LIMITS,
  KDF_KEYS,
  envelopeAadText,
  parseVaultEnvelope,
  serializeEnvelope,
  type VaultEnvelope,
} from '../src/index';

const bytes = (length: number, seed = 1): Uint8Array =>
  Uint8Array.from({ length }, (_, i) => (i * 31 + seed) & 0xff);

const good = (): VaultEnvelope => ({
  v: 1,
  vaultId: encodeBase64Url(bytes(16, 1)),
  version: 1,
  alg: 'A256GCM',
  kdf: { ...BACKUP_KDF },
  salt: encodeBase64Url(bytes(16, 2)),
  nonce: encodeBase64Url(bytes(12, 3)),
  ct: encodeBase64Url(bytes(64, 4)),
});

/** A mutable plain copy to break one field at a time. */
const clone = (): Record<string, unknown> =>
  JSON.parse(serializeEnvelope(good())) as Record<string, unknown>;
const problemOf = (input: unknown): string | null => {
  const result = parseVaultEnvelope(input);
  return result.kind === 'vaultEnvelopeInvalid' ? `${result.problem} ${result.path}` : null;
};

describe('base64url', () => {
  it('round-trips every length from 0 to 40', () => {
    for (let n = 0; n <= 40; n++) {
      const data = bytes(n, n);
      const text = encodeBase64Url(data);
      expect(text).not.toMatch(/[=+/]/);
      expect(decodeBase64Url(text)).toEqual(data);
    }
  });

  it('matches the RFC 4648 vectors', () => {
    const enc = (s: string) => encodeBase64Url(new TextEncoder().encode(s));
    expect([enc(''), enc('f'), enc('fo'), enc('foo'), enc('foob'), enc('fooba')]).toEqual([
      '',
      'Zg',
      'Zm8',
      'Zm9v',
      'Zm9vYg',
      'Zm9vYmE',
    ]);
  });

  it('refuses padding, the standard alphabet, whitespace, a bad length and non-canonical tails', () => {
    for (const text of ['Zg==', 'Zm9v+', 'Zm9v/A', 'Zm 9v', 'Zm9v\n', 'Z', 'Zh', 'Zm9', 'é']) {
      expect(decodeBase64Url(text), text).toBeNull();
    }
    // 'Zh' decodes to the same byte as 'Zg' but with stray trailing bits: not canonical.
    expect(decodeBase64Url('Zg')).toEqual(Uint8Array.of(102));
  });
});

describe('parseVaultEnvelope', () => {
  it('reads a well-formed envelope and decodes its binary fields', () => {
    const result = parseVaultEnvelope(clone());
    expect(result.kind).toBe('vaultEnvelopeParsed');
    if (result.kind !== 'vaultEnvelopeParsed') return;
    expect(result.parsed.envelope).toEqual(good());
    expect(result.parsed.salt).toEqual(bytes(16, 2));
    expect(result.parsed.nonce).toEqual(bytes(12, 3));
    expect(result.parsed.ciphertext).toEqual(bytes(64, 4));
  });

  it('the associated data covers every field but ct, with sorted keys', () => {
    const header = good();
    expect(envelopeAadText(header)).toBe(
      `{"alg":"A256GCM","kdf":{"m":65536,"name":"argon2id","p":1,"t":3,"v":19},"nonce":"${header.nonce}","salt":"${header.salt}","v":1,"vaultId":"${header.vaultId}","version":1}`,
    );
    expect(envelopeAadText(header)).not.toContain(header.ct);
    // The serialised file order does not leak into it.
    expect(envelopeAadText(JSON.parse(serializeEnvelope(header)) as VaultEnvelope)).toBe(
      envelopeAadText(header),
    );
  });

  it('the associated data covers EVERY header field: a new field cannot silently miss it', () => {
    const aad = JSON.parse(envelopeAadText(good())) as Record<string, unknown>;
    expect(Object.keys(aad).sort()).toEqual(ENVELOPE_KEYS.filter((k) => k !== 'ct').sort());
    expect(Object.keys(aad['kdf'] as object).sort()).toEqual([...KDF_KEYS].sort());
    // And the file serialiser writes exactly the parsed field set.
    const file = JSON.parse(serializeEnvelope(good())) as Record<string, unknown>;
    expect(Object.keys(file)).toEqual([...ENVELOPE_KEYS]);
    expect(Object.keys(file['kdf'] as object)).toEqual([...KDF_KEYS]);
  });

  it.each([null, 'text', 3, [], undefined])('refuses a non-object: %j', (input) => {
    expect(problemOf(input)).toBe('notAnObject $');
  });

  it('refuses extra and missing fields', () => {
    expect(problemOf({ ...clone(), extra: 1 })).toBe('malformed $');
    for (const key of ['v', 'vaultId', 'version', 'alg', 'kdf', 'salt', 'nonce', 'ct']) {
      const broken = clone();
      delete broken[key];
      expect(problemOf(broken), key).toBe('malformed $');
    }
    const kdf = clone();
    (kdf['kdf'] as Record<string, unknown>)['extra'] = 1;
    expect(problemOf(kdf)).toBe('malformed $.kdf');
    const noP = clone();
    delete (noP['kdf'] as Record<string, unknown>)['p'];
    expect(problemOf(noP)).toBe('malformed $.kdf');
  });

  it('names a newer format, and refuses version 0 and other types', () => {
    expect(problemOf({ ...clone(), v: 2, anything: true })).toBe('newerFormat $.v');
    expect(problemOf({ ...clone(), v: 0 })).toBe('malformed $.v');
    expect(problemOf({ ...clone(), v: '1' })).toBe('malformed $.v');
    expect(problemOf({ ...clone(), v: 1.5 })).toBe('malformed $.v');
  });

  it.each([0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1, null])('refuses version %j', (version) => {
    expect(problemOf({ ...clone(), version })).toBe('malformed $.version');
  });

  it('accepts the largest safe version', () => {
    expect(problemOf({ ...clone(), version: Number.MAX_SAFE_INTEGER })).toBeNull();
  });

  it('refuses another cipher or KDF', () => {
    expect(problemOf({ ...clone(), alg: 'A128GCM' })).toBe('unsupportedAlgorithm $.alg');
    const other = (patch: Record<string, unknown>) => ({
      ...clone(),
      kdf: { ...(clone()['kdf'] as object), ...patch },
    });
    expect(problemOf(other({ name: 'argon2i' }))).toBe('unsupportedAlgorithm $.kdf.name');
    expect(problemOf(other({ v: 16 }))).toBe('unsupportedAlgorithm $.kdf.v');
    expect(problemOf(other({ p: 2 }))).toBe('malformed $.kdf.p');
    expect(problemOf(other({ m: '65536' }))).toBe('malformed $.kdf.m');
    expect(problemOf(other({ t: 3.5 }))).toBe('malformed $.kdf.t');
  });

  it('refuses a KDF downgrade before anything can be derived', () => {
    const other = (patch: Record<string, unknown>) => ({
      ...clone(),
      kdf: { ...(clone()['kdf'] as object), ...patch },
    });
    expect(problemOf(other({ m: 65_535 }))).toBe('kdfDowngrade $.kdf.m');
    expect(problemOf(other({ m: 8 }))).toBe('kdfDowngrade $.kdf.m');
    expect(problemOf(other({ t: 2 }))).toBe('kdfDowngrade $.kdf.t');
    expect(problemOf(other({ t: 0 }))).toBe('kdfDowngrade $.kdf.t');
    expect(problemOf(other({ m: 65_536, t: 3 }))).toBeNull();
  });

  it('refuses an absurd KDF cost', () => {
    const other = (patch: Record<string, unknown>) => ({
      ...clone(),
      kdf: { ...(clone()['kdf'] as object), ...patch },
    });
    expect(problemOf(other({ m: 262_145 }))).toBe('kdfTooCostly $.kdf.m');
    expect(problemOf(other({ m: Number.MAX_SAFE_INTEGER }))).toBe('kdfTooCostly $.kdf.m');
    expect(problemOf(other({ t: 11 }))).toBe('kdfTooCostly $.kdf.t');
    expect(problemOf(other({ m: 262_144, t: 10 }))).toBeNull();
  });

  it('refuses binary fields of the wrong length, alphabet or spelling', () => {
    const with_ = (patch: Record<string, unknown>) => ({ ...clone(), ...patch });
    expect(problemOf(with_({ vaultId: encodeBase64Url(bytes(15)) }))).toBe('malformed $.vaultId');
    expect(problemOf(with_({ vaultId: encodeBase64Url(bytes(17)) }))).toBe('malformed $.vaultId');
    expect(problemOf(with_({ vaultId: 5 }))).toBe('malformed $.vaultId');
    expect(problemOf(with_({ salt: encodeBase64Url(bytes(32)) }))).toBe('malformed $.salt');
    expect(problemOf(with_({ salt: `${encodeBase64Url(bytes(16))}=` }))).toBe('malformed $.salt');
    expect(problemOf(with_({ nonce: encodeBase64Url(bytes(16)) }))).toBe('malformed $.nonce');
    // 12 bytes encoded with the standard alphabet's '+' and '/'.
    expect(problemOf(with_({ nonce: 'AAAA+/AAAAAAAAAA' }))).toBe('malformed $.nonce');
    // 16 bytes whose last character carries stray bits: the canonical spelling ends in 'A'.
    expect(problemOf(with_({ salt: `${'A'.repeat(21)}B` }))).toBe('malformed $.salt');
    expect(problemOf(with_({ salt: 'A'.repeat(22) }))).toBeNull();
  });

  it('refuses a ciphertext that cannot hold a tag, is not canonical or is too large', () => {
    const with_ = (ct: unknown) => ({ ...clone(), ct });
    expect(problemOf(with_(''))).toBe('malformed $.ct');
    expect(problemOf(with_(encodeBase64Url(bytes(15))))).toBe('malformed $.ct');
    expect(problemOf(with_(encodeBase64Url(bytes(16))))).toBeNull();
    expect(problemOf(with_('AA=='))).toBe('malformed $.ct');
    expect(problemOf(with_(7))).toBe('malformed $.ct');
    // Past the bound, refused from the text length alone.
    expect(
      problemOf(with_('A'.repeat(Math.ceil((ENVELOPE_LIMITS.maxCiphertextBytes * 4) / 3) + 1))),
    ).toBe('tooLarge $.ct');
    expect(
      problemOf(with_(encodeBase64Url(new Uint8Array(ENVELOPE_LIMITS.maxCiphertextBytes)))),
    ).toBeNull();
    expect(
      problemOf(with_(encodeBase64Url(new Uint8Array(ENVELOPE_LIMITS.maxCiphertextBytes + 1)))),
    ).toBe('tooLarge $.ct');
  });

  it('never carries a value of the input in its answer', () => {
    const secret = 'SECRET-VALUE-123';
    const result = parseVaultEnvelope({ ...clone(), salt: secret });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('is not fooled by inherited or prototype keys', () => {
    expect(problemOf(JSON.parse('{"__proto__":{"v":1},"v":1}'))).not.toBeNull();
    expect(problemOf(Object.create(clone()))).toBe('malformed $');
  });
});
