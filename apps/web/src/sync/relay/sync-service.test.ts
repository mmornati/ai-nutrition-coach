// The automatic backup: when a push runs, what it does on a conflict, offline, and the refusals
// that must stop it. Real store, real crypto (fast KDF), a fake relay that behaves like the real
// one, and timers and page events the test drives by hand.
import { describe, expect, it, vi } from 'vitest';
import type { VaultSnapshot } from '@anc/core';
import { at, memoryBundle, seedPlate, unlockedBundle } from '../../app/testing';
import type { StoreBundle } from '../../storage';
import { KV_KEYS } from '../../storage/key-value-store';
import { fastKdf } from '../vault/testing';
import { readConnection } from './connection';
import { createServerVault } from './create';
import { importVaultKey, sealSnapshot } from './crypto';
import { DirtyFlagSyncQueue } from './dirty-queue';
import { restoreServerCopyIntoNewStore } from './restore';
import { openServerCopy } from './server-copy';
import {
  adoptConnection,
  SyncService,
  type SyncEvents,
  type SyncStatus,
  type SyncTimers,
} from './sync-service';
import { FakeRelay } from './testing/fake-relay';
import { decodeBase64Url } from '@anc/core';

const PASS = 'a vault passphrase';
const MAX = 20 * 1024 * 1024;

const snapshotOf = async (bundle: StoreBundle): Promise<VaultSnapshot> => {
  const read = await bundle.vault.readSnapshot();
  if (read.kind !== 'vault') throw new Error('read');
  return read.value;
};
const foods = async (bundle: StoreBundle) =>
  (await snapshotOf(bundle)).plates.flatMap((p) => p.entries.map((e) => e.displayName)).sort();

/** Timers and page events driven by hand. */
function manual() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let id = 0;
  const hidden = new Set<() => void>();
  const online = new Set<() => void>();
  const timers: SyncTimers = {
    set(fn, ms) {
      const mine = ++id;
      pending.set(mine, { fn, ms });
      return () => void pending.delete(mine);
    },
  };
  const events: SyncEvents = {
    onHidden: (l) => (hidden.add(l), () => void hidden.delete(l)),
    onOnline: (l) => (online.add(l), () => void online.delete(l)),
  };
  return {
    timers,
    events,
    waits: () => [...pending.values()].map((t) => t.ms),
    async fire(): Promise<void> {
      const [key, t] = [...pending.entries()][0] ?? [];
      if (key === undefined || t === undefined) throw new Error('no timer is pending');
      pending.delete(key);
      t.fn();
      await settled();
    },
    hide: () => [...hidden].forEach((l) => l()),
    online: () => [...online].forEach((l) => l()),
  };
}

const settled = async (): Promise<void> => {
  for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0));
};

interface Device {
  bundle: StoreBundle;
  service: SyncService;
  queue: DirtyFlagSyncQueue;
  clock: ReturnType<typeof manual>;
  online: { value: boolean };
  stop(): void;
}

async function attach(bundle: StoreBundle, relay: FakeRelay): Promise<Device> {
  const clock = manual();
  const online = { value: true };
  const queue = new DirtyFlagSyncQueue(bundle.kv);
  const service = new SyncService({
    kv: bundle.kv,
    vault: bundle.vault,
    client: relay,
    queue,
    timers: clock.timers,
    events: clock.events,
    isOnline: () => online.value,
    maxVaultBytes: () => MAX,
  });
  await service.start();
  const stopWrites = bundle.controller.onWrite(() => service.noteWrite());
  return {
    bundle,
    service,
    queue,
    clock,
    online,
    stop: () => (stopWrites(), service.dispose()),
  };
}

