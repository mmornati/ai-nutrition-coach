// Real multi-device sync (phase S3): the pull on unlock and on focus, what it costs when nothing
// changed, the honest `synced` chip (AD-6), the refusals (a newer app's copy, a revoked token, a
// rolled-back relay, a clock that disagrees), and the lifecycle (lock, disconnect, erase mid-pull).
// Real stores, real crypto, a fake relay that behaves like the real one, time and page events
// driven by hand.
import { describe, expect, it } from 'vitest';
import { decodeBase64Url, formatHlc, type SyncOpStatus, type VaultSnapshot } from '@anc/core';
import { at, seedPlate } from '../../app/testing';
import { KV_KEYS } from '../../storage/key-value-store';
import { clearConnection, readConnection, writeConnection } from './connection';
import { runSyncCycle } from './cycle';
import { importVaultKey, sealSnapshot } from './crypto';
import { DirtyFlagSyncQueue } from './dirty-queue';
import { headerChipOf } from './chip';
import { SyncLedger, uidToken, writeHeld } from './ledger';
import { FakeRelay } from './testing/fake-relay';
import {
  attach,
  connected,
  foods,
  MAX,
  phase,
  puts,
  secondDevice,
  snapshotOf,
  status,
  type Device,
} from './testing/devices';

const tick = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

/** Waits for the round that was just started (if any) to be over. */
async function idle(d: Device): Promise<void> {
  await tick();
  for (let i = 0; i < 400 && phase(d) === 'syncing'; i++) await tick();
  await tick();
}

/** The chip of each plate, by the first food on it. */
async function chips(d: Device): Promise<Record<string, string>> {
  let got: readonly SyncOpStatus[] = [];
  const off = d.queue.watchPerPlate({
    next: (v) => {
      got = v;
    },
    error: () => undefined,
  });
  await tick();
  off();
  const read = await d.bundle.store.readRange({});
  if (read.kind !== 'platesRead') throw new Error('read');
  return Object.fromEntries(
    read.plates.map((p) => [
      p.entries[0]?.databaseFood.displayName ?? '?',
      got.find((s) => s.plateLogId === p.id)?.status ?? 'missing',
    ]),
  );
}

const header = (d: Device) => headerChipOf(status(d));
const gets = (relay: FakeRelay) => relay.requests.filter((r) => r.method === 'GET');

