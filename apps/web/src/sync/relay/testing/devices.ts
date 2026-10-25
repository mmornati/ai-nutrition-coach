// Test support: devices that sync through a FakeRelay, with timers and page events driven by hand.
// Test-only (nothing in the app imports it).
import type { VaultSnapshot } from '@anc/core';
import { memoryBundle, seedPlate, unlockedBundle, at } from '../../../app/testing';
import type { StoreBundle } from '../../../storage';
import { fastKdf } from '../../vault/testing';
import { createServerVault } from '../create';
import { DirtyFlagSyncQueue } from '../dirty-queue';
import { restoreServerCopyIntoNewStore } from '../restore';
import { openServerCopy } from '../server-copy';
import { SyncService, type SyncEvents, type SyncStatus, type SyncTimers } from '../sync-service';
import { FakeRelay } from './fake-relay';

export const PASS = 'a vault passphrase';
export const MAX = 20 * 1024 * 1024;

export const snapshotOf = async (bundle: StoreBundle): Promise<VaultSnapshot> => {
  const read = await bundle.vault.readSnapshot();
  if (read.kind !== 'vault') throw new Error('read');
  return read.value;
};
export const foods = async (bundle: StoreBundle) =>
  (await snapshotOf(bundle)).plates.flatMap((p) => p.entries.map((e) => e.displayName)).sort();

/** Timers and page events driven by hand. */
export function manual() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let id = 0;
  const hidden = new Set<() => void>();
  const online = new Set<() => void>();
  const visible = new Set<() => void>();
  const focus = new Set<() => void>();
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
    onVisible: (l) => (visible.add(l), () => void visible.delete(l)),
    onFocus: (l) => (focus.add(l), () => void focus.delete(l)),
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
    /** The person comes back to the page: the browser fires both of these. */
    return: () => [...visible, ...focus].forEach((l) => l()),
    show: () => [...visible].forEach((l) => l()),
    focus: () => [...focus].forEach((l) => l()),
  };
}

export const settled = async (): Promise<void> => {
  for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0));
};

export interface Device {
  bundle: StoreBundle;
  service: SyncService;
  queue: DirtyFlagSyncQueue;
  clock: ReturnType<typeof manual>;
  online: { value: boolean };
  stop(): void;
}

export async function attach(
  bundle: StoreBundle,
  relay: FakeRelay,
  options: { now?: () => number } = {},
): Promise<Device> {
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
    ...(options.now ? { now: options.now } : {}),
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
export async function connected(relay = new FakeRelay()) {
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
export async function secondDevice(relay: FakeRelay, options: { now?: () => number } = {}) {
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
  return attach(b, relay, options);
}

export const status = (d: Device): SyncStatus => d.service.getSnapshot();
export const phase = (d: Device) =>
  status(d).connected ? (status(d) as { phase: string }).phase : 'none';
export const puts = (relay: FakeRelay) => relay.requests.filter((r) => r.method === 'PUT');