/** Device A created the vault; returns it attached. */
async function connected(relay = new FakeRelay()) {
  const bundle = await unlockedBundle();
  await seedPlate(bundle, at(8, 0), [['Porridge', 'starch']]);
  const made = await createServerVault({
    client: relay,
    kdf: fastKdf,
    vault: bundle.vault,
    kv: bundle.kv,
    handle: 'alice',
    passphrase: PASS,
    maxVaultBytes: MAX,
  });
  if (made.kind !== 'created') throw new Error('create');
  relay.requests.length = 0;
  return { relay, a: await attach(bundle, relay) };
}

/** A second device that restored from the vault. */
async function secondDevice(relay: FakeRelay) {
  const b = memoryBundle();
  await b.controller.initialize();
  const opened = await openServerCopy({
    client: relay,
    kdf: fastKdf,
    handle: 'alice',
    passphrase: PASS,
  });
  if (opened.kind !== 'opened') throw new Error('open');
  const restored = await restoreServerCopyIntoNewStore({
    copy: opened.copy,
    passphrase: PASS,
    createStore: (p) => b.controller.createStore(p),
    vault: b.vault,
    kv: b.kv,
    eraser: b.eraser,
    now: Date.now,
  });
  if (restored.kind !== 'restored') throw new Error('restore');
  return attach(b, relay);
}

const status = (d: Device): SyncStatus => d.service.getSnapshot();
const phase = (d: Device) =>
  status(d).connected ? (status(d) as { phase: string }).phase : 'none';
const puts = (relay: FakeRelay) => relay.requests.filter((r) => r.method === 'PUT');

describe('starting', () => {
  it('a device with no connection stays silent: no timer, no request, nothing marked', async () => {
    const relay = new FakeRelay();
    const bundle = await unlockedBundle();
    const d = await attach(bundle, relay);
    await seedPlate(bundle, at(12, 0), [['Salmon', 'protein']]);
    expect(status(d)).toEqual({ connected: false });
    expect(d.clock.waits()).toEqual([]);
    expect(relay.requests).toEqual([]);
    expect(d.queue.dirty).toBe(false);
  });

  it('a connected device with nothing changed makes no request at all', async () => {
    const { relay, a } = await connected();
    expect(phase(a)).toBe('backedUp');
    expect(a.clock.waits()).toEqual([]);
    expect(relay.requests).toEqual([]);
  });

  it('changes left unsent by the last session are sent a few seconds after the next unlock', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    a.stop();
    // The flag survived: a new session over the same store finds it.
    const next = await attach(a.bundle, relay);
    expect(phase(next)).toBe('pending');
    expect(next.clock.waits()).toEqual([5_000]);
    await next.clock.fire();
    expect(phase(next)).toBe('backedUp');
    expect(relay.vaults.get('alice')?.version).toBe(2);
  });
});

