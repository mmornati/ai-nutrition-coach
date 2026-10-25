// The three ways a device meets a vault (plan §3.6), over the real in-memory store, the real
// crypto (a fast stand-in for Argon2id) and a fake relay that behaves like the real one:
//   A  a new device restores              C  the first device creates the vault
//   B  a device with its own data joins   (dry-run preview, then Combine)
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VaultSnapshot } from '@anc/core';
import { at, memoryBundle, PASSPHRASE, seedPlate, unlockedBundle } from '../../app/testing';
import type { StoreBundle } from '../../storage';
import { KV_KEYS } from '../../storage/key-value-store';
import { en } from '../../i18n/en';
import { fr } from '../../i18n/fr';
import { fastKdf } from '../vault/testing';
import { readConnection } from './connection';
import { createServerVault } from './create';
import { previewJoin, joinServerCopy, profileDifferences } from './join';
import { restoreServerCopyIntoNewStore } from './restore';
import { createFailureText } from './messages';
import { openServerCopy } from './server-copy';
import { FakeRelay } from './testing/fake-relay';

const VAULT_PASSPHRASE = 'a vault passphrase';
const MAX = 20 * 1024 * 1024;

const snapshotOf = async (bundle: StoreBundle): Promise<VaultSnapshot> => {
  const read = await bundle.vault.readSnapshot();
  if (read.kind !== 'vault') throw new Error('read');
  return read.value;
};
const foods = async (bundle: StoreBundle) =>
  (await snapshotOf(bundle)).plates.flatMap((p) => p.entries.map((e) => e.displayName)).sort();

async function create(relay: FakeRelay, bundle: StoreBundle, handle = 'alice') {
  return createServerVault({
    client: relay,
    kdf: fastKdf,
    vault: bundle.vault,
    kv: bundle.kv,
    handle,
    passphrase: VAULT_PASSPHRASE,
    maxVaultBytes: MAX,
  });
}

async function firstDevice(relay: FakeRelay) {
  const a = await unlockedBundle();
  await seedPlate(a, at(8, 0), [['Porridge', 'starch']]);
  await seedPlate(a, at(12, 0), [['Salmon', 'protein']]);
  // A stamped setting, so the snapshot carries a clock reading.
  await a.kv.write(KV_KEYS.uiLocale, 'en');
  const made = await create(relay, a);
  if (made.kind !== 'created') throw new Error(`create: ${JSON.stringify(made)}`);
  return a;
}

