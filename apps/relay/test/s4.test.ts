// Phase S4 on the relay: device labels and revocation, token idle expiry, changing the passphrase
// and recovering with a recovery key (each needing a proof besides the token), deleting a copy,
// the previous-version window, single-use invites and the admin CLI.
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runAdmin } from '../src/admin';
import { createServerKeys } from '../src/keys';
import { openMemoryStore, openStore } from '../src/store';
import {
  authed,
  b64,
  envelopeOf,
  post,
  put,
  SECRET,
  signup,
  signupBody,
  startRelay,
  getVault,
  type Harness,
  type Vault,
} from './harness';

let relay: Harness | null = null;
const dirs: string[] = [];
afterEach(async () => {
  await relay?.close();
  relay = null;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const start = async (env: Record<string, string> = {}): Promise<Harness> =>
  (relay = await startRelay(env));

const call = (h: Harness, v: Vault, path: string, body: unknown) =>
  post(h, `/sync/v1${path}`, body, { headers: authed(v) });
const account = async (h: Harness, v: Vault) =>
  (await (await fetch(`${h.url}/sync/v1/account`, { headers: authed(v) })).json()) as {
    hasRecovery: boolean;
    previousVersion: number | null;
    devices: { id: number; label: string; current: boolean; lastSeenAt: number }[];
  };
const login = (h: Harness, handle: string, authKey: string, extra: object = {}, path = '/login') =>
  post(h, `/sync/v1${path}`, { handle, authKey, ...extra });

describe('devices', () => {
  it('lists labelled devices, cleans the label, and marks the caller', async () => {
    const h = await start();
    const alice = await signup(h);
    const response = await login(h, 'alice', alice.authKey, { label: '  iPhone ‮· Safari\n' });
    expect(response.status).toBe(200);
    const list = await account(h, alice);
    expect(list.devices).toHaveLength(2);
    expect(list.devices.map((d) => d.label)).toEqual(['', 'iPhone · Safari']);
    expect(list.devices.filter((d) => d.current)).toHaveLength(1);
    expect((await login(h, 'alice', alice.authKey, { label: 'x'.repeat(500) })).status).toBe(400);
    expect((await login(h, 'alice', alice.authKey, { label: 5 })).status).toBe(400);
  });

  it('revokes one device, then all the others', async () => {
    const h = await start();
    const alice = await signup(h);
    const t2 = (await (await login(h, 'alice', alice.authKey, { label: 'two' })).json()) as {
      token: string;
    };
    await login(h, 'alice', alice.authKey, { label: 'three' });
    const two = { ...alice, token: t2.token };
    const list = await account(h, alice);
    const target = list.devices.find((d) => d.label === 'two')!;
    expect(await (await call(h, alice, '/devices/revoke', { id: target.id })).json()).toEqual({
      revoked: 1,
    });
    expect((await getVault(h, two)).status).toBe(401);
    expect((await call(h, alice, '/devices/revoke', { others: true })).status).toBe(200);
    expect((await account(h, alice)).devices).toHaveLength(1);
    expect((await getVault(h, alice)).status).toBe(200);
    expect((await call(h, alice, '/devices/revoke', { id: 1, others: true })).status).toBe(400);
  });

  it("cannot revoke another vault's device", async () => {
    const h = await start();
    const alice = await signup(h, 'alice', 1);
    const bob = await signup(h, 'bobby', 2);
    const id = (await account(h, bob)).devices[0]!.id;
    expect(await (await call(h, alice, '/devices/revoke', { id })).json()).toEqual({ revoked: 0 });
    expect((await getVault(h, bob)).status).toBe(200);
  });

  it('a token idle past the limit stops working and is forgotten; use keeps it alive', async () => {
    const h = await start({ SYNC_TOKEN_MAX_IDLE_DAYS: '10' });
    const alice = await signup(h);
    const day = 86_400_000;
    h.advance(9 * day);
    expect((await getVault(h, alice)).status).toBe(200);
    h.advance(9 * day);
    expect((await getVault(h, alice)).status).toBe(200);
    h.advance(10 * day);
    expect((await getVault(h, alice)).status).toBe(401);
    expect((await login(h, 'alice', alice.authKey)).status).toBe(200);
  });

  it('SYNC_TOKEN_MAX_IDLE_DAYS=0 never expires', async () => {
    const h = await start({ SYNC_TOKEN_MAX_IDLE_DAYS: '0' });
    const alice = await signup(h);
    h.advance(900 * 86_400_000);
    expect((await getVault(h, alice)).status).toBe(200);
  });
});

describe('changing the passphrase', () => {
  const next = { salt: b64(16, 90), authKey: b64(32, 91), wrappedKey: b64(60, 92) };

  it('needs the token AND a proof; swaps everything at once; revokes the other devices', async () => {
    const h = await start();
    const alice = await signup(h);
    const other = (await (await login(h, 'alice', alice.authKey)).json()) as { token: string };
    const proof = { kind: 'passphrase', authKey: alice.authKey };
    // No token, wrong proof, recovery proof for a vault with none: all refused, nothing changed.
    expect((await post(h, '/sync/v1/passphrase', { proof, ...next })).status).toBe(401);
    const wrong = await call(h, alice, '/passphrase', {
      proof: { ...proof, authKey: b64(32, 5) },
      ...next,
    });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'noMatch' });
    expect(
      (
        await call(h, alice, '/passphrase', {
          proof: { kind: 'recovery', authKey: alice.authKey },
          ...next,
        })
      ).status,
    ).toBe(401);
    expect((await login(h, 'alice', alice.authKey)).status).toBe(200);

    const done = await call(h, alice, '/passphrase', { proof, ...next });
    expect(done.status).toBe(200);
    expect(((await done.json()) as { revoked: number }).revoked).toBeGreaterThanOrEqual(2);
    expect((await getVault(h, { ...alice, token: other.token })).status).toBe(401);
    expect((await getVault(h, alice)).status).toBe(200);
    expect((await login(h, 'alice', alice.authKey)).status).toBe(401);
    const fresh = await login(h, 'alice', next.authKey);
    expect(fresh.status).toBe(200);
    expect(((await fresh.json()) as { wrappedKey: string }).wrappedKey).toBe(next.wrappedKey);
    const salt = await post(h, '/sync/v1/salt', { handle: 'alice' });
    expect(((await salt.json()) as { salt: string }).salt).toBe(next.salt);
  });

  it('one device’s wrong proofs never block another device of the same vault', async () => {
    const h = await start({ SYNC_RATE_HANDLE_DAY: '3', SYNC_RATE_HANDLE: '100' });
    const alice = await signup(h);
    const second = (await (await login(h, 'alice', alice.authKey)).json()) as { token: string };
    const bad = { proof: { kind: 'passphrase', authKey: b64(32, 7) }, ...next };
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call(h, alice, '/passphrase', bad)).status);
    expect(statuses[5]).toBe(429);
    // The stolen token is spent; the owner's other device still changes the passphrase.
    const good = { proof: { kind: 'passphrase', authKey: alice.authKey }, ...next };
    expect((await call(h, { ...alice, token: second.token }, '/passphrase', good)).status).toBe(
      200,
    );
  });

  it('a thief with a token cannot burn the owner’s login budget', async () => {
    const h = await start({ SYNC_RATE_HANDLE_DAY: '3', SYNC_RATE_HANDLE: '100' });
    const alice = await signup(h);
    const bad = { proof: { kind: 'passphrase', authKey: b64(32, 7) }, ...next };
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call(h, alice, '/passphrase', bad)).status);
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses[5]).toBe(429);
    expect((await login(h, 'alice', alice.authKey)).status).toBe(200);
  });
});