describe('writing', () => {
  it('pushes about 30 s after the last write, as a compare-and-swap, and then says it is backed up', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    expect(phase(a)).toBe('pending');
    expect(a.clock.waits()).toEqual([30_000]);
    expect(a.queue.dirty).toBe(true);
    expect(await a.bundle.kv.read(KV_KEYS.syncDirty)).toBe('1');

    await a.clock.fire();
    expect(phase(a)).toBe('backedUp');
    expect(puts(relay).map((r) => r.ifMatch)).toEqual(['"1"']);
    expect(relay.vaults.get('alice')?.version).toBe(2);
    expect(a.queue.dirty).toBe(false);
    expect(await a.bundle.kv.read(KV_KEYS.syncDirty)).toBeNull();
    expect(await a.bundle.kv.read(KV_KEYS.syncLastSeenVersion)).toBe('2');
    const status_ = status(a);
    expect(status_.connected && status_.backedUpAt).not.toBeNull();
  });

  it('each write moves the push back: one timer at a time', async () => {
    const { a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await seedPlate(a.bundle, at(13, 0), [['Rice', 'starch']]);
    await seedPlate(a.bundle, at(14, 0), [['Apple', 'vegFruit']]);
    expect(a.clock.waits()).toEqual([30_000]);
  });

  it('the page going to the background sends what is waiting, now', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    a.clock.hide();
    await settled();
    expect(phase(a)).toBe('backedUp');
    expect(relay.vaults.get('alice')?.version).toBe(2);
    expect(a.clock.waits()).toEqual([]);
    // Nothing waiting: hiding again sends nothing.
    relay.requests.length = 0;
    a.clock.hide();
    await settled();
    expect(relay.requests).toEqual([]);
  });

  it('a write that lands during a push keeps the flag, and another push follows', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    relay.racePending = async () => {
      await seedPlate(a.bundle, at(13, 0), [['Rice', 'starch']]);
    };
    await a.clock.fire();
    // The first push (a conflict-free write) landed; the late write is still unacknowledged.
    expect(a.queue.dirty).toBe(true);
    expect(phase(a)).toBe('pending');
    await a.clock.fire();
    expect(phase(a)).toBe('backedUp');
    const remote = relay.vaults.get('alice')!;
    expect(remote.version).toBeGreaterThanOrEqual(2);
    expect(a.queue.dirty).toBe(false);
  });

  it('no request ever carries what was logged, the passphrase or the vault key', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.clock.fire();
    const connection = (await readConnection(a.bundle.kv))!;
    for (const secret of ['Salmon', 'Porridge', PASS, connection.vaultKey, connection.token]) {
      expect(relay.wire).not.toContain(secret);
    }
  });
});

describe('a conflict: another device pushed first', () => {
  it('pulls, merges, retries, and the relay ends with both devices’ plates', async () => {
    const { relay, a } = await connected();
    const b = await secondDevice(relay);
    await seedPlate(b.bundle, at(19, 0), [['Soup', 'vegFruit']]);
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    // B's push lands between A's read of the vault and A's write.
    relay.racePending = async () => {
      await b.clock.fire();
    };
    relay.requests.length = 0;
    await a.clock.fire();
    await vi.waitFor(() => expect(phase(a)).toBe('backedUp'));
    const methods = relay.requests.map((r) => `${r.method} ${r.ifMatch ?? ''}`.trim());
    expect(methods).toEqual([
      'GET', // A: nothing new yet
      'PUT "1"', // A writes, and in that moment ...
      'GET', // ... B pulls (nothing new) ...
      'PUT "1"', // ... and B's write lands first: A's is refused (412)
      'GET', // A pulls B's version and merges it
      'PUT "2"', // and writes again on top of it
    ]);
    expect(phase(a)).toBe('backedUp');
    expect(relay.vaults.get('alice')?.version).toBe(3);
    expect(await foods(a.bundle)).toEqual(['Porridge', 'Salmon', 'Soup']);
    // Every write was conditional: nothing ever overwrote blindly.
    expect(puts(relay).every((r) => r.ifMatch !== undefined)).toBe(true);
    // The relay's copy holds all three (B pulls it and sees A's plate).
    await b.service.syncNow();
    b.queue.markDirty();
    await b.service.syncNow();
    expect(await foods(b.bundle)).toEqual(['Porridge', 'Salmon', 'Soup']);
  });

  it('gives up after a few rounds against a vault that keeps changing, and tries again later', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    const originalPut = relay.putVault.bind(relay);
    relay.putVault = async (...args) => {
      const result = await originalPut(...args);
      return result.kind === 'ok' ? { kind: 'error', error: 'conflict' } : result;
    };
    await a.clock.fire();
    expect(phase(a)).toBe('failed');
    expect(a.queue.dirty).toBe(true);
    expect(a.clock.waits()).toEqual([60_000]);
  });
});