describe('Case C: back up to this server', () => {
  it('creates the vault with one request and stores the connection on this device only', async () => {
    const relay = new FakeRelay();
    const a = await unlockedBundle();
    await seedPlate(a, at(12, 0), [['Salmon', 'protein']]);
    const made = await create(relay, a, 'alice');
    expect(made).toMatchObject({ kind: 'created', dirty: false });
    expect(relay.vaults.get('alice')?.version).toBe(1);
    expect(relay.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /signup']);
    expect(await readConnection(a.kv)).toMatchObject({ handle: 'alice', lastSeenVersion: 1 });
    // Nothing readable left: not the food, not the passphrase.
    expect(relay.wire).not.toContain('Salmon');
    expect(relay.wire).not.toContain(VAULT_PASSPHRASE);
    expect(Object.keys(JSON.parse(relay.requests[0]!.body) as object).sort()).toEqual([
      'authKey',
      'envelope',
      'handle',
      'salt',
      'wrappedKey',
    ]);
    // The connection never enters a snapshot (it would otherwise travel to every device).
    const snapshot = JSON.stringify(await snapshotOf(a));
    const connection = (await readConnection(a.kv))!;
    expect(snapshot).not.toContain(connection.token);
    expect(snapshot).not.toContain(connection.vaultKey);
  });

  it('names only what can be named: handle taken, closed, invite, full, rate limit, offline', async () => {
    const relay = new FakeRelay();
    const a = await unlockedBundle();
    expect((await create(relay, a, 'alice')).kind).toBe('created');
    const b = await unlockedBundle();
    expect(await create(relay, b, 'alice')).toMatchObject({ failure: 'handleTaken' });
    relay.signupMode = 'closed';
    expect(await create(relay, b, 'bobby')).toMatchObject({ failure: 'signupClosed' });
    relay.signupMode = 'invite';
    expect(await create(relay, b, 'bobby')).toMatchObject({ failure: 'inviteInvalid' });
    relay.rateLimited = true;
    expect(await create(relay, b, 'bobby')).toMatchObject({
      failure: 'rateLimited',
      retryAfterSeconds: 42,
    });
    relay.rateLimited = false;
    relay.offline = true;
    expect(await create(relay, b, 'bobby')).toMatchObject({ failure: 'offline' });
    relay.offline = false;
    relay.broken = true;
    expect(await create(relay, b, 'bobby')).toMatchObject({ failure: 'unavailable' });
    // A failure leaves this device without a connection.
    expect(await readConnection(b.kv)).toBeNull();
  });

  it('"handle taken" points at connecting to the existing copy (a signup whose answer was lost)', () => {
    for (const strings of [en, fr]) {
      const text = createFailureText('handleTaken', strings);
      expect(text).toContain(strings.server.joinHeading);
    }
  });

  it('refuses a weak passphrase or a bad handle before anything is derived or sent', async () => {
    const relay = new FakeRelay();
    const a = await unlockedBundle();
    const weak = await createServerVault({
      client: relay,
      kdf: fastKdf,
      vault: a.vault,
      kv: a.kv,
      handle: 'alice',
      passphrase: 'short',
      maxVaultBytes: MAX,
    });
    expect(weak).toMatchObject({ kind: 'failed', failure: { passphrase: 'tooShort' } });
    const bad = await create(relay, a, 'Not A Handle!');
    expect(bad).toMatchObject({ failure: 'invalidHandle' });
    expect(relay.requests).toEqual([]);
  });

  it('a different passphrase from the local one is allowed: the local store is untouched', async () => {
    const relay = new FakeRelay();
    const a = await unlockedBundle();
    expect(VAULT_PASSPHRASE).not.toBe(PASSPHRASE);
    expect((await create(relay, a)).kind).toBe('created');
  });
});

describe('Case A: a new device restores', () => {
  it('opens the copy, then creates the store with the same passphrase and applies it', async () => {
    const relay = new FakeRelay();
    const a = await firstDevice(relay);
    const before = relay.requests.length;

    const b = memoryBundle();
    await b.controller.initialize();
    const opened = await openServerCopy({
      client: relay,
      kdf: fastKdf,
      handle: ' Alice ',
      passphrase: VAULT_PASSPHRASE,
    });
    if (opened.kind !== 'opened') throw new Error(JSON.stringify(opened));
    expect(opened.copy.snapshot.plates).toHaveLength(2);
    // Opening wrote nothing anywhere: still a first run.
    expect(b.controller.getSnapshot().status).toBe('needsPassphraseCreation');

    const restored = await restoreServerCopyIntoNewStore({
      copy: opened.copy,
      passphrase: VAULT_PASSPHRASE,
      createStore: (p) => b.controller.createStore(p),
      vault: b.vault,
      kv: b.kv,
      eraser: b.eraser,
      now: Date.now,
    });
    expect(restored.kind).toBe('restored');
    expect(await foods(b)).toEqual(await foods(a));
    expect(await snapshotOf(b)).toEqual(await snapshotOf(a));
    expect(await readConnection(b.kv)).toMatchObject({ handle: 'alice', lastSeenVersion: 1 });
    expect(await b.kv.read(KV_KEYS.syncDirty)).toBeNull();
    // login (salt, login, vault) happened; nothing was pushed.
    expect(relay.requests.slice(before).map((r) => r.method + r.path)).toEqual([
      'POST/salt',
      'POST/login',
      'GET/vault',
    ]);
  });

  it('one ambiguous failure for an unknown handle and a wrong passphrase; the rest are separate', async () => {
    const relay = new FakeRelay();
    await firstDevice(relay);
    const open = (handle: string, passphrase: string) =>
      openServerCopy({ client: relay, kdf: fastKdf, handle, passphrase });
    const wrong = await open('alice', 'definitely not it');
    const unknown = await open('nobody', VAULT_PASSPHRASE);
    expect(wrong).toEqual({ kind: 'failed', failure: 'noMatch' });
    expect(unknown).toEqual(wrong);
    expect(await open('not a handle!', VAULT_PASSPHRASE)).toEqual({
      kind: 'failed',
      failure: 'invalidHandle',
    });
    relay.rateLimited = true;
    expect(await open('alice', VAULT_PASSPHRASE)).toEqual({
      kind: 'failed',
      failure: 'rateLimited',
      retryAfterSeconds: 42,
    });
    relay.rateLimited = false;
    relay.offline = true;
    expect(await open('alice', VAULT_PASSPHRASE)).toEqual({ kind: 'failed', failure: 'offline' });
    relay.offline = false;
    expect(await open('alice', 'definitely not it')).toEqual({
      kind: 'failed',
      failure: 'noMatch',
    });
  });

  it('a copy that will not open after a good login is "damaged", never a wrong passphrase', async () => {
    const relay = new FakeRelay();
    await firstDevice(relay);
    const vault = relay.vaults.get('alice')!;
    vault.envelope = { ...vault.envelope, ct: vault.envelope.ct.slice(0, -4) + 'AAAA' };
    expect(
      await openServerCopy({
        client: relay,
        kdf: fastKdf,
        handle: 'alice',
        passphrase: VAULT_PASSPHRASE,
      }),
    ).toEqual({ kind: 'failed', failure: 'damaged' });
  });

  it('a failure after the store was created leaves no store behind', async () => {
    const relay = new FakeRelay();
    await firstDevice(relay);
    const opened = await openServerCopy({
      client: relay,
      kdf: fastKdf,
      handle: 'alice',
      passphrase: VAULT_PASSPHRASE,
    });
    if (opened.kind !== 'opened') throw new Error('open');
    const b = memoryBundle();
    await b.controller.initialize();
    const broken = {
      ...b.vault,
      readSnapshot: () => b.vault.readSnapshot(),
      applySnapshot: () =>
        Promise.resolve({ kind: 'vaultFailed', reason: 'storeOperation' } as const),
    };
    const result = await restoreServerCopyIntoNewStore({
      copy: opened.copy,
      passphrase: VAULT_PASSPHRASE,
      createStore: (p) => b.controller.createStore(p),
      vault: broken,
      kv: b.kv,
      eraser: b.eraser,
      now: Date.now,
    });
    expect(result.kind).toBe('storeProblem');
    expect(b.controller.getSnapshot().status).toBe('needsPassphraseCreation');
  });

  it('refuses a weak passphrase or a clock far behind the copy, before creating anything', async () => {
    const relay = new FakeRelay();
    await firstDevice(relay);
    const opened = await openServerCopy({
      client: relay,
      kdf: fastKdf,
      handle: 'alice',
      passphrase: VAULT_PASSPHRASE,
    });
    if (opened.kind !== 'opened') throw new Error('open');
    const b = memoryBundle();
    await b.controller.initialize();
    let created = 0;
    const deps = {
      copy: opened.copy,
      vault: b.vault,
      kv: b.kv,
      eraser: b.eraser,
      createStore: (p: string) => {
        created++;
        return b.controller.createStore(p);
      },
    };
    expect(
      (await restoreServerCopyIntoNewStore({ ...deps, passphrase: 'short', now: Date.now })).kind,
    ).toBe('passphraseRejected');
    expect(
      (
        await restoreServerCopyIntoNewStore({
          ...deps,
          passphrase: VAULT_PASSPHRASE,
          now: () => 1000,
        })
      ).kind,
    ).toBe('clockAhead');
    expect(created).toBe(0);
  });
});

describe('Case B: a device with its own data joins', () => {
  async function joiner(relay: FakeRelay, build: (b: StoreBundle) => Promise<void>) {
    const b = await unlockedBundle();
    await build(b);
    const opened = await openServerCopy({
      client: relay,
      kdf: fastKdf,
      handle: 'alice',
      passphrase: VAULT_PASSPHRASE,
    });
    if (opened.kind !== 'opened') throw new Error('open');
    return { b, copy: opened.copy };
  }

  it('previews the combined result as a dry run: counts, nothing written', async () => {
    const relay = new FakeRelay();
    await firstDevice(relay);
    const { b, copy } = await joiner(relay, async (x) => {
      await seedPlate(x, at(9, 0), [['Toast', 'starch']]);
      await seedPlate(x, at(19, 0), [['Soup', 'vegFruit']]);
    });
    const before = await snapshotOf(b);
    const result = previewJoin(before, copy.snapshot, Date.now());
    if (result.kind !== 'preview') throw new Error('preview');
    expect(result.preview).toMatchObject({
      server: { count: 2 },
      device: { count: 2 },
      alreadyOnServer: 0,
      onlyOnDevice: 2,
      combined: 4,
      profile: null,
    });
    expect(await snapshotOf(b)).toEqual(before);
    expect(await readConnection(b.kv)).toBeNull();
  });

  it('counts plates the server already has (a device that was restored earlier)', async () => {
    const relay = new FakeRelay();
    await firstDevice(relay);
    const { b, copy } = await joiner(relay, async (x) => {
      // x already holds the server's two plates, plus one of its own.
      const opened = await openServerCopy({
        client: relay,
        kdf: fastKdf,
        handle: 'alice',
        passphrase: VAULT_PASSPHRASE,
      });
      if (opened.kind !== 'opened') throw new Error('open');
      await x.vault.applySnapshot(opened.copy.snapshot);
      await seedPlate(x, at(20, 0), [['Pasta', 'starch']]);
    });
    const result = previewJoin(await snapshotOf(b), copy.snapshot, Date.now());
    if (result.kind !== 'preview') throw new Error('preview');
    expect(result.preview).toMatchObject({ alreadyOnServer: 2, onlyOnDevice: 1, combined: 3 });
    expect(result.preview.device.count).toBe(3);
    expect(result.preview.server.first).not.toBeNull();
  });

  it('Combine deletes nothing, applies the union and leaves the device with a push to make', async () => {
    const relay = new FakeRelay();
    await firstDevice(relay);
    const { b, copy } = await joiner(relay, async (x) => {
      await seedPlate(x, at(9, 0), [['Toast', 'starch']]);
    });
    const joined = await joinServerCopy({
      vault: b.vault,
      kv: b.kv,
      copy,
      choice: { profile: null },
    });
    if (joined.kind !== 'joined') throw new Error(JSON.stringify(joined));
    expect(joined.dirty).toBe(true);
    expect(await foods(b)).toEqual(['Porridge', 'Salmon', 'Toast']);
    expect(await readConnection(b.kv)).toMatchObject({ lastSeenVersion: 1 });
    expect(await b.kv.read(KV_KEYS.syncDirty)).toBe('1');
  });

  it('joining a copy this device already has changes nothing and needs no push', async () => {
    const relay = new FakeRelay();
    const a = await firstDevice(relay);
    const opened = await openServerCopy({
      client: relay,
      kdf: fastKdf,
      handle: 'alice',
      passphrase: VAULT_PASSPHRASE,
    });
    if (opened.kind !== 'opened') throw new Error('open');
    const joined = await joinServerCopy({
      vault: a.vault,
      kv: a.kv,
      copy: opened.copy,
      choice: { profile: null },
    });
    expect(joined).toMatchObject({ kind: 'joined', dirty: false });
  });

  describe('a profile that differs by content', () => {
    const profile = (ageBand: string, extra = {}) =>
      JSON.stringify({ ageBand, sex: 'female', ...extra });

    async function setUp() {
      const relay = new FakeRelay();
      const a = await unlockedBundle();
      await seedPlate(a, at(8, 0), [['Porridge', 'starch']]);
      await a.kv.write(KV_KEYS.profile, profile('18-29'));
      expect((await create(relay, a)).kind).toBe('created');
      const { b, copy } = await joiner(relay, async (x) => {
        await seedPlate(x, at(9, 0), [['Toast', 'starch']]);
        await x.kv.write(KV_KEYS.profile, profile('30-49'));
      });
      return { relay, a, b, copy };
    }

    it('is found by content, field by field, and only when both sides have one', async () => {
      const { b, copy } = await setUp();
      expect(profileDifferences(await snapshotOf(b), copy.snapshot)).toEqual([
        { field: 'ageBand', device: '30-49', server: '18-29' },
      ]);
      const same = JSON.stringify({ sex: 'female', ageBand: '18-29' });
      await b.kv.write(KV_KEYS.profile, same);
      expect(profileDifferences(await snapshotOf(b), copy.snapshot)).toBeNull();
      await b.kv.delete(KV_KEYS.profile);
      expect(profileDifferences(await snapshotOf(b), copy.snapshot)).toBeNull();
    });

    it('keeping the server’s profile writes it again here with a fresh stamp, so it wins everywhere', async () => {
      const { b, copy } = await setUp();
      await joinServerCopy({ vault: b.vault, kv: b.kv, copy, choice: { profile: 'server' } });
      const entry = (await snapshotOf(b)).kv.find((e) => e.key === KV_KEYS.profile)!;
      expect(JSON.parse(entry.value)).toMatchObject({ ageBand: '18-29' });
      const original = copy.snapshot.kv.find((e) => e.key === KV_KEYS.profile)!;
      expect(entry.updatedAtHlc > original.updatedAtHlc).toBe(true);
    });

    it('keeping this device’s profile also re-stamps it: it beats the server’s and is pushed', async () => {
      const { b, copy } = await setUp();
      const joined = await joinServerCopy({
        vault: b.vault,
        kv: b.kv,
        copy,
        choice: { profile: 'device' },
      });
      expect(joined).toMatchObject({ kind: 'joined', dirty: true });
      const entry = (await snapshotOf(b)).kv.find((e) => e.key === KV_KEYS.profile)!;
      expect(JSON.parse(entry.value)).toMatchObject({ ageBand: '30-49' });
    });
  });

  describe('when this device’s clock is behind the other device’s', () => {
    afterEach(() => vi.useRealTimers());

    it.each(['device', 'server'] as const)(
      'the profile the person picked (%s) still wins, because it is written after the copy is applied',
      async (pick) => {
        const profile = (ageBand: string) => JSON.stringify({ ageBand, sex: 'female' });
        const base = Date.now();
        vi.useFakeTimers({ toFake: ['Date'], now: base + 3_600_000 });
        const relay = new FakeRelay();
        const a = await unlockedBundle();
        await seedPlate(a, at(8, 0), [['Porridge', 'starch']]);
        await a.kv.write(KV_KEYS.profile, profile('18-29'));
        expect((await create(relay, a)).kind).toBe('created');
        // Device B's wall clock is an hour BEHIND device A's.
        vi.setSystemTime(base);
        const { b, copy } = await joiner(relay, async (x) => {
          await seedPlate(x, at(9, 0), [['Toast', 'starch']]);
          await x.kv.write(KV_KEYS.profile, profile('30-49'));
        });
        const joined = await joinServerCopy({
          vault: b.vault,
          kv: b.kv,
          copy,
          choice: { profile: pick },
        });
        expect(joined.kind).toBe('joined');
        const entry = (await snapshotOf(b)).kv.find((e) => e.key === KV_KEYS.profile)!;
        expect(JSON.parse(entry.value)).toMatchObject({
          ageBand: pick === 'device' ? '30-49' : '18-29',
        });
        const original = copy.snapshot.kv.find((e) => e.key === KV_KEYS.profile)!;
        expect(entry.updatedAtHlc > original.updatedAtHlc).toBe(true);
      },
    );
  });

  it('refuses a copy from a newer schema without writing', async () => {
    const relay = new FakeRelay();
    await firstDevice(relay);
    const { b, copy } = await joiner(relay, async (x) => {
      await seedPlate(x, at(9, 0), [['Toast', 'starch']]);
    });
    const newer = {
      ...copy,
      snapshot: { ...copy.snapshot, schemaVersion: copy.snapshot.schemaVersion + 1 },
    };
    expect(previewJoin(await snapshotOf(b), newer.snapshot, Date.now())).toEqual({
      kind: 'refused',
      reason: 'schemaTooNew',
    });
    const before = await snapshotOf(b);
    expect(
      (await joinServerCopy({ vault: b.vault, kv: b.kv, copy: newer, choice: { profile: null } }))
        .kind,
    ).toBe('failed');
    expect(await snapshotOf(b)).toEqual(before);
    expect(await readConnection(b.kv)).toBeNull();
  });
});
