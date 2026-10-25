import { describe, expect, it } from 'vitest';
import {
  encodeBase64Url,
  ENVELOPE_LIMITS,
  etagOf,
  normalizeHandle,
  parseLoginRequest,
  parsePutVaultRequest,
  parseRelayEnvelope,
  parseSaltRequest,
  parseSaltResponse,
  parseSessionResponse,
  parseSignupRequest,
  parseSyncConfig,
  parseVaultResponse,
  relayEnvelopeAadText,
  serializeRelayEnvelope,
  SYNC_KDF,
  versionOfEtag,
  type RelayEnvelope,
} from '../src/index';

const bytes = (length: number, seed = 1): Uint8Array =>
  Uint8Array.from({ length }, (_, i) => (i * 31 + seed) & 0xff);
const b64 = (length: number, seed = 1): string => encodeBase64Url(bytes(length, seed));

const envelope = (version = 1): RelayEnvelope => ({
  v: 1,
  vaultId: b64(16, 1),
  version,
  alg: 'A256GCM',
  nonce: b64(12, 2),
  ct: b64(64, 3),
});
const MAX = 1024 * 1024;

describe('relay envelope', () => {
  it('parses what it serialises, field order included', () => {
    const e = envelope(3);
    const result = parseRelayEnvelope(JSON.parse(serializeRelayEnvelope(e)), MAX);
    expect(result.kind).toBe('relayEnvelopeParsed');
    expect(Object.keys(JSON.parse(serializeRelayEnvelope(e)) as object)).toEqual([
      'v',
      'vaultId',
      'version',
      'alg',
      'nonce',
      'ct',
    ]);
  });

  it('refuses a backup-file envelope (it has a kdf and a salt), extra fields and a missing one', () => {
    const file = { ...envelope(), kdf: { name: 'argon2id' }, salt: b64(16) };
    expect(parseRelayEnvelope(file, MAX).kind).toBe('relayEnvelopeInvalid');
    expect(parseRelayEnvelope({ ...envelope(), extra: 1 }, MAX).kind).toBe('relayEnvelopeInvalid');
    const rest: Record<string, unknown> = { ...envelope() };
    delete rest['ct'];
    expect(parseRelayEnvelope(rest, MAX).kind).toBe('relayEnvelopeInvalid');
  });

  it('names a newer format, a bad version, a bad algorithm, and the size cap', () => {
    const problem = (input: unknown, cap = MAX): string =>
      (parseRelayEnvelope(input, cap) as { problem?: string }).problem ?? 'ok';
    expect(problem({ ...envelope(), v: 2 })).toBe('newerFormat');
    expect(problem({ ...envelope(), version: 0 })).toBe('malformed');
    expect(problem({ ...envelope(), version: 1.5 })).toBe('malformed');
    expect(problem({ ...envelope(), alg: 'A128GCM' })).toBe('unsupportedAlgorithm');
    expect(problem({ ...envelope(), ct: b64(8) })).toBe('malformed');
    expect(problem({ ...envelope(), ct: b64(200) }, 100)).toBe('tooLarge');
    expect(problem({ ...envelope(), vaultId: b64(15) })).toBe('malformed');
    expect(problem({ ...envelope(), nonce: `${b64(12)}=` })).toBe('malformed');
    expect(problem(null)).toBe('notAnObject');
  });

  it('binds vault id and version in the associated data', () => {
    const a = relayEnvelopeAadText(envelope(1));
    expect(a).toBe(relayEnvelopeAadText({ ...envelope(1), ct: 'ignored' } as RelayEnvelope));
    expect(a).not.toBe(relayEnvelopeAadText(envelope(2)));
    expect(a).not.toBe(relayEnvelopeAadText({ ...envelope(1), vaultId: b64(16, 9) }));
    expect(a).not.toContain('"ct"');
  });
});

describe('handles and etags', () => {
  it('normalises case and refuses what is not a handle', () => {
    expect(normalizeHandle('  Alice.B-1 ')).toBe('alice.b-1');
    for (const bad of ['ab', 'a'.repeat(33), '-abc', 'a b c', 'é-ab', 'ab/c', '', 'a@b.c']) {
      expect(normalizeHandle(bad)).toBeNull();
    }
  });

  it('round-trips a version through its ETag and refuses anything else', () => {
    expect(versionOfEtag(etagOf(7))).toBe(7);
    expect(versionOfEtag(' "0" ')).toBe(0);
    for (const bad of [
      '7',
      'W/"7"',
      '"07"',
      '"7", "8"',
      '*',
      '"-1"',
      '"1e3"',
      '',
      null,
      undefined,
    ]) {
      expect(versionOfEtag(bad as string)).toBeNull();
    }
  });
});