describe('pulling', () => {
  it('a copy pulled from the relay is not sent back: two idle devices do not bump the version for each other', async () => {
    const { relay, a } = await connected();
    const b = await secondDevice(relay);
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.clock.fire();
    expect(relay.vaults.get('alice')?.version).toBe(2);
    relay.requests.length = 0;

    // B has changed nothing: it takes A's version and has nothing to send.
    expect(await b.service.syncNow()).toEqual({ kind: 'backedUp' });
    expect(await foods(b.bundle)).toEqual(['Porridge', 'Salmon']);
    expect(puts(relay)).toEqual([]);
    expect(relay.vaults.get('alice')?.version).toBe(2);
    expect(b.queue.dirty).toBe(false);
    expect(await b.bundle.kv.read(KV_KEYS.syncDirty)).toBeNull();
    expect(await b.bundle.kv.read(KV_KEYS.syncLastSeenVersion)).toBe('2');

    // And the other way round: A takes nothing, sends nothing.
    expect(await a.service.syncNow()).toEqual({ kind: 'backedUp' });
    expect(puts(relay)).toEqual([]);
  });

  it('a device with its own unsent change still sends it after a pull', async () => {
    const { relay, a } = await connected();
    const b = await secondDevice(relay);
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.clock.fire();
    await seedPlate(b.bundle, at(19, 0), [['Soup', 'vegFruit']]);
    expect(await b.service.syncNow()).toEqual({ kind: 'backedUp' });
    expect(relay.vaults.get('alice')?.version).toBe(3);
    expect(await foods(b.bundle)).toEqual(['Porridge', 'Salmon', 'Soup']);
    expect(b.queue.dirty).toBe(false);
  });
});

describe('disconnecting during a round', () => {
  it('a round that outlives its connection does not write over the next one', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    const old = (await readConnection(a.bundle.kv))!;
    relay.racePending = async () => {
      // The person disconnects and connects again while the push is on the wire.
      await a.service.disconnect();
      await adoptConnection(a.service, a.bundle.kv, { ...old, lastSeenVersion: 1 }, false);
    };
    await a.clock.fire();
    // The old round's version 2 is not recorded as the new connection's.
    expect(await a.bundle.kv.read(KV_KEYS.syncLastSeenVersion)).toBe('1');
    expect(phase(a)).toBe('backedUp');
  });
});

describe('failing', () => {
  it('offline: nothing is sent, the flag stays, and it tries again with a growing wait', async () => {
    const { relay, a } = await connected();
    a.online.value = false;
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.clock.fire();
    expect(relay.requests).toEqual([]);
    expect(phase(a)).toBe('offline');
    expect(a.clock.waits()).toEqual([60_000]);
    await a.clock.fire();
    expect(a.clock.waits()).toEqual([120_000]);
    a.online.value = true;
    a.clock.online();
    await settled();
    expect(phase(a)).toBe('backedUp');
    expect(relay.vaults.get('alice')?.version).toBe(2);
  });

  it('a server that cannot be reached is "offline", one that answers badly is "failed"; both retry', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    relay.offline = true;
    await a.clock.fire();
    expect(phase(a)).toBe('offline');
    relay.offline = false;
    relay.broken = true;
    await a.clock.fire();
    expect(phase(a)).toBe('failed');
    relay.broken = false;
    await a.clock.fire();
    expect(phase(a)).toBe('backedUp');
    expect(await a.bundle.kv.read(KV_KEYS.syncDirty)).toBeNull();
  });

  it('rate limited: waits at least as long as the server asks', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    relay.rateLimited = true;
    await a.clock.fire();
    expect(phase(a)).toBe('failed');
    expect(a.clock.waits()).toEqual([60_000]);
  });
});