describe('the recovery key', () => {
  const rec = { authKey: b64(32, 50), wrappedKey: b64(60, 51) };
  const recProof = { kind: 'recovery', authKey: rec.authKey };

  async function withRecovery(h: Harness): Promise<Vault> {
    const body = signupBody('alice', { recovery: rec });
    const response = await post(h, '/sync/v1/signup', body);
    expect(response.status).toBe(201);
    const s = (await response.json()) as { token: string; vaultId: string };
    return { handle: 'alice', authKey: body.authKey, vaultId: s.vaultId, token: s.token };
  }

  it('signs in with the recovery key only, gets the recovery-wrapped key, and sets a new passphrase', async () => {
    const h = await start();
    const alice = await withRecovery(h);
    expect((await account(h, alice)).hasRecovery).toBe(true);
    const r = await login(h, 'alice', rec.authKey, { label: 'new phone' }, '/recover');
    expect(r.status).toBe(200);
    const session = (await r.json()) as { token: string; wrappedKey: string };
    expect(session.wrappedKey).toBe(rec.wrappedKey);
    // The passphrase proof does not open the recovery door, nor the other way round.
    expect((await login(h, 'alice', alice.authKey, {}, '/recover')).status).toBe(401);
    expect((await login(h, 'alice', rec.authKey)).status).toBe(401);
    const recovered = { ...alice, token: session.token };
    const next = { salt: b64(16, 60), authKey: b64(32, 61), wrappedKey: b64(60, 62) };
    expect((await call(h, recovered, '/passphrase', { proof: recProof, ...next })).status).toBe(
      200,
    );
    expect((await getVault(h, alice)).status).toBe(401);
    expect((await login(h, 'alice', next.authKey)).status).toBe(200);
    // The recovery key still works afterwards.
    expect((await login(h, 'alice', rec.authKey, {}, '/recover')).status).toBe(200);
  });

  it('answers a vault without a recovery key, a wrong key and an unknown handle identically', async () => {
    const h = await start();
    await withRecovery(h);
    await signup(h, 'bobby', 2);
    const answers = [];
    for (const [handle, key] of [
      ['alice', b64(32, 9)],
      ['bobby', rec.authKey],
      ['nobody1', rec.authKey],
    ] as const) {
      const r = await login(h, handle, key, {}, '/recover');
      answers.push([r.status, await r.text()]);
    }
    expect(answers[0]).toEqual(answers[1]);
    expect(answers[1]).toEqual(answers[2]);
    expect(answers[0]![0]).toBe(401);
  });

  it('guessing the recovery key never locks the owner out, from other addresses or with a stolen token', async () => {
    const h = await start({
      SYNC_RATE_HANDLE_DAY: '3',
      SYNC_RATE_HANDLE: '3',
      SYNC_TRUST_PROXY: '1',
    });
    const alice = await withRecovery(h);
    const from = (ip: string) => ({ headers: { 'X-Real-IP': ip } });
    // Strangers from several addresses guess far past the daily per-handle number.
    let n = 0;
    for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3', '198.51.100.4']) {
      for (let i = 0; i < 3; i++) {
        const r = await post(
          h,
          '/sync/v1/recover',
          { handle: 'alice', authKey: b64(32, 100 + n++) },
          from(ip),
        );
        expect(r.status).toBe(401);
      }
    }
    // Each address is still locked after its own few wrong tries (the per-client lockout stays).
    const locked = await post(
      h,
      '/sync/v1/recover',
      { handle: 'alice', authKey: b64(32, 150) },
      from('198.51.100.1'),
    );
    expect(locked.status).toBe(429);
    // A thief with a stolen token guesses through /passphrase with a recovery proof, from one address.
    const next = { salt: b64(16, 90), authKey: b64(32, 91), wrappedKey: b64(60, 92) };
    const thief = (i: number) =>
      post(
        h,
        '/sync/v1/passphrase',
        { proof: { kind: 'recovery', authKey: b64(32, 160 + i) }, ...next },
        { headers: { ...authed(alice), 'X-Real-IP': '192.0.2.50' } },
      );
    const thiefCodes: number[] = [];
    for (let i = 0; i < 8; i++) thiefCodes.push((await thief(i)).status);
    expect(thiefCodes.slice(0, 3)).toEqual([401, 401, 401]);
    // The owner, with the right key from another address, still gets in.
    const owner = await post(
      h,
      '/sync/v1/recover',
      { handle: 'alice', authKey: rec.authKey },
      from('203.0.113.9'),
    );
    expect(owner.status).toBe(200);
    // And the passphrase door was never touched.
    expect((await login(h, 'alice', alice.authKey)).status).toBe(200);
    // The other way: the passphrase budget spent leaves the recovery door alone.
    const h2 = await start({ SYNC_RATE_HANDLE_DAY: '3', SYNC_RATE_HANDLE: '100' });
    await withRecovery(h2);
    for (let i = 0; i < 6; i++) await login(h2, 'alice', b64(32, 80 + i));
    expect((await login(h2, 'alice', rec.authKey, {}, '/recover')).status).toBe(200);
  });

  it('is added, rotated and removed with a proof of the passphrase', async () => {
    const h = await start();
    const alice = await signup(h);
    expect((await account(h, alice)).hasRecovery).toBe(false);
    const proof = { kind: 'passphrase', authKey: alice.authKey };
    expect(
      (
        await call(h, alice, '/recovery', {
          proof: { ...proof, authKey: b64(32, 3) },
          recovery: rec,
        })
      ).status,
    ).toBe(401);
    expect((await call(h, alice, '/recovery', { proof: recProof, recovery: rec })).status).toBe(
      400,
    );
    expect((await call(h, alice, '/recovery', { proof, recovery: rec })).status).toBe(200);
    expect((await login(h, 'alice', rec.authKey, {}, '/recover')).status).toBe(200);
    const rotated = { authKey: b64(32, 55), wrappedKey: b64(60, 56) };
    expect((await call(h, alice, '/recovery', { proof, recovery: rotated })).status).toBe(200);
    expect((await login(h, 'alice', rec.authKey, {}, '/recover')).status).toBe(401);
    expect((await login(h, 'alice', rotated.authKey, {}, '/recover')).status).toBe(200);
    expect((await call(h, alice, '/recovery', { proof, recovery: null })).status).toBe(200);
    expect((await account(h, alice)).hasRecovery).toBe(false);
    expect((await login(h, 'alice', rotated.authKey, {}, '/recover')).status).toBe(401);
  });
});

