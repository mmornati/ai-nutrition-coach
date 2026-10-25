import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError, readConfig } from '../src/config';
import { createServerKeys, loadServerSecret, sameDigest } from '../src/keys';
import { addressKey } from '../src/address';
import { RateLimiter } from '../src/limiter';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readConfig', () => {
  it('has safe defaults: handle identity, open signup, 20 MB, loopback', () => {
    const config = readConfig({});
    expect(config).toMatchObject({
      identity: 'handle',
      signup: 'open',
      maxVaultBytes: 20 * 1024 * 1024,
      host: '127.0.0.1',
      trustProxy: false,
    });
  });

  it('refuses forward-auth, a bad mode, a missing invite list and out-of-range numbers', () => {
    const bad: Record<string, string>[] = [
      { SYNC_IDENTITY: 'forward-auth' },
      { SYNC_SIGNUP: 'maybe' },
      { SYNC_SIGNUP: 'invite' },
      { SYNC_SIGNUP: 'invite', SYNC_INVITE_CODES: 'a b' },
      { SYNC_MAX_VAULT_MB: '0' },
      { SYNC_MAX_VAULT_MB: '25' },
      { SYNC_MAX_VAULT_MB: 'lots' },
      { SYNC_PORT: '70000' },
      { SYNC_TRUST_PROXY: 'yes' },
      { SYNC_SERVER_SECRET: 'short' },
      { SYNC_HOST: 'localhost; rm' },
    ];
    for (const env of bad) expect(() => readConfig(env), JSON.stringify(env)).toThrow(ConfigError);
  });

  it('names the variable and never prints its value', () => {
    try {
      readConfig({ SYNC_SERVER_SECRET: 'hunter2' });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('SYNC_SERVER_SECRET');
      expect((error as Error).message).not.toContain('hunter2');
    }
  });
});

describe('RateLimiter', () => {
  it('counts per key in fixed windows', () => {
    const limiter = new RateLimiter();
    expect(limiter.hit('a', 2, 1000, 0).allowed).toBe(true);
    expect(limiter.hit('a', 2, 1000, 1)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.hit('a', 2, 1000, 2)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.hit('b', 2, 1000, 3).allowed).toBe(true);
    expect(limiter.hit('a', 2, 1000, 1000).allowed).toBe(true);
  });

  it('does not prune one limit’s counters with another limit’s window', () => {
    const limiter = new RateLimiter({ maxKeys: 3 });
    const HOUR = 3_600_000;
    expect(limiter.hit('signups', 1, HOUR, 0).allowed).toBe(true);
    limiter.hit('m1', 5, 60_000, 0);
    limiter.hit('m2', 5, 60_000, 0);
    // A call with a one-minute window finds the table full: the expired minute entries go, the
    // hour counter stays.
    limiter.hit('m3', 5, 60_000, 70_000);
    expect(limiter.hit('signups', 1, HOUR, 70_000).allowed).toBe(false);
  });

  it('can refuse new keys instead of forgetting counters, so a flood cannot reset a limit', () => {
    const limiter = new RateLimiter({ maxKeys: 2, whenFull: 'refuse' });
    limiter.hit('a', 1, 60_000, 0);
    limiter.hit('b', 1, 60_000, 0);
    expect(limiter.hit('a', 1, 60_000, 1).allowed).toBe(false);
    // No room for a third live key: it is turned away, and a's count was not forgotten for it.
    expect(limiter.hit('c', 1, 60_000, 2).allowed).toBe(false);
    expect(limiter.peek('c', 1, 2).allowed).toBe(false);
    expect(limiter.hit('a', 1, 60_000, 3).allowed).toBe(false);
    expect(limiter.size).toBe(2);
    // Once the window has passed there is room again.
    expect(limiter.hit('c', 1, 60_000, 60_001).allowed).toBe(true);
  });

  it('peek says what the next hit would be told and counts nothing', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 5; i++) expect(limiter.peek('a', 2, i).allowed).toBe(true);
    limiter.hit('a', 2, 1000, 5);
    limiter.hit('a', 2, 1000, 6);
    expect(limiter.peek('a', 2, 7)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.peek('a', 2, 1005).allowed).toBe(true);
  });

  it('does not grow without bound', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 60_000; i++) limiter.hit(`k${i}`, 1, 60_000, i);
    expect(limiter.size).toBeLessThanOrEqual(20_000);
  });
});