/** A clock the test moves by hand. */
function time(start = 1_900_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

/** Device A, already connected, with a clock of ours (its start-of-session pull not yet fired). */
async function connectedAt(clock: ReturnType<typeof time>, relay = new FakeRelay()) {
  const first = await connected(relay);
  first.a.stop();
  return { relay, a: await attach(first.a.bundle, relay, { now: clock.now }) };
}

/** Another device's change, sent: it seeds a plate and pushes it. */
async function elsewhereLogs(relay: FakeRelay, food: string) {
  const b = await secondDevice(relay);
  await seedPlate(b.bundle, at(19, 0), [[food, 'protein']]);
  expect(await b.service.syncNow()).toEqual({ kind: 'backedUp' });
  b.stop();
  return b;
}

describe('the chip is honest: synced only after the relay acknowledged a snapshot that held the plate', () => {
  it('a plate is pending until then, and the others stay synced', async () => {
    const { a } = await connected();
    expect(await chips(a)).toEqual({ Porridge: 'synced' });
    expect(header(a)).toMatchObject({ hasTransport: true, status: 'synced' });
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    expect(await chips(a)).toEqual({ Porridge: 'synced', Salmon: 'pending' });
    expect(header(a).status).toBe('pending');
    await a.clock.fire();
    expect(await chips(a)).toEqual({ Porridge: 'synced', Salmon: 'synced' });
    expect(header(a).status).toBe('synced');
  });

  it('a plate written while the push is on the wire stays pending: the acknowledgement covers what was read', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    relay.racePending = async () => {
      await seedPlate(a.bundle, at(13, 0), [['Rice', 'starch']]);
    };
    await a.clock.fire();
    expect(await chips(a)).toEqual({ Porridge: 'synced', Salmon: 'synced', Rice: 'pending' });
    expect(header(a).status).toBe('pending');
    await a.clock.fire();
    expect(await chips(a)).toEqual({ Porridge: 'synced', Salmon: 'synced', Rice: 'synced' });
  });

  it('a push that did not go through makes nothing synced; it says "retry later"', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    relay.broken = true;
    await a.clock.fire();
    expect(await chips(a)).toEqual({ Porridge: 'synced', Salmon: 'failed' });
    expect(header(a).status).toBe('failed');
    relay.broken = false;
    await a.clock.fire();
    expect(await chips(a)).toEqual({ Porridge: 'synced', Salmon: 'synced' });
  });

  it('offline: the plate is pending (waiting), not failed, and not synced', async () => {
    const { a } = await connected();
    a.online.value = false;
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.clock.fire();
    expect(phase(a)).toBe('offline');
    expect(await chips(a)).toEqual({ Porridge: 'synced', Salmon: 'pending' });
    expect(header(a).status).toBe('pending');
  });

  it('after a reload a plate still waiting is pending and one the relay holds is synced', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    a.stop();
    const next = await attach(a.bundle, relay);
    expect(await chips(next)).toEqual({ Porridge: 'synced', Salmon: 'pending' });
    expect(header(next).status).toBe('pending');
    await next.clock.fire();
    expect(await chips(next)).toEqual({ Porridge: 'synced', Salmon: 'synced' });
    next.stop();
    // And once more: nothing waits, so nothing is pending forever.
    const again = await attach(a.bundle, relay);
    expect(await chips(again)).toEqual({ Porridge: 'synced', Salmon: 'synced' });
    expect(header(again).status).toBe('synced');
  });

  it('when the device does not know what the relay holds, nothing is called synced until it does', async () => {
    const { relay, a } = await connected();
    a.stop();
    await a.bundle.kv.delete(KV_KEYS.syncBaseline);
    const clock = time();
    const next = await attach(a.bundle, relay, { now: clock.now });
    expect(status(next)).toMatchObject({ known: false });
    expect(await chips(next)).toEqual({ Porridge: 'pending' });
    expect(header(next).status).toBe('pending');
    // The pull after unlock cannot be a 304 (that would tell nothing about what the relay holds):
    // it reads the vault whole, and what it fetched is what the relay holds. Now it knows.
    relay.requests.length = 0;
    await next.clock.fire();
    expect(gets(relay)).toHaveLength(1);
    expect(gets(relay)[0]?.ifNoneMatch).toBeUndefined();
    expect(relay.notModified).toBe(0);
    expect(puts(relay)).toEqual([]);
    expect(status(next)).toMatchObject({ known: true });
    expect(await chips(next)).toEqual({ Porridge: 'synced' });
    // From then on the cheap conditional read is back.
    relay.requests.length = 0;
    clock.advance(61_000);
    next.clock.return();
    await idle(next);
    expect(gets(relay)).toHaveLength(1);
    expect(gets(relay)[0]?.ifNoneMatch).toBeDefined();
  });

  it('a lost dirty flag with an unknown ledger: the full read finds the unsent plate, marks it, and sends it (never "synced" for what the relay never got)', async () => {
    const { relay, a } = await connected();
    a.stop();
    // The plate was logged but the flag never reached the store (tab killed), and the baseline is gone.
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.bundle.kv.delete(KV_KEYS.syncDirty);
    await a.bundle.kv.delete(KV_KEYS.syncBaseline);
    const next = await attach(a.bundle, relay);
    expect(next.queue.dirty).toBe(false);
    expect(await chips(next)).toEqual({ Porridge: 'pending', Salmon: 'pending' });
    relay.requests.length = 0;
    await next.clock.fire();
    expect(gets(relay)[0]?.ifNoneMatch).toBeUndefined();
    expect(puts(relay)).toHaveLength(1);
    expect(relay.vaults.get('alice')?.version).toBe(2);
    expect(await chips(next)).toEqual({ Porridge: 'synced', Salmon: 'synced' });
  });

  it('a lost dirty flag with a known ledger: the unsent plate is pending, not synced, and is sent', async () => {
    const { relay, a } = await connected();
    a.stop();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.bundle.kv.delete(KV_KEYS.syncDirty);
    const next = await attach(a.bundle, relay);
    expect(next.queue.dirty).toBe(false);
    // The device notices that a plate it holds is in nothing the relay acknowledged, and marks it.
    await tick();
    expect(await chips(next)).toEqual({ Porridge: 'synced', Salmon: 'pending' });
    expect(next.queue.dirty).toBe(true);
    expect(puts(relay)).toEqual([]);
    await next.clock.fire();
    expect(puts(relay)).toHaveLength(1);
    expect(await chips(next)).toEqual({ Porridge: 'synced', Salmon: 'synced' });
  });

  it('a 304 round never reports what the device merely holds as held by the relay', async () => {
    const { relay, a } = await connected();
    a.stop();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    const connection = (await readConnection(a.bundle.kv))!;
    const queue = new DirtyFlagSyncQueue(a.bundle.kv);
    await queue.load(true); // the stored flag says clean
    expect(queue.dirty).toBe(false);
    const held: VaultSnapshot[] = [];
    const result = await runSyncCycle({
      connection: { ...connection },
      vaultKey: await importVaultKey(decodeBase64Url(connection.vaultKey)!),
      client: relay,
      vault: a.bundle.vault,
      kv: a.bundle.kv,
      queue,
      maxVaultBytes: MAX,
      now: Date.now,
      ledgerKnown: () => true,
      onHeld: (snapshot) => held.push(snapshot),
    });
    expect(result).toEqual({ kind: 'upToDate' });
    expect(relay.notModified).toBe(1);
    expect(held).toEqual([]);
  });

  it('a dirty flag that cannot be read is dirty (fail closed), not clean', async () => {
    const { a } = await connected();
    a.stop();
    const kv = a.bundle.kv;
    const broken = {
      read: (key: string) =>
        key === KV_KEYS.syncDirty ? Promise.reject(new Error('locked')) : kv.read(key),
      write: kv.write.bind(kv),
      delete: kv.delete.bind(kv),
    };
    const queue = new DirtyFlagSyncQueue(broken);
    await queue.load(true);
    expect(queue.dirty).toBe(true);
    const off = new DirtyFlagSyncQueue(broken);
    await off.load(false);
    expect(off.dirty).toBe(false);
  });

  it('sealing is not a point of no return: a disconnect while the snapshot is sealed uploads nothing', async () => {
    const { relay, a } = await connected();
    a.stop();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    const connection = (await readConnection(a.bundle.kv))!;
    const queue = new DirtyFlagSyncQueue(a.bundle.kv);
    await queue.load(true);
    queue.markDirty();
    let current = true;
    relay.requests.length = 0;
    const result = await runSyncCycle({
      connection: { ...connection },
      vaultKey: await importVaultKey(decodeBase64Url(connection.vaultKey)!),
      client: relay,
      vault: a.bundle.vault,
      kv: a.bundle.kv,
      queue,
      maxVaultBytes: MAX,
      now: Date.now,
      isCurrent: () => current,
      // The nonce is drawn while sealing: the connection goes away right then.
      random: (length) => {
        current = false;
        return globalThis.crypto.getRandomValues(new Uint8Array(length));
      },
    });
    expect(result).toEqual({ kind: 'locked' });
    expect(puts(relay)).toEqual([]);
    expect(relay.vaults.get('alice')?.version).toBe(1);
  });

  it('a baseline that is damaged reads as unknown, never as synced', async () => {
    const { a } = await connected();
    const kv = a.bundle.kv;
    for (const bad of ['', '1:abc', '2:' + 'a'.repeat(11), '1:' + 'A'.repeat(11), 'garbage']) {
      await kv.write(KV_KEYS.syncBaseline, bad);
      const ledger = new SyncLedger(kv);
      await ledger.load();
      expect(ledger.known).toBe(false);
      expect(ledger.holds('anything')).toBe(false);
    }
  });

  it('a plate that arrived by pull is synced at once (the relay handed it over); one of its own that is not there yet is not', async () => {
    const { relay, a } = await connected();
    const b = await secondDevice(relay);
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.clock.fire();
    await seedPlate(b.bundle, at(19, 0), [['Soup', 'vegFruit']]);
    expect(await chips(b)).toEqual({ Porridge: 'synced', Soup: 'pending' });
    // The push fails after the pull: the relay's plate is synced here, the device's own is not.
    relay.putVault = () => Promise.resolve({ kind: 'error', error: 'unavailable' } as const);
    expect(await b.service.syncNow()).toEqual({ kind: 'retryLater', reason: 'unavailable' });
    expect(await chips(b)).toEqual({ Porridge: 'synced', Salmon: 'synced', Soup: 'failed' });
  });

  it('one token per plate uid, fixed width, and different uids differ', () => {
    const a = uidToken('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b');
    const b = uidToken('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c');
    expect(a).toMatch(/^[0-9a-z]{11}$/);
    expect(b).toMatch(/^[0-9a-z]{11}$/);
    expect(a).not.toBe(b);
    expect(uidToken('x')).toBe(uidToken('x'));
  });
});