describe('refusals that retrying cannot fix stop the automatic backup', () => {
  it('an older copy than this device has seen: rolled back, nothing is written to the relay', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.clock.fire();
    const remote = relay.vaults.get('alice')!;
    // The relay (or a restored backup of it) goes back to version 1.
    remote.version = 1;
    remote.envelope = remote.previous!;
    await seedPlate(a.bundle, at(13, 0), [['Rice', 'starch']]);
    relay.requests.length = 0;
    await a.clock.fire();
    expect(phase(a)).toBe('rolledBack');
    expect(puts(relay)).toEqual([]);
    expect(a.clock.waits()).toEqual([]);
    expect(await foods(a.bundle)).toEqual(['Porridge', 'Rice', 'Salmon']);
    expect(await a.bundle.kv.read(KV_KEYS.syncLastSeenVersion)).toBe('2');
    // Further writes do not restart it by themselves.
    await seedPlate(a.bundle, at(14, 0), [['Apple', 'vegFruit']]);
    expect(a.clock.waits()).toEqual([]);
  });

  it('a revoked token: signed out; "Back up now" tries once more', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    relay.revoked = true;
    await a.clock.fire();
    expect(phase(a)).toBe('signedOut');
    expect(a.clock.waits()).toEqual([]);
    relay.revoked = false;
    expect(await a.service.syncNow()).toEqual({ kind: 'backedUp' });
    expect(phase(a)).toBe('backedUp');
  });

  it('a copy from a newer app: needs an update, and the local data is not touched', async () => {
    const { relay, a } = await connected();
    const connection = (await readConnection(a.bundle.kv))!;
    const key = await importVaultKey(decodeBase64Url(connection.vaultKey)!);
    const newer = {
      ...(await snapshotOf(a.bundle)),
      schemaVersion: 99,
    } as unknown as VaultSnapshot;
    const sealed = await sealSnapshot(key, connection.vaultId, 2, newer, MAX);
    if (sealed.kind !== 'sealed') throw new Error('seal');
    const remote = relay.vaults.get('alice')!;
    remote.version = 2;
    remote.envelope = sealed.envelope;
    const before = await snapshotOf(a.bundle);
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.clock.fire();
    expect(phase(a)).toBe('needsUpdate');
    expect(puts(relay)).toEqual([]);
    expect((await snapshotOf(a.bundle)).plates).toHaveLength(before.plates.length + 1);
    expect(remote.version).toBe(2);
  });

  it('a damaged copy: paused, not overwritten', async () => {
    const { relay, a } = await connected();
    const remote = relay.vaults.get('alice')!;
    remote.version = 2;
    remote.envelope = { ...remote.envelope, version: 2 };
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.clock.fire();
    expect(phase(a)).toBe('paused');
    expect(puts(relay)).toEqual([]);
  });
});

describe('connecting and disconnecting', () => {
  it('"Back up now" works at once and clears a stop', async () => {
    const { relay, a } = await connected();
    expect(await a.service.syncNow()).toEqual({ kind: 'backedUp' });
    expect(relay.vaults.get('alice')?.version).toBe(1);
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    expect(await a.service.syncNow()).toEqual({ kind: 'backedUp' });
    expect(relay.vaults.get('alice')?.version).toBe(2);
  });

  it('forgets the connection on this device only: the relay’s copy stays', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    expect(await a.service.disconnect()).toBe(true);
    expect(status(a)).toEqual({ connected: false });
    expect(await readConnection(a.bundle.kv)).toBeNull();
    expect(await a.bundle.kv.read(KV_KEYS.syncDirty)).toBeNull();
    expect(await a.bundle.kv.read(KV_KEYS.syncToken)).toBeNull();
    expect(relay.vaults.has('alice')).toBe(true);
    expect(await a.service.syncNow()).toEqual({ kind: 'notConnected' });
    expect(a.clock.waits()).toEqual([]);
  });

  it('a disposed session sends nothing, even if a timer was pending', async () => {
    const { relay, a } = await connected();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    a.service.dispose();
    expect(a.clock.waits()).toEqual([]);
    a.clock.hide();
    await settled();
    expect(relay.requests).toEqual([]);
  });

  it('the status can be watched', async () => {
    const { a } = await connected();
    const seen: string[] = [];
    a.service.subscribe(() => seen.push(phase(a)));
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.clock.fire();
    expect(seen).toEqual(['pending', 'syncing', 'backedUp']);
  });
});