describe('delete my copy', () => {
  it('needs the token and the passphrase, then removes the vault, the envelopes and every device', async () => {
    const h = await start();
    const alice = await signup(h);
    const other = (await (await login(h, 'alice', alice.authKey)).json()) as { token: string };
    const proof = { kind: 'passphrase', authKey: alice.authKey };
    expect((await post(h, '/sync/v1/delete', { proof })).status).toBe(401);
    expect(
      (await call(h, alice, '/delete', { proof: { ...proof, authKey: b64(32, 4) } })).status,
    ).toBe(401);
    expect(h.store.vaultCount()).toBe(1);
    expect((await call(h, alice, '/delete', { proof })).status).toBe(200);
    expect(h.store.vaultCount()).toBe(0);
    expect((await getVault(h, alice)).status).toBe(401);
    expect((await getVault(h, { ...alice, token: other.token })).status).toBe(401);
    expect((await login(h, 'alice', alice.authKey)).status).toBe(401);
    // The handle is free again.
    expect((await post(h, '/sync/v1/signup', signupBody('alice'))).status).toBe(201);
  });
});

describe('the previous version', () => {
  it('is replaced only when it is older than the window', async () => {
    const h = await start({ SYNC_KEEP_PREVIOUS_HOURS: '24' });
    const alice = await signup(h);
    await put(h, alice, envelopeOf(2, alice.vaultId), '"1"');
    expect((await account(h, alice)).previousVersion).toBe(1);
    h.advance(60_000);
    await put(h, alice, envelopeOf(3, alice.vaultId), '"2"');
    await put(h, alice, envelopeOf(4, alice.vaultId), '"3"');
    expect((await account(h, alice)).previousVersion).toBe(1);
    const prev = (await (await getVault(h, alice, {}, '?previous=1')).json()) as {
      version: number;
    };
    expect(prev.version).toBe(1);
    h.advance(25 * 3_600_000);
    await put(h, alice, envelopeOf(5, alice.vaultId), '"4"');
    expect((await account(h, alice)).previousVersion).toBe(4);
  });
});

