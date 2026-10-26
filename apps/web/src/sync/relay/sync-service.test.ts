// The automatic backup: when a push runs, what it does on a conflict, offline, and the refusals
// that must stop it. Real store, real crypto (fast KDF), a fake relay that behaves like the real
// one, and timers and page events the test drives by hand.
import { describe, expect, it } from 'vitest';
import { decodeBase64Url, type VaultSnapshot } from '@anc/core';
import { at, seedPlate, unlockedBundle } from '../../app/testing';
import { KV_KEYS } from '../../storage/key-value-store';
import { readConnection } from './connection';
import { importVaultKey, sealSnapshot } from './crypto';
import { adoptConnection } from './sync-service';
import { FakeRelay } from './testing/fake-relay';
import {
  attach,
  connected,
  foods,
  MAX,
  PASS,
  phase,
  puts,
  secondDevice,
  settled,
  snapshotOf,
  status,
} from './testing/devices';

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

  it('a connected device with nothing changed asks nothing until it pulls, a moment after unlock', async () => {
    const { relay, a } = await connected();
    expect(phase(a)).toBe('backedUp');
    expect(a.clock.waits()).toEqual([1_000]);
    expect(relay.requests).toEqual([]);
    await a.clock.fire();
    // One conditional read, answered "not modified": nothing is written, nothing is applied.
    expect(relay.requests.map((r) => r.method)).toEqual(['GET']);
    expect(relay.notModified).toBe(1);
    expect(phase(a)).toBe('backedUp');
    expect(a.clock.waits()).toEqual([]);
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

describe('a pending retry is not cut short by coming back to the page', () => {
  async function failing() {
    let t = 1_900_000_000_000;
    const { relay, a: first } = await connected();
    first.stop();
    const a = await attach(first.bundle, relay, { now: () => t });
    return { relay, a, advance: (ms: number) => void (t += ms) };
  }

  it('a focus pull while the growing wait runs sends nothing and leaves the timer alone', async () => {
    const { relay, a, advance } = await failing();
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    relay.broken = true;
    await a.clock.fire();
    expect(phase(a)).toBe('failed');
    expect(a.clock.waits()).toEqual([60_000]);
    relay.requests.length = 0;
    advance(46_000); // past the pull interval, before the retry
    a.clock.return();
    await settled();
    expect(relay.requests).toEqual([]);
    expect(a.clock.waits()).toEqual([60_000]);
    // Once the wait is over a focus pull is allowed again.
    advance(15_000);
    relay.broken = false;
    a.clock.return();
    await settled();
    expect(relay.vaults.get('alice')?.version).toBe(2);
  });

  it('the network coming back retries at once, unless the server asked for a wait', async () => {
    const plain = await failing();
    await seedPlate(plain.a.bundle, at(12, 0), [['Salmon', 'protein']]);
    plain.relay.broken = true;
    await plain.a.clock.fire();
    plain.relay.broken = false;
    plain.relay.requests.length = 0;
    plain.a.clock.online();
    await settled();
    expect(plain.relay.vaults.get('alice')?.version).toBe(2);

    const limited = await failing();
    await seedPlate(limited.a.bundle, at(12, 0), [['Salmon', 'protein']]);
    limited.relay.rateLimited = true;
    await limited.a.clock.fire();
    limited.relay.rateLimited = false;
    limited.relay.requests.length = 0;
    limited.a.clock.online();
    await settled();
    expect(limited.relay.requests).toEqual([]);
    expect(limited.a.clock.waits()).toEqual([60_000]);
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

  it('a copy from a newer app asks the service worker for a newer build, once', async () => {
    const first = await connected();
    first.a.stop();
    let asked = 0;
    const a = await attach(first.a.bundle, first.relay, { onNeedsUpdate: () => void asked++ });
    const connection = (await readConnection(a.bundle.kv))!;
    const key = await importVaultKey(decodeBase64Url(connection.vaultKey)!);
    const newer = {
      ...(await snapshotOf(a.bundle)),
      schemaVersion: 99,
    } as unknown as VaultSnapshot;
    const sealed = await sealSnapshot(key, connection.vaultId, 2, newer, MAX);
    if (sealed.kind !== 'sealed') throw new Error('seal');
    const remote = first.relay.vaults.get('alice')!;
    remote.version = 2;
    remote.envelope = sealed.envelope;
    await a.clock.fire();
    expect(phase(a)).toBe('needsUpdate');
    expect(asked).toBe(1);
    await a.service.syncNow();
    expect(asked).toBe(1);
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
    a.service.subscribe(() => {
      if (seen[seen.length - 1] !== phase(a)) seen.push(phase(a));
    });
    await seedPlate(a.bundle, at(12, 0), [['Salmon', 'protein']]);
    await a.clock.fire();
    expect(seen).toEqual(['backedUp', 'pending', 'syncing', 'backedUp']);
  });
});