describe('requests', () => {
  const signup = () => ({
    handle: 'alice',
    salt: b64(16),
    authKey: b64(32),
    wrappedKey: b64(60),
    envelope: envelope(),
  });

  it('accepts exactly the documented fields', () => {
    expect(parseSaltRequest({ handle: 'alice' }).kind).toBe('ok');
    expect(parseSaltRequest({ handle: 'alice', x: 1 }).kind).toBe('invalid');
    expect(parseSaltRequest({ handle: 'Alice' }).kind).toBe('invalid');
    expect(parseLoginRequest({ handle: 'alice', authKey: b64(32) }).kind).toBe('ok');
    expect(parseLoginRequest({ handle: 'alice', authKey: b64(31) }).kind).toBe('invalid');
    expect(parseLoginRequest({ handle: 'alice', authKey: 'hunter2' }).kind).toBe('invalid');
    expect(parseSignupRequest(signup(), MAX).kind).toBe('ok');
    expect(parseSignupRequest({ ...signup(), invite: 'abc-1234' }, MAX).kind).toBe('ok');
    expect(parseSignupRequest({ ...signup(), invite: 'no spaces' }, MAX).kind).toBe('invalid');
    expect(parseSignupRequest({ ...signup(), note: 'plaintext?' }, MAX).kind).toBe('invalid');
    expect(parseSignupRequest({ ...signup(), passphrase: 'x' }, MAX).kind).toBe('invalid');
  });

  it('starts a new vault at version 1 and reports an oversized envelope as too large', () => {
    expect(parseSignupRequest({ ...signup(), envelope: envelope(2) }, MAX).kind).toBe('invalid');
    expect(
      parseSignupRequest({ ...signup(), envelope: { ...envelope(), ct: b64(5000) } }, 100).kind,
    ).toBe('tooLarge');
    expect(parsePutVaultRequest({ envelope: envelope(9) }, MAX).kind).toBe('ok');
    expect(parsePutVaultRequest({ envelope: envelope(), more: true }, MAX).kind).toBe('invalid');
    expect(parsePutVaultRequest({ snapshot: {} }, MAX).kind).toBe('invalid');
  });
});

describe('responses (the relay is untrusted)', () => {
  it('reads a salt response only with the one KDF this build uses', () => {
    const good = { salt: b64(16), kdf: { ...SYNC_KDF } };
    expect(parseSaltResponse(good)).toEqual(good);
    expect(parseSaltResponse({ ...good, kdf: { ...SYNC_KDF, m: 1024 } })).toBeNull();
    expect(parseSaltResponse({ ...good, kdf: { ...SYNC_KDF, t: 1 } })).toBeNull();
    expect(parseSaltResponse({ ...good, kdf: { ...SYNC_KDF, m: SYNC_KDF.m * 4 } })).toBeNull();
    expect(parseSaltResponse({ salt: b64(15), kdf: SYNC_KDF })).toBeNull();
  });

  it('reads a session and a vault response strictly, and they must agree with the envelope', () => {
    const session = { token: b64(32), vaultId: b64(16), wrappedKey: b64(60), version: 2 };
    expect(parseSessionResponse(session)).toEqual(session);
    expect(parseSessionResponse({ ...session, version: 0 })).toBeNull();
    expect(parseSessionResponse({ ...session, token: b64(31) })).toBeNull();
    const e = envelope(4);
    const vault = { vaultId: e.vaultId, version: 4, envelope: e };
    expect(parseVaultResponse(vault, MAX).kind).toBe('ok');
    expect(parseVaultResponse({ ...vault, version: 5 }, MAX).kind).toBe('invalid');
    expect(parseVaultResponse({ ...vault, vaultId: b64(16, 8) }, MAX).kind).toBe('invalid');
    expect(parseVaultResponse({ ...vault, envelope: { ...e, v: 2 } }, MAX).kind).toBe(
      'newerFormat',
    );
    expect(parseVaultResponse(vault, 10).kind).toBe('tooLarge');
  });
});

describe('config', () => {
  const good = { enabled: true, v: 1, identity: 'handle', signup: 'open', maxVaultMb: 20 };
  it('reads the offer', () => {
    expect(parseSyncConfig(good)).toEqual({ offered: true, signup: 'open', maxVaultMb: 20 });
    expect(parseSyncConfig({ ...good, signup: 'invite' })).toMatchObject({ signup: 'invite' });
  });
  it('treats anything else as not offered', () => {
    for (const bad of [
      null,
      [],
      'on',
      {},
      { ...good, enabled: 1 },
      { ...good, v: 2 },
      { ...good, identity: 'forward-auth' },
      { ...good, signup: 'maybe' },
      { ...good, maxVaultMb: 0 },
      { ...good, maxVaultMb: 1000 },
      { ...good, maxVaultMb: 1.5 },
    ]) {
      expect(parseSyncConfig(bad)).toEqual({ offered: false });
    }
  });
  it('the vault ceiling is what an envelope can hold', () => {
    expect(ENVELOPE_LIMITS.maxCiphertextBytes / (1024 * 1024)).toBe(24);
  });
});