describe('invites', () => {
  it('a stored invite works once, is spent only by a vault that was created, and shows who used it', async () => {
    const h = await start({ SYNC_SIGNUP: 'invite' });
    const keys = createServerKeys(SECRET);
    expect(parse(await (await fetch(`${h.url}/sync/config.json`)).json())).toBe('closed');
    h.store.createInvite(keys.inviteDigest('FAMILY-ONE-0001'), 'for Anna', h.clock);
    expect(parse(await (await fetch(`${h.url}/sync/config.json`)).json())).toBe('invite');
    const withCode = (handle: string, invite: string, seed: number) =>
      post(h, '/sync/v1/signup', signupBody(handle, { invite }, seed));
    expect((await withCode('anna', 'WRONG-CODE-0001', 1)).status).toBe(403);
    await signup(h, 'taken', 9).catch(() => undefined);
    expect((await withCode('anna', 'FAMILY-ONE-0001', 1)).status).toBe(201);
    expect((await withCode('annb', 'FAMILY-ONE-0001', 2)).status).toBe(403);
    expect(h.store.listInvites()[0]).toMatchObject({ usedBy: 'anna', label: 'for Anna' });
    expect(parse(await (await fetch(`${h.url}/sync/config.json`)).json())).toBe('closed');
  });

  it('a handle that is taken does not burn the code; static codes stay reusable', async () => {
    const h = await start({ SYNC_SIGNUP: 'invite', SYNC_INVITE_CODES: 'SHARED-CODE-1' });
    const keys = createServerKeys(SECRET);
    h.store.createInvite(keys.inviteDigest('SINGLE-USE-1'), '', h.clock);
    const go = (handle: string, invite: string, seed: number) =>
      post(h, '/sync/v1/signup', signupBody(handle, { invite }, seed));
    expect((await go('anna', 'SHARED-CODE-1', 1)).status).toBe(201);
    expect((await go('bobby', 'SHARED-CODE-1', 2)).status).toBe(201);
    expect((await go('anna', 'SINGLE-USE-1', 3)).status).toBe(409);
    expect((await go('carol', 'SINGLE-USE-1', 4)).status).toBe(201);
    expect((await go('daniel', 'SINGLE-USE-1', 5)).status).toBe(403);
  });

  it('a revoked invite does not work', async () => {
    const h = await start({ SYNC_SIGNUP: 'invite' });
    const keys = createServerKeys(SECRET);
    const id = h.store.createInvite(keys.inviteDigest('REVOKED-ONE-1'), '', h.clock);
    expect(h.store.revokeInvite(id, h.clock)).toBe(true);
    expect(
      (await post(h, '/sync/v1/signup', signupBody('anna', { invite: 'REVOKED-ONE-1' }))).status,
    ).toBe(403);
  });
});