describe('pulling on unlock and on focus', () => {
  it('a pull a moment after unlock takes what another device did, tells the screens, and sends nothing', async () => {
    const { relay, a } = await connected();
    await elsewhereLogs(relay, 'Salmon');
    a.stop();
    const next = await attach(a.bundle, relay);
    let told = 0;
    next.service.onRemoteChange(() => told++);
    expect(next.clock.waits()).toEqual([1_000]);
    relay.requests.length = 0;
    await next.clock.fire();
    expect(await foods(next.bundle)).toEqual(['Porridge', 'Salmon']);
    expect(told).toBe(1);
    expect(next.service.getRemoteRevision()).toBe(1);
    expect(puts(relay)).toEqual([]);
    expect(next.queue.dirty).toBe(false);
    expect(await chips(next)).toEqual({ Porridge: 'synced', Salmon: 'synced' });
  });

  it('an unchanged vault is a cheap "not modified": nothing applied, nobody told', async () => {
    const { relay, a } = await connected();
    let told = 0;
    a.service.onRemoteChange(() => told++);
    await a.clock.fire();
    expect(relay.notModified).toBe(1);
    expect(told).toBe(0);
    expect(a.service.getRemoteRevision()).toBe(0);
  });

  it('a pull that brings nothing new in content tells nobody either', async () => {
    const { relay, a } = await connected();
    const b = await secondDevice(relay);
    // B pushes a copy with the same content (a push without a change is not made, so force one).
    await b.service.syncNow();
    const remote = relay.vaults.get('alice')!;
    expect(remote.version).toBe(1);
    let told = 0;
    a.service.onRemoteChange(() => told++);
    await a.service.syncNow();
    expect(told).toBe(0);
  });

  it('focus and visibility pull, at most once per interval, and the two events together are one request', async () => {
    const clock = time();
    const { relay, a } = await connectedAt(clock);
    await a.clock.fire();
    relay.requests.length = 0;

    clock.advance(10_000);
    a.clock.return();
    await idle(a);
    expect(relay.requests).toEqual([]);

    clock.advance(40_000);
    a.clock.return();
    await idle(a);
    expect(gets(relay)).toHaveLength(1);
    expect(puts(relay)).toEqual([]);

    clock.advance(5_000);
    a.clock.show();
    a.clock.focus();
    await idle(a);
    expect(gets(relay)).toHaveLength(1);
  });

  it('coming back online pulls at once (the wait was real), but never two rounds at the same time', async () => {
    const clock = time();
    const { relay, a } = await connectedAt(clock);
    await a.clock.fire();
    relay.requests.length = 0;
    clock.advance(1_000);
    a.clock.online();
    a.clock.online();
    await idle(a);
    expect(gets(relay)).toHaveLength(1);
  });

  it('while offline a focus asks nothing and schedules nothing', async () => {
    const clock = time();
    const { relay, a } = await connectedAt(clock);
    await a.clock.fire();
    relay.requests.length = 0;
    a.online.value = false;
    clock.advance(120_000);
    a.clock.return();
    await idle(a);
    expect(relay.requests).toEqual([]);
    expect(a.clock.waits()).toEqual([]);
    expect(header(a).status).toBe('synced');
  });

  it('going to the background pulls nothing when nothing waits', async () => {
    const clock = time();
    const { relay, a } = await connectedAt(clock);
    await a.clock.fire();
    relay.requests.length = 0;
    clock.advance(120_000);
    a.clock.hide();
    await idle(a);
    expect(relay.requests).toEqual([]);
  });

  it('two idle devices never ping-pong: many focus events, zero pushes, the version does not move', async () => {
    const clock = time();
    const { relay, a } = await connectedAt(clock);
    const b = await secondDevice(relay, { now: clock.now });
    await a.clock.fire();
    await b.clock.fire();
    relay.requests.length = 0;

    for (let i = 0; i < 60; i++) {
      clock.advance(61_000);
      a.clock.return();
      await idle(a);
      b.clock.return();
      await idle(b);
    }
    expect(puts(relay)).toEqual([]);
    expect(relay.vaults.get('alice')?.version).toBe(1);
    expect(gets(relay).length).toBeGreaterThanOrEqual(120);
    expect(relay.notModified).toBeGreaterThanOrEqual(120);

    // One device writes once; after the one push, the rest is quiet again on both.
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.clock.fire();
    expect(relay.vaults.get('alice')?.version).toBe(2);
    for (let i = 0; i < 40; i++) {
      clock.advance(61_000);
      b.clock.return();
      await idle(b);
      a.clock.return();
      await idle(a);
    }
    expect(puts(relay)).toHaveLength(1);
    expect(relay.vaults.get('alice')?.version).toBe(2);
    expect(await foods(b.bundle)).toEqual(['Porridge', 'Salmon']);
    expect(a.queue.dirty).toBe(false);
    expect(b.queue.dirty).toBe(false);
    expect(await chips(b)).toEqual({ Porridge: 'synced', Salmon: 'synced' });
  });

  it('every kind of record settles: saved meals, recipes, synced settings, notes, dismissals and tombstones never make two idle devices push', async () => {
    const clock = time();
    const { relay, a } = await connectedAt(clock);
    const b = await secondDevice(relay, { now: clock.now });
    await a.clock.fire();
    await b.clock.fire();

    const id = (n: number): string => `0190a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;
    const hlc = formatHlc({
      wallMs: Date.now() - 60_000,
      counter: 1,
      deviceId: 'abcdef0123456789',
    });
    const base = await snapshotOf(a.bundle);
    const plate = base.plates[0]!;
    const food = plate.entries[0]!;
    const rich: VaultSnapshot = {
      ...base,
      plates: [
        {
          ...plate,
          notes: [
            {
              uid: id(10),
              anchor: 'plate',
              questionKey: 'q1',
              noteText: 'Nice and simple.',
              generatedAt: '2026-01-01T08:00:00.000Z',
              interactions: [{ uid: id(11), kind: 'seen', at: '2026-01-01T08:01:00.000Z' }],
            },
          ],
        },
      ],
      dismissals: [{ key: `note:${id(10)}`, dismissedAtUtc: '2026-01-01T08:02:00.000Z' }],
      savedMeals: [
        {
          uid: id(20),
          name: 'Usual breakfast',
          createdAtUtc: '2026-01-01T07:00:00.000Z',
          updatedAtHlc: hlc,
          items: [{ ...food, uid: id(21) }],
        },
      ],
      recipes: [
        {
          uid: id(30),
          name: 'Soup',
          servings: 4,
          cookedWeightGrams: '1200',
          createdAtUtc: '2026-01-01T07:00:00.000Z',
          updatedAtHlc: hlc,
          items: [{ ...food, uid: id(31) }],
        },
      ],
      kv: [
        { key: 'ui.locale', value: 'fr', updatedAtHlc: hlc },
        { key: 'ui.showNumbers', value: 'off', updatedAtHlc: hlc },
      ],
      tombstones: [{ uid: id(40), table: 'saved_meal', deletedAtHlc: hlc }],
    };
    const applied = await a.bundle.vault.applySnapshot(rich);
    expect(applied.kind).not.toBe('vaultFailed');
    a.service.noteWrite();
    await a.clock.fire();
    expect(puts(relay)).toHaveLength(1);
    clock.advance(61_000);
    b.clock.return();
    await idle(b);
    // Both hold the records now (b through a pull, a through its own write).
    for (const d of [a, b]) {
      const held = await snapshotOf(d.bundle);
      expect(held.savedMeals.map((m) => m.name)).toEqual(['Usual breakfast']);
      expect(held.recipes.map((r) => r.name)).toEqual(['Soup']);
      expect(held.kv.map((e) => e.key)).toEqual(expect.arrayContaining(['ui.locale']));
      expect(held.dismissals).toHaveLength(1);
      expect(held.tombstones).toHaveLength(1);
      expect(held.plates[0]?.notes).toHaveLength(1);
    }
    relay.requests.length = 0;
    const version = relay.vaults.get('alice')?.version;

    for (let i = 0; i < 40; i++) {
      clock.advance(61_000);
      a.clock.return();
      await idle(a);
      b.clock.return();
      await idle(b);
    }
    expect(puts(relay)).toEqual([]);
    expect(relay.vaults.get('alice')?.version).toBe(version);
    expect(a.queue.dirty).toBe(false);
    expect(b.queue.dirty).toBe(false);
  });

  it('a device with its own change pushes it (once) after the pull, and the other device takes it without pushing', async () => {
    const clock = time();
    const { relay, a } = await connectedAt(clock);
    const b = await secondDevice(relay, { now: clock.now });
    await seedPlate(b.bundle, at(19, 0), [['Soup', 'vegFruit']]);
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.clock.fire();
    await b.clock.fire();
    clock.advance(61_000);
    a.clock.return();
    await idle(a);
    clock.advance(61_000);
    b.clock.return();
    await idle(b);
    expect(await foods(a.bundle)).toEqual(['Porridge', 'Salmon', 'Soup']);
    expect(await foods(b.bundle)).toEqual(['Porridge', 'Salmon', 'Soup']);
    expect(puts(relay)).toHaveLength(2);
    expect(await chips(a)).toEqual({ Porridge: 'synced', Salmon: 'synced', Soup: 'synced' });
    expect(await chips(b)).toEqual({ Porridge: 'synced', Salmon: 'synced', Soup: 'synced' });
  });
});

/** A snapshot of `d`, changed, sealed as the relay's next version. */
async function putOnRelay(
  relay: FakeRelay,
  d: Device,
  change: (s: VaultSnapshot) => unknown,
  version = 2,
): Promise<void> {
  const connection = (await readConnection(d.bundle.kv))!;
  const key = await importVaultKey(decodeBase64Url(connection.vaultKey)!);
  const sealed = await sealSnapshot(
    key,
    connection.vaultId,
    version,
    change(await snapshotOf(d.bundle)) as VaultSnapshot,
    MAX,
  );
  if (sealed.kind !== 'sealed') throw new Error('seal');
  const remote = relay.vaults.get('alice')!;
  remote.version = version;
  remote.envelope = sealed.envelope;
}

describe('schema skew: a copy from a newer app', () => {
  for (const [name, change] of [
    ['a newer store schema', (s: VaultSnapshot) => ({ ...s, schemaVersion: 99 })],
  ] as const) {
    it(`${name}: sync stops, nothing is pushed or overwritten, and it says to update the app`, async () => {
      const clock = time();
      const { relay, a } = await connectedAt(clock);
      await a.clock.fire();
      await putOnRelay(relay, a, change);
      const remoteBefore = relay.vaults.get('alice')!.envelope;
      await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
      relay.requests.length = 0;

      clock.advance(61_000);
      a.clock.return();
      await idle(a);
      expect(phase(a)).toBe('needsUpdate');
      expect(header(a)).toMatchObject({ hasTransport: true, needsUpdate: true });
      expect(puts(relay)).toEqual([]);
      expect(relay.vaults.get('alice')!.envelope).toBe(remoteBefore);
      expect(await foods(a.bundle)).toEqual(['Porridge', 'Salmon']);
      expect(a.clock.waits()).toEqual([]);

      // Stopped means stopped: focus, a write and the page going away start nothing.
      relay.requests.length = 0;
      clock.advance(600_000);
      a.clock.return();
      await seedPlate(a.bundle, at(13, 0), [['Rice', 'starch']]);
      a.clock.hide();
      await idle(a);
      expect(relay.requests).toEqual([]);
      expect(a.clock.waits()).toEqual([]);

      // "Back up now" looks once more, and still never writes.
      expect(await a.service.syncNow()).toEqual({ kind: 'stopped', reason: 'needsUpdate' });
      expect(puts(relay)).toEqual([]);
      // The plates are shown as waiting, calmly: nothing claims they are on the server.
      expect(await chips(a)).toEqual({ Porridge: 'synced', Salmon: 'failed', Rice: 'failed' });
    });
  }
});

describe('lifecycle: every way a round can end leaves a clear state and no partial data', () => {
  it('a revoked token mid-session: signed out, plates not synced, no more requests until "Back up now"', async () => {
    const clock = time();
    const { relay, a } = await connectedAt(clock);
    await a.clock.fire();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    relay.revoked = true;
    clock.advance(61_000);
    a.clock.return();
    await idle(a);
    expect(phase(a)).toBe('signedOut');
    expect(header(a).status).toBe('failed');
    expect(await chips(a)).toEqual({ Porridge: 'synced', Salmon: 'failed' });
    relay.requests.length = 0;
    clock.advance(61_000);
    a.clock.return();
    await idle(a);
    expect(relay.requests).toEqual([]);
    relay.revoked = false;
    expect(await a.service.syncNow()).toEqual({ kind: 'backedUp' });
    expect(await chips(a)).toEqual({ Porridge: 'synced', Salmon: 'synced' });
  });

  it('the relay is down during a pull: offline, a growing wait, and back to normal when it returns', async () => {
    const clock = time();
    const { relay, a } = await connectedAt(clock);
    await a.clock.fire();
    relay.offline = true;
    clock.advance(61_000);
    a.clock.return();
    await idle(a);
    expect(phase(a)).toBe('offline');
    expect(a.clock.waits()).toEqual([60_000]);
    // Nothing is waiting, so the device is still what it was: it does not call itself unsynced.
    expect(header(a).status).toBe('synced');
    relay.offline = false;
    await a.clock.fire();
    expect(phase(a)).toBe('backedUp');
    expect(a.clock.waits()).toEqual([]);
  });

  it('a relay that went back to an older copy: rolled back on a pull, nothing written either way', async () => {
    const clock = time();
    const { relay, a } = await connectedAt(clock);
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.clock.fire();
    await a.clock.fire().catch(() => undefined);
    const remote = relay.vaults.get('alice')!;
    remote.version = 1;
    remote.envelope = remote.previous!;
    relay.requests.length = 0;
    clock.advance(61_000);
    a.clock.return();
    await idle(a);
    expect(phase(a)).toBe('rolledBack');
    expect(puts(relay)).toEqual([]);
    expect(await foods(a.bundle)).toEqual(['Porridge', 'Salmon']);
    expect(header(a).status).toBe('failed');
  });

  it('a copy dated further ahead than this clock allows: paused, the store is untouched', async () => {
    const clock = time();
    const { relay, a } = await connectedAt(clock);
    await a.clock.fire();
    const ahead = formatHlc({
      wallMs: 4_000_000_000_000,
      counter: 0,
      deviceId: 'abcdef0123456789',
    });
    await putOnRelay(relay, a, (s) => ({
      ...s,
      kv: [...s.kv, { key: 'ui.locale', value: 'fr', updatedAtHlc: ahead }],
    }));
    const before = await snapshotOf(a.bundle);
    relay.requests.length = 0;
    clock.advance(61_000);
    a.clock.return();
    await idle(a);
    expect(phase(a)).toBe('paused');
    expect(puts(relay)).toEqual([]);
    expect(await snapshotOf(a.bundle)).toEqual(before);
    expect(a.service.getRemoteRevision()).toBe(0);
  });

  it('the app locks while a pull is on the wire: nothing is applied, nothing throws, nobody is told', async () => {
    const { relay, a } = await connected();
    const b = await secondDevice(relay);
    await seedPlate(b.bundle, at(19, 0), [['Salmon', 'protein']]);
    await b.service.syncNow();
    let told = 0;
    a.service.onRemoteChange(() => told++);
    relay.requests.length = 0;
    relay.racePull = async () => {
      // The session is torn down (what a lock does to it) while the answer is still coming.
      a.service.dispose();
      await a.bundle.controller.lock();
    };
    await a.service.syncNow().catch(() => undefined);
    await tick();
    expect(told).toBe(0);
    expect(puts(relay)).toEqual([]);
    expect(await a.bundle.kv.read(KV_KEYS.syncLastSeenVersion)).toBeNull(); // locked: nothing known
  });

  it('disconnecting while a pull is on the wire: its copy is not applied and no connection is left behind', async () => {
    const { relay, a } = await connected();
    await elsewhereLogs(relay, 'Salmon');
    let told = 0;
    a.service.onRemoteChange(() => told++);
    relay.requests.length = 0;
    relay.racePull = async () => {
      await a.service.disconnect();
    };
    await a.service.syncNow().catch(() => undefined);
    await tick();
    expect(await foods(a.bundle)).toEqual(['Porridge']);
    expect(told).toBe(0);
    expect(status(a)).toEqual({ connected: false });
    expect(await readConnection(a.bundle.kv)).toBeNull();
    expect(await a.bundle.kv.read(KV_KEYS.syncBaseline)).toBeNull();
    expect(puts(relay)).toEqual([]);
  });

  it('erase-all while a pull is on the wire: the late copy does not come back to an erased device', async () => {
    const { relay, a } = await connected();
    await elsewhereLogs(relay, 'Salmon');
    relay.requests.length = 0;
    relay.racePull = async () => {
      await a.bundle.eraser.eraseAll();
    };
    await a.service.syncNow().catch(() => undefined);
    await tick();
    expect(a.bundle.controller.getSnapshot().status).toBe('needsPassphraseCreation');
    expect((await a.bundle.vault.readSnapshot()).kind).toBe('vaultFailed');
    expect(puts(relay)).toEqual([]);
  });

  it('a push that loses to another device pulls its work in, then pushes both', async () => {
    const clock = time();
    const { relay, a } = await connectedAt(clock);
    await a.clock.fire();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    relay.racePending = async () => {
      const b = await secondDevice(relay);
      await seedPlate(b.bundle, at(19, 0), [['Soup', 'vegFruit']]);
      await b.service.syncNow();
      b.stop();
    };
    await a.clock.fire();
    expect(relay.vaults.get('alice')?.version).toBe(3);
    expect(await foods(a.bundle)).toEqual(['Porridge', 'Salmon', 'Soup']);
    expect(await chips(a)).toEqual({ Porridge: 'synced', Salmon: 'synced', Soup: 'synced' });
  });
});

describe('a stale baseline never describes another vault', () => {
  const plateOf = (n: number) => ({
    uid: `0190a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`,
  });
  const withPlates = (n: number) =>
    ({ plates: Array.from({ length: n }, (_, i) => plateOf(i)) }) as unknown as VaultSnapshot;

  it('a history too large to keep drops the old baseline instead of leaving it', async () => {
    const { a } = await connected();
    expect(await a.bundle.kv.read(KV_KEYS.syncBaseline)).not.toBeNull();
    await writeHeld(a.bundle.kv, withPlates(50_001));
    expect(await a.bundle.kv.read(KV_KEYS.syncBaseline)).toBeNull();
  });

  it('a write that fails drops the old baseline instead of leaving it', async () => {
    const { a } = await connected();
    const kv = a.bundle.kv;
    const failing = {
      read: kv.read.bind(kv),
      write: (key: string, value: string) =>
        key === KV_KEYS.syncBaseline ? Promise.reject(new Error('full')) : kv.write(key, value),
      delete: kv.delete.bind(kv),
    };
    await writeHeld(failing, withPlates(2));
    expect(await kv.read(KV_KEYS.syncBaseline)).toBeNull();
  });

  it('a new connection clears what an earlier vault left; so does leaving one', async () => {
    const { a } = await connected();
    const kv = a.bundle.kv;
    const connection = (await readConnection(kv))!;
    expect(await kv.read(KV_KEYS.syncBaseline)).not.toBeNull();
    await writeConnection(kv, connection);
    expect(await kv.read(KV_KEYS.syncBaseline)).toBeNull();
    await kv.write(KV_KEYS.syncBaseline, '1:' + 'a'.repeat(11));
    await clearConnection(kv);
    expect(await kv.read(KV_KEYS.syncBaseline)).toBeNull();
    expect(await readConnection(kv)).toBeNull();
  });
});