describe('server keys', () => {
  const keys = createServerKeys(new TextEncoder().encode('0123456789abcdef0123456789abcdef'));
  const other = createServerKeys(new TextEncoder().encode('fedcba9876543210fedcba9876543210'));

  it('makes the fake salt a stable function of the secret and the handle', () => {
    expect(keys.fakeSalt('alice')).toBe(keys.fakeSalt('alice'));
    expect(keys.fakeSalt('alice')).not.toBe(keys.fakeSalt('bobby'));
    expect(keys.fakeSalt('alice')).not.toBe(other.fakeSalt('alice'));
    expect(keys.fakeSalt('alice')).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('keeps the proof, the token and the salt in separate domains', () => {
    const authKey = new Uint8Array(32).fill(1);
    expect(sameDigest(keys.authDigest('alice', authKey), keys.authDigest('alice', authKey))).toBe(
      true,
    );
    expect(sameDigest(keys.authDigest('alice', authKey), keys.authDigest('bobby', authKey))).toBe(
      false,
    );
    expect(sameDigest(keys.authDigest('alice', authKey), other.authDigest('alice', authKey))).toBe(
      false,
    );
    expect(sameDigest(keys.tokenDigest('x'), keys.authDigest('x', new Uint8Array(0)))).toBe(false);
    expect(sameDigest(new Uint8Array(3), new Uint8Array(4))).toBe(false);
  });

  it('creates the secret once, 0600, and reuses it after a restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'anc-relay-secret-'));
    dirs.push(dir);
    const first = loadServerSecret(dir, undefined);
    const again = loadServerSecret(dir, undefined);
    expect(Buffer.from(again).equals(Buffer.from(first))).toBe(true);
    expect(statSync(join(dir, 'server.secret')).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(dir, 'server.secret'), 'utf8')).toMatch(/^[0-9a-f]{64}$/);
    expect(createServerKeys(first).fakeSalt('alice')).toBe(
      createServerKeys(again).fakeSalt('alice'),
    );
  });

  it('takes the secret from the environment when given', () => {
    expect(new TextDecoder().decode(loadServerSecret('/nonexistent/never-created', 'abc'))).toBe(
      'abc',
    );
  });
});

describe('addressKey', () => {
  it('keeps IPv4 as it is and unwraps an IPv4-mapped IPv6 address', () => {
    expect(addressKey('203.0.113.7')).toBe('203.0.113.7');
    expect(addressKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(addressKey('::FFFF:cb00:7107')).toBe('203.0.113.7');
  });

  it('maps every spelling of an IPv6 /64 to one key, and different /64s to different keys', () => {
    const same = [
      '2001:db8:1:2::1',
      '2001:0db8:0001:0002:0000:0000:0000:0002',
      '2001:DB8:1:2:aaaa:bbbb:cccc:dddd',
      '2001:db8:1:2::',
      '2001:db8:1:2::1%eth0',
    ];
    const keys = new Set(same.map(addressKey));
    expect(keys.size).toBe(1);
    expect(addressKey('2001:db8:1:3::1')).not.toBe([...keys][0]);
    expect(addressKey('2001:db8:2:2::1')).not.toBe([...keys][0]);
    expect(addressKey('::1')).toBe(addressKey('0:0:0:0:0:0:0:5'));
  });

  it('leaves what is not an address alone', () => {
    expect(addressKey('unknown')).toBe('unknown');
    expect(addressKey('1:2:3')).toBe('1:2:3');
  });
});