const parse = (body: unknown): string => (body as { signup: string }).signup;

describe('the admin CLI', () => {
  const run = (
    store: ReturnType<typeof openMemoryStore>,
    args: string[],
    now = 1_700_000_000_000,
  ) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = runAdmin(args, {
      store,
      keys: createServerKeys(SECRET),
      now: () => now,
      out: (t) => out.push(t),
      err: (t) => err.push(t),
    });
    return { code, out: out.join('\n'), err: err.join('\n') };
  };
  const seed = (store: ReturnType<typeof openMemoryStore>, handle: string, at: number) =>
    store.createVault(
      {
        handle,
        vaultId: b64(16),
        salt: b64(16),
        authDigest: Buffer.alloc(32),
        wrappedKey: b64(60),
        envelope: '{"x":1}',
        size: 2048,
      },
      at,
    );

  it('refuses a value flag followed by another flag, instead of taking the flag as its value', () => {
    const store = openMemoryStore();
    for (const args of [
      ['invites', 'create', '--label', '--yes'],
      ['invites', 'create', '--label'],
      ['invites', 'create', '--count', '--json'],
      ['prune', '--idle-days', '--yes'],
    ]) {
      const r = run(store, args);
      expect(r.code, args.join(' ')).toBe(2);
      expect(r.err).toContain('needs a value');
    }
    expect(store.listInvites()).toHaveLength(0);
  });

  it('creates single-use invites (shown once), lists and revokes them', () => {
    const store = openMemoryStore();
    const made = run(store, ['invites', 'create', '--label', 'for Anna', '--count', '2', '--json']);
    expect(made.code).toBe(0);
    const codes = JSON.parse(made.out) as { id: number; code: string }[];
    expect(codes).toHaveLength(2);
    expect(codes[0]!.code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    expect(store.usableInvite(createServerKeys(SECRET).inviteDigest(codes[0]!.code))).toBe(true);
    expect(run(store, ['invites', 'list']).out).toContain('for Anna');
    expect(run(store, ['invites', 'revoke', String(codes[0]!.id)]).code).toBe(0);
    expect(run(store, ['invites', 'revoke', String(codes[0]!.id)]).code).toBe(1);
    expect(run(store, ['invites', 'create', '--count', '0']).code).toBe(2);
  });

  it('lists vaults with metadata only, and totals', () => {
    const store = openMemoryStore();
    seed(store, 'alice', 1_000);
    const list = JSON.parse(run(store, ['list', '--json']).out) as Record<string, unknown>[];
    expect(Object.keys(list[0]!).sort()).toEqual(
      [
        'createdAt',
        'devices',
        'handle',
        'hasRecoveryKey',
        'lastSeenAt',
        'sizeBytes',
        'updatedAt',
        'version',
      ].sort(),
    );
    expect(run(store, ['list']).out).toContain('alice');
    expect(run(store, ['stats']).out).toContain('vaults: 1');
  });

  it('delete needs --yes; prune is a dry run unless told', () => {
    const store = openMemoryStore();
    const now = 1_700_000_000_000;
    seed(store, 'oldone', now - 100 * 86_400_000);
    seed(store, 'recent', now - 86_400_000);
    expect(run(store, ['delete', 'oldone'], now).code).toBe(1);
    expect(store.vaultCount()).toBe(2);
    const dry = run(store, ['prune', '--idle-days', '30'], now);
    expect(dry.out).toContain('oldone');
    expect(dry.out).not.toContain('recent');
    expect(store.vaultCount()).toBe(2);
    expect(run(store, ['prune', '--idle-days', '30', '--yes'], now).code).toBe(0);
    expect(store.vaultCount()).toBe(1);
    expect(run(store, ['delete', 'recent', '--yes'], now).code).toBe(0);
    expect(store.vaultCount()).toBe(0);
    expect(run(store, ['delete', 'nobody', '--yes'], now).code).toBe(1);
    expect(run(store, ['prune'], now).code).toBe(2);
  });
});

