import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSyncConfig, SYNC_KDF } from '@anc/core';
import { openStore } from '../src/store';
import {
  authed,
  b64,
  bytes,
  envelopeOf,
  getVault,
  post,
  put,
  signup,
  signupBody,
  startRelay,
  type Harness,
} from './harness';

let relay: Harness | undefined;
const dirs: string[] = [];
afterEach(async () => {
  await relay?.close();
  relay = undefined;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const start = async (env: Record<string, string> = {}): Promise<Harness> =>
  (relay = await startRelay(env));

describe('config and health', () => {
  it('offers what the app reads strictly', async () => {
    const h = await start({ SYNC_MAX_VAULT_MB: '12' });
    const response = await fetch(`${h.url}/sync/config.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(parseSyncConfig(await response.json())).toEqual({
      offered: true,
      signup: 'open',
      maxVaultMb: 12,
    });
    expect((await fetch(`${h.url}/sync/health`)).status).toBe(200);
    expect((await fetch(`${h.url}/sync/config.json`, { method: 'HEAD' })).status).toBe(200);
  });

  it('answers a plain 404 / 405 for everything else, with a code and nothing more', async () => {
    const h = await start();
    const missing = await fetch(`${h.url}/sync/v1/devices`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'notFound' });
    const wrong = await fetch(`${h.url}/sync/v1/login`);
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get('allow')).toBe('POST');
    expect((await fetch(`${h.url}/sync/v1/vault`, { method: 'DELETE' })).status).toBe(405);
  });
});

describe('signup, login, token', () => {
  it('signs up with an envelope, then logs in from another device', async () => {
    const h = await start();
    const body = signupBody('alice');
    const created = await post(h, '/sync/v1/signup', body);
    expect(created.status).toBe(201);
    const session = (await created.json()) as Record<string, unknown>;
    expect(Object.keys(session).sort()).toEqual(['token', 'vaultId', 'version', 'wrappedKey']);
    expect(session['vaultId']).toBe(body.envelope.vaultId);
    expect(session['version']).toBe(1);
    expect(session['wrappedKey']).toBe(body.wrappedKey);

    const salt = await post(h, '/sync/v1/salt', { handle: 'alice' });
    expect(await salt.json()).toEqual({ salt: body.salt, kdf: SYNC_KDF });

    const login = await post(h, '/sync/v1/login', { handle: 'alice', authKey: body.authKey });
    expect(login.status).toBe(200);
    const again = (await login.json()) as { token: string };
    expect(again.token).not.toBe(session['token']);
    const read = await fetch(`${h.url}/sync/v1/vault`, {
      headers: { authorization: `Bearer ${again.token}` },
    });
    expect(read.status).toBe(200);
  });

  it('says "handle taken" and nothing else is told about existence', async () => {
    const h = await start();
    await signup(h, 'alice');
    const second = await post(h, '/sync/v1/signup', signupBody('alice', {}, 2));
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'handleTaken' });
  });

  it('refuses a handle that is not in the canonical form, instead of fixing it', async () => {
    const h = await start();
    for (const handle of ['Alice', ' alice', 'al', 'a@b.c', 'alice\n']) {
      const response = await post(h, '/sync/v1/signup', signupBody(handle));
      expect(response.status, handle).toBe(400);
    }
  });

  it('closed signup refuses; invite signup needs a listed code; open ignores a code', async () => {
    const closed = await start({ SYNC_SIGNUP: 'closed' });
    const refused = await post(closed, '/sync/v1/signup', signupBody('alice'));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'signupClosed' });
    await closed.close();

    const invite = await startRelay({
      SYNC_SIGNUP: 'invite',
      SYNC_INVITE_CODES: 'blue-door, red-door',
    });
    relay = invite;
    const none = await post(invite, '/sync/v1/signup', signupBody('alice'));
    expect(none.status).toBe(403);
    expect(await none.json()).toEqual({ error: 'inviteInvalid' });
    const wrong = await post(
      invite,
      '/sync/v1/signup',
      signupBody('alice', { invite: 'green-door' }),
    );
    expect(wrong.status).toBe(403);
    const right = await post(
      invite,
      '/sync/v1/signup',
      signupBody('alice', { invite: 'red-door' }),
    );
    expect(right.status).toBe(201);
    expect(
      parseSyncConfig(await (await fetch(`${invite.url}/sync/config.json`)).json()),
    ).toMatchObject({
      signup: 'invite',
    });
  });

  it('stops at the maximum number of vaults', async () => {
    const h = await start({ SYNC_MAX_VAULTS: '2' });
    await signup(h, 'alice', 1);
    await signup(h, 'bobby', 2);
    const third = await post(h, '/sync/v1/signup', signupBody('carol', {}, 3));
    expect(third.status).toBe(507);
    expect(await third.json()).toEqual({ error: 'serverFull' });
  });

  it('keeps only the newest devices of a vault', async () => {
    const h = await start({ SYNC_MAX_DEVICES: '2' });
    const alice = await signup(h, 'alice');
    const tokens = [alice.token];
    for (let i = 0; i < 2; i++) {
      h.advance(1000);
      const login = await post(h, '/sync/v1/login', { handle: 'alice', authKey: alice.authKey });
      tokens.push(((await login.json()) as { token: string }).token);
    }
    const status = async (token: string) =>
      (await fetch(`${h.url}/sync/v1/vault`, { headers: { authorization: `Bearer ${token}` } }))
        .status;
    expect(await status(tokens[0]!)).toBe(401);
    expect(await status(tokens[1]!)).toBe(200);
    expect(await status(tokens[2]!)).toBe(200);
  });
});

describe('devices', () => {
  it('signs out the device used least recently, not the one created first', async () => {
    const h = await start({ SYNC_MAX_DEVICES: '2' });
    const alice = await signup(h, 'alice');
    const login = async () =>
      (
        (await (
          await post(h, '/sync/v1/login', { handle: 'alice', authKey: alice.authKey })
        ).json()) as { token: string }
      ).token;
    const status = async (token: string) =>
      (await fetch(`${h.url}/sync/v1/vault`, { headers: { authorization: `Bearer ${token}` } }))
        .status;
    h.advance(1000);
    const lookup = await login();
    // The long-lived device syncs, much later ...
    h.advance(120_000);
    expect(await status(alice.token)).toBe(200);
    // ... and then another look-up arrives.
    h.advance(1000);
    const newest = await login();
    expect(await status(alice.token)).toBe(200);
    expect(await status(newest)).toBe(200);
    expect(await status(lookup)).toBe(401);
  });
});

describe('enumeration', () => {
  it('gives an unknown handle a salt of the same shape, stable, and different per handle', async () => {
    const h = await start();
    await signup(h, 'alice');
    const ask = async (handle: string) => {
      const response = await post(h, '/sync/v1/salt', { handle });
      return { status: response.status, text: await response.text() };
    };
    const known = await ask('alice');
    const unknown = await ask('nobody');
    const strip = (text: string) => text.replace(/"salt":"[^"]*"/, '"salt":"S"');
    expect(unknown.status).toBe(known.status);
    expect(strip(unknown.text)).toBe(strip(known.text));
    expect(JSON.parse(unknown.text).salt).toHaveLength(JSON.parse(known.text).salt.length);
    // Stable, so asking twice cannot tell a real handle (which is stable too) from a fake one.
    expect(await ask('nobody')).toEqual(unknown);
    expect((await ask('someone-else')).text).not.toBe(unknown.text);
  });

  it('answers a wrong passphrase and an unknown handle identically', async () => {
    const h = await start();
    const alice = await signup(h, 'alice');
    const attempt = async (handle: string, authKey: string) => {
      const response = await post(h, '/sync/v1/login', { handle, authKey });
      return { status: response.status, body: await response.text() };
    };
    const wrong = await attempt('alice', b64(32, 99));
    const unknown = await attempt('nobody', alice.authKey);
    expect(wrong).toEqual({ status: 401, body: '{"error":"noMatch"}' });
    expect(unknown).toEqual(wrong);
  });
});

describe('the vault: compare-and-swap', () => {
  it('reads with an ETag, answers 304 to If-None-Match, and writes with If-Match', async () => {
    const h = await start();
    const alice = await signup(h);
    const read = await getVault(h, alice);
    expect(read.headers.get('etag')).toBe('"1"');
    const body = (await read.json()) as {
      vaultId: string;
      version: number;
      envelope: { version: number };
    };
    expect(body.version).toBe(1);
    expect(body.envelope.version).toBe(1);
    expect((await getVault(h, alice, { 'if-none-match': '"1"' })).status).toBe(304);
    expect((await getVault(h, alice, { 'if-none-match': '"0"' })).status).toBe(200);

    const written = await put(h, alice, envelopeOf(2, alice.vaultId), '"1"');
    expect(written.status).toBe(200);
    expect(written.headers.get('etag')).toBe('"2"');
    expect(await written.json()).toEqual({ version: 2 });
    expect((await getVault(h, alice, { 'if-none-match': '"1"' })).status).toBe(200);
    expect((await getVault(h, alice, { 'if-none-match': '"2"' })).status).toBe(304);
  });

  it('answers 412 with the current version when If-Match is stale, and changes nothing', async () => {
    const h = await start();
    const alice = await signup(h);
    expect((await put(h, alice, envelopeOf(2, alice.vaultId), '"1"')).status).toBe(200);
    const stale = await put(h, alice, envelopeOf(2, alice.vaultId, 9), '"1"');
    expect(stale.status).toBe(412);
    expect(await stale.json()).toEqual({ error: 'versionConflict', version: 2 });
    expect(stale.headers.get('etag')).toBe('"2"');
    const current = (await (await getVault(h, alice)).json()) as { envelope: { ct: string } };
    expect(current.envelope.ct).toBe(envelopeOf(2, alice.vaultId).ct);
    // Writing ahead of the current version is also a conflict, never a skip.
    const ahead = await put(h, alice, envelopeOf(6, alice.vaultId), '"5"');
    expect(ahead.status).toBe(412);
  });

  it('requires If-Match (428), refuses a tag that is not ours, and a version that skips or repeats', async () => {
    const h = await start();
    const alice = await signup(h);
    expect((await put(h, alice, envelopeOf(2, alice.vaultId), null)).status).toBe(428);
    for (const tag of ['*', 'W/"1"', '1', '"1", "2"']) {
      expect((await put(h, alice, envelopeOf(2, alice.vaultId), tag)).status, tag).toBe(428);
    }
    // The monotonic counter: exactly +1, so a replayed or skipped envelope is refused.
    expect((await put(h, alice, envelopeOf(3, alice.vaultId), '"1"')).status).toBe(400);
    expect((await put(h, alice, envelopeOf(1, alice.vaultId), '"1"')).status).toBe(400);
    expect((await getVault(h, alice)).headers.get('etag')).toBe('"1"');
  });

  it('refuses an envelope of another vault', async () => {
    const h = await start();
    const alice = await signup(h);
    const response = await put(h, alice, envelopeOf(2, b64(16, 77)), '"1"');
    expect(response.status).toBe(400);
  });

  it('two writers with the same If-Match: exactly one wins', async () => {
    const h = await start();
    const alice = await signup(h);
    const [a, b] = await Promise.all([
      put(h, alice, envelopeOf(2, alice.vaultId, 5), '"1"'),
      put(h, alice, envelopeOf(2, alice.vaultId, 6), '"1"'),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 412]);
  });

  it('keeps the previous envelope for a client that needs to roll back', async () => {
    const h = await start();
    const alice = await signup(h);
    expect((await getVault(h, alice, {}, '?previous=1')).status).toBe(404);
    await put(h, alice, envelopeOf(2, alice.vaultId), '"1"');
    await put(h, alice, envelopeOf(3, alice.vaultId), '"2"');
    const previous = (await (await getVault(h, alice, {}, '?previous=1')).json()) as {
      version: number;
      envelope: { version: number; ct: string };
    };
    expect(previous.version).toBe(2);
    expect(previous.envelope.version).toBe(2);
    expect(previous.envelope.ct).toBe(envelopeOf(2, alice.vaultId).ct);
    expect((await getVault(h, alice, {}, '?previous=2')).status).toBe(400);
  });

  it('needs a device token to read or write', async () => {
    const h = await start();
    const alice = await signup(h);
    for (const authorization of [
      undefined,
      'Bearer nope',
      `Bearer ${b64(32, 5)}`,
      `Basic ${alice.token}`,
    ]) {
      const response = await fetch(`${h.url}/sync/v1/vault`, {
        headers: authorization === undefined ? {} : { authorization },
      });
      expect(response.status, String(authorization)).toBe(401);
    }
  });

  it('one person cannot reach another person’s vault with their own token', async () => {
    const h = await start();
    const alice = await signup(h, 'alice', 1);
    const bobby = await signup(h, 'bobby', 2);
    const mine = (await (await getVault(h, bobby)).json()) as { vaultId: string };
    expect(mine.vaultId).toBe(bobby.vaultId);
    expect(mine.vaultId).not.toBe(alice.vaultId);
    expect((await put(h, bobby, envelopeOf(2, alice.vaultId), '"1"')).status).toBe(400);
  });
});

describe('only envelopes are accepted and stored', () => {
  it('refuses a snapshot, extra fields, a missing field and a file envelope', async () => {
    const h = await start();
    const alice = await signup(h);
    const plaintext = { plates: [{ name: 'Salmon' }], snapshotVersion: 1 };
    const cases: [string, unknown][] = [
      ['a snapshot', plaintext],
      ['a note beside the envelope', { envelope: envelopeOf(2, alice.vaultId), note: 'Salmon' }],
      [
        'an envelope with a plaintext field',
        { envelope: { ...envelopeOf(2, alice.vaultId), name: 'Salmon' } },
      ],
      ['an envelope without ct', { envelope: { ...envelopeOf(2, alice.vaultId), ct: undefined } }],
      [
        'a file envelope',
        { envelope: { ...envelopeOf(2, alice.vaultId), kdf: SYNC_KDF, salt: b64(16) } },
      ],
      ['a string', { envelope: 'Salmon' }],
      ['a bare array', [1]],
    ];
    for (const [name, body] of cases) {
      const response = await fetch(`${h.url}/sync/v1/vault`, {
        method: 'PUT',
        headers: authed(alice, { 'content-type': 'application/json', 'if-match': '"1"' }),
        body: JSON.stringify(body),
      });
      expect(response.status, name).toBe(400);
    }
  });

  it('refuses a signup that carries anything but its fields (a passphrase, a snapshot)', async () => {
    const h = await start();
    for (const extra of [
      { passphrase: 'correct horse' },
      { snapshot: { plates: [] } },
      { email: 'a@b.c' },
    ]) {
      const response = await post(h, '/sync/v1/signup', signupBody('alice', extra));
      expect(response.status).toBe(400);
    }
    expect(h.store.vaultCount()).toBe(0);
  });

  it('wants JSON, in bounded size, that parses', async () => {
    const h = await start({ SYNC_MAX_VAULT_MB: '1' });
    const alice = await signup(h);
    const raw = (body: string, type = 'application/json') =>
      fetch(`${h.url}/sync/v1/vault`, {
        method: 'PUT',
        headers: authed(alice, { 'content-type': type, 'if-match': '"1"' }),
        body,
      });
    expect((await raw('{}', 'text/plain')).status).toBe(415);
    expect((await raw('{"envelope":')).status).toBe(400);
    expect((await raw('\u0000')).status).toBe(400);
    const big = { envelope: { ...envelopeOf(2, alice.vaultId), ct: b64(1024 * 1024 + 1) } };
    expect((await raw(JSON.stringify(big))).status).toBe(413);
    // A body far past the cap is cut off while it is still arriving: a 413, or the connection
    // reset under the client's feet, but never a stored envelope.
    const huge = await raw('x'.repeat(5 * 1024 * 1024)).then(
      (response) => response.status,
      () => 'reset',
    );
    expect([413, 'reset']).toContain(huge);
    const justUnder = { envelope: { ...envelopeOf(2, alice.vaultId), ct: b64(1024 * 1024) } };
    expect((await raw(JSON.stringify(justUnder))).status).toBe(200);
  });

  it('stores the envelope text and the keyed hashes, and neither the token nor the proof itself', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'anc-relay-'));
    dirs.push(dir);
    const h = await startRelay({}, openStore(dir));
    relay = h;
    const alice = await signup(h);
    await put(h, alice, envelopeOf(2, alice.vaultId), '"1"');
    h.store.close();
    const files = readdirSync(dir).filter((name) => name.startsWith('relay.sqlite'));
    const raw = Buffer.concat(files.map((name) => readFileSync(join(dir, name))));
    // The token and the authKey are sent by the client; the file holds neither.
    expect(raw.includes(Buffer.from(alice.token))).toBe(false);
    expect(raw.includes(Buffer.from(alice.authKey))).toBe(false);
    expect(raw.includes(Buffer.from(bytes(32, 11)))).toBe(false);
    // What it does hold: the handle, the opaque envelope.
    expect(raw.includes(Buffer.from('alice'))).toBe(true);
    expect(raw.includes(Buffer.from(envelopeOf(2, alice.vaultId).ct))).toBe(true);
    relay = undefined;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe('rate limits', () => {
  it('limits salt, login and signup per client address, with Retry-After', async () => {
    const h = await start({ SYNC_RATE_IP: '4', SYNC_RATE_HANDLE: '1000' });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await post(h, '/sync/v1/salt', { handle: `person${i}` })).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 429, 429]);
    const refused = await post(h, '/sync/v1/login', { handle: 'person1', authKey: b64(32) });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: 'rateLimited' });
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    h.advance(61_000);
    expect((await post(h, '/sync/v1/salt', { handle: 'person9' })).status).toBe(200);
  });

  it('limits FAILED logins per handle, known or not, so guessing one handle’s passphrase is slow', async () => {
    const h = await start({ SYNC_RATE_HANDLE: '3', SYNC_RATE_IP: '1000' });
    await signup(h, 'alice');
    const attempts: number[] = [];
    for (let i = 0; i < 5; i++) {
      attempts.push(
        (await post(h, '/sync/v1/login', { handle: 'alice', authKey: b64(32, i) })).status,
      );
    }
    expect(attempts).toEqual([401, 401, 401, 429, 429]);
    // An unknown handle is limited the same way, which is what keeps the two indistinguishable.
    const unknown: number[] = [];
    for (let i = 0; i < 5; i++) {
      unknown.push(
        (await post(h, '/sync/v1/login', { handle: 'nobody', authKey: b64(32, i) })).status,
      );
    }
    expect(unknown).toEqual([401, 401, 401, 429, 429]);
    // Another handle is unaffected.
    expect((await post(h, '/sync/v1/salt', { handle: 'someone' })).status).toBe(200);
  });

  it('does not count looking a handle up, or a correct login, against the handle', async () => {
    // Someone who only asks for a salt (or opens the copy themselves) cannot lock a person out.
    const h = await start({ SYNC_RATE_HANDLE: '3', SYNC_RATE_IP: '1000' });
    const alice = await signup(h, 'alice');
    for (let i = 0; i < 12; i++) {
      expect((await post(h, '/sync/v1/salt', { handle: 'alice' })).status).toBe(200);
    }
    for (let i = 0; i < 6; i++) {
      const login = await post(h, '/sync/v1/login', { handle: 'alice', authKey: alice.authKey });
      expect(login.status).toBe(200);
    }
    // A signup on a taken handle is answered as such, however often.
    for (let i = 0; i < 4; i++) {
      expect((await post(h, '/sync/v1/signup', signupBody('alice', {}, 9))).status).toBe(409);
    }
    expect(
      (await post(h, '/sync/v1/login', { handle: 'alice', authKey: alice.authKey })).status,
    ).toBe(200);
  });

  it('buckets IPv6 clients by their /64, however the address is written', async () => {
    const h = await start({ SYNC_RATE_IP: '2', SYNC_TRUST_PROXY: '1' });
    const via = (ip: string) =>
      post(h, '/sync/v1/salt', { handle: 'alice' }, { headers: { 'x-real-ip': ip } });
    expect((await via('2001:db8:1:2::1')).status).toBe(200);
    expect((await via('2001:0DB8:1:2:0:0:0:2')).status).toBe(200);
    // Same /64, written a third way (and with a different interface id): the same bucket.
    expect((await via('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).status).toBe(429);
    expect((await via('2001:db8:1:2::')).status).toBe(429);
    // Another /64 is another client.
    expect((await via('2001:db8:1:3::1')).status).toBe(200);
  });

  it('limits signups per address per hour', async () => {
    const h = await start({ SYNC_RATE_SIGNUP: '2' });
    expect((await post(h, '/sync/v1/signup', signupBody('alice', {}, 1))).status).toBe(201);
    expect((await post(h, '/sync/v1/signup', signupBody('bobby', {}, 2))).status).toBe(201);
    expect((await post(h, '/sync/v1/signup', signupBody('carol', {}, 3))).status).toBe(429);
    h.advance(3_600_001);
    expect((await post(h, '/sync/v1/signup', signupBody('carol', {}, 3))).status).toBe(201);
  });

  it('keys the limit on X-Real-IP only when it is told to trust the proxy in front', async () => {
    const untrusting = await start({ SYNC_RATE_IP: '2' });
    const via = (h: Harness, ip: string) =>
      post(h, '/sync/v1/salt', { handle: 'alice' }, { headers: { 'x-real-ip': ip } });
    expect([
      (await via(untrusting, '10.0.0.1')).status,
      (await via(untrusting, '10.0.0.2')).status,
    ]).toEqual([200, 200]);
    expect((await via(untrusting, '10.0.0.3')).status).toBe(429);
    await untrusting.close();

    const trusting = await startRelay({ SYNC_RATE_IP: '2', SYNC_TRUST_PROXY: '1' });
    relay = trusting;
    for (const ip of ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.1']) {
      expect((await via(trusting, ip)).status, ip).toBe(200);
    }
    expect((await via(trusting, '10.0.0.1')).status).toBe(429);
  });

  it('limits writes per device', async () => {
    const h = await start({ SYNC_RATE_WRITE: '2' });
    const alice = await signup(h);
    expect((await put(h, alice, envelopeOf(2, alice.vaultId), '"1"')).status).toBe(200);
    expect((await put(h, alice, envelopeOf(3, alice.vaultId), '"2"')).status).toBe(200);
    expect((await put(h, alice, envelopeOf(4, alice.vaultId), '"3"')).status).toBe(429);
  });
});

describe('cross-site and errors', () => {
  it('refuses a write that a browser says came from another site', async () => {
    const h = await start();
    const response = await post(h, '/sync/v1/signup', signupBody('alice'), {
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(response.status).toBe(403);
    const ok = await post(h, '/sync/v1/signup', signupBody('alice'), {
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    expect(ok.status).toBe(201);
  });

  it('never reports a request value when something unexpected breaks', async () => {
    const h = await start();
    h.store.close();
    const response = await post(h, '/sync/v1/salt', { handle: 'alice' });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'unavailable' });
    expect(h.errors.join(' ')).not.toContain('alice');
    relay = undefined;
    await h.close();
  });
});

describe('big bodies', () => {
  it('says the server is full before it reads the body', async () => {
    const h = await start({ SYNC_MAX_VAULTS: '1' });
    await signup(h, 'alice', 1);
    // A body that would be refused as malformed if it were read: the answer is "full" regardless.
    const response = await post(h, '/sync/v1/signup', 'this is not JSON');
    expect(response.status).toBe(507);
    expect(await response.json()).toEqual({ error: 'serverFull' });
  });

  it('reads only a few uploads at a time and tells the others to come back', async () => {
    const h = await start({ SYNC_MAX_UPLOADS: '1' });
    const port = new URL(h.url).port;
    // An upload that has started and is still arriving.
    const slow = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/sync/v1/signup',
      headers: { 'content-type': 'application/json', 'content-length': '100000' },
    });
    slow.on('error', () => undefined);
    slow.write('{"handle":');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const busy = await post(h, '/sync/v1/signup', signupBody('carol', {}, 3));
    expect(busy.status).toBe(503);
    expect(busy.headers.get('retry-after')).not.toBeNull();
    expect(await busy.json()).toEqual({ error: 'unavailable' });
    // Small requests are not held up by it.
    expect((await post(h, '/sync/v1/salt', { handle: 'alice' })).status).toBe(200);
    // The upload gives up: the slot is free again.
    slow.destroy();
    await vi.waitFor(async () => {
      expect((await post(h, '/sync/v1/signup', signupBody('carol', {}, 3))).status).toBe(201);
    });
  });

  it('answers 413 to a body that keeps coming past the cap, instead of resetting the connection', async () => {
    const h = await start({ SYNC_MAX_VAULT_MB: '1' });
    const alice = await signup(h);
    const port = Number(new URL(h.url).port);
    for (let round = 0; round < 3; round++) {
      const reply = await new Promise<string>((resolve, reject) => {
        const socket = connect(port, '127.0.0.1');
        let received = '';
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => (received += chunk));
        socket.on('error', reject);
        socket.on('close', () => resolve(received));
        // No Content-Length: a chunked body, a little at a time, far past what a vault may be.
        socket.write(
          'PUT /sync/v1/vault HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n' +
            `Authorization: Bearer ${alice.token}\r\nIf-Match: "1"\r\n` +
            'Transfer-Encoding: chunked\r\n\r\n',
        );
        const chunk = `${(64 * 1024).toString(16)}\r\n${'x'.repeat(64 * 1024)}\r\n`;
        for (let i = 0; i < 64; i++) socket.write(chunk);
        socket.write('0\r\n\r\n');
      });
      expect(reply.startsWith('HTTP/1.1 413'), reply.slice(0, 40)).toBe(true);
      expect(reply.toLowerCase()).toContain('connection: close');
    }
  });
});