describe('the schema migration', () => {
  it('opens a version-1 database, keeps its vaults, and gives them no recovery key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'anc-relay-'));
    dirs.push(dir);
    const db = new DatabaseSync(join(dir, 'relay.sqlite'));
    db.exec(`
      CREATE TABLE vault (id INTEGER PRIMARY KEY, handle TEXT NOT NULL UNIQUE, vault_id TEXT NOT NULL, salt TEXT NOT NULL,
        auth_digest BLOB NOT NULL, wrapped_key TEXT NOT NULL, version INTEGER NOT NULL, envelope TEXT NOT NULL,
        size INTEGER NOT NULL, prev_version INTEGER, prev_envelope TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE device (token_digest BLOB PRIMARY KEY, vault_row INTEGER NOT NULL REFERENCES vault(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL);
      CREATE INDEX device_by_vault ON device(vault_row, created_at);
      INSERT INTO vault VALUES (1,'old','v','s',x'00','w',3,'{"e":1}',10,2,'{"p":1}',5,9);
      INSERT INTO device VALUES (x'01',1,5,9);
      PRAGMA user_version = 1;`);
    db.close();
    const store = openStore(dir);
    const row = store.vaultByHandle('old')!;
    expect(row).toMatchObject({
      version: 3,
      previousVersion: 2,
      recAuthDigest: null,
      createdAt: 5,
    });
    expect(store.listDevices(row.rowId)[0]).toMatchObject({ label: '', createdAt: 5 });
    store.close();
    expect(openStore(dir).vaultCount()).toBe(1);
  });
});
