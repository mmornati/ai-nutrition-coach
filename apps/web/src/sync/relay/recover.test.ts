// Finding a copy with the recovery key changes nothing on the server until the person confirms:
// cancelling, or a copy that is refused, signs the recovery session out and leaves the passphrase.
import { describe, expect, it } from 'vitest';
import { at, seedPlate, unlockedBundle } from '../../app/testing';
import { fastKdf } from '../vault/testing';
import { recoverServerCopy } from './account';
import { createServerVault } from './create';
import { openServerCopy } from './server-copy';
import { FakeRelay } from './testing/fake-relay';

const OLD = 'a vault passphrase';
const NEW = 'lamp ocean velvet tractor';

async function vaultWithKey() {
  const relay = new FakeRelay();
  const device = await unlockedBundle();
  await seedPlate(device, at(12, 0), [['Salmon', 'protein']]);
  const made = await createServerVault({
    client: relay,
    kdf: fastKdf,
    vault: device.vault,
    kv: device.kv,
    handle: 'alice',
    passphrase: OLD,
    maxVaultBytes: 20 * 1024 * 1024,
  });
  if (made.kind !== 'created') throw new Error('create');
  return { relay, recoveryKey: made.recoveryKey };
}

const recover = (relay: FakeRelay, recoveryKey: string) =>
  recoverServerCopy({
    client: relay,
    kdf: fastKdf,
    handle: 'alice',
    recoveryKey,
    newPassphrase: NEW,
  });
const changed = (relay: FakeRelay) => relay.requests.filter((r) => r.path === '/passphrase');

describe('recovering a copy with the recovery key', () => {
  it('finds the copy without changing the passphrase on the server', async () => {
    const { relay, recoveryKey } = await vaultWithKey();
    const before = relay.vaults.get('alice')!.authKey;
    const tokensBefore = [...relay.tokens.keys()];
    const found = await recover(relay, recoveryKey);
    expect(found.kind).toBe('ok');
    if (found.kind !== 'ok') return;
    expect(found.value.copy.snapshot.plates).toHaveLength(1);
    expect(changed(relay)).toEqual([]);
    expect(relay.vaults.get('alice')!.authKey).toBe(before);
    // The other device is still signed in; the old passphrase still opens the copy.
    for (const t of tokensBefore) expect(relay.tokens.has(t)).toBe(true);
    await found.value.abandon();
  });

  it('cancelling signs the recovery session out and leaves the passphrase and other devices alone', async () => {
    const { relay, recoveryKey } = await vaultWithKey();
    const before = relay.vaults.get('alice')!.authKey;
    const tokensBefore = [...relay.tokens.keys()];
    const found = await recover(relay, recoveryKey);
    if (found.kind !== 'ok') throw new Error('recover');
    const orphan = found.value.copy.token;
    expect(relay.tokens.has(orphan)).toBe(true);
    await found.value.abandon();
    expect(relay.tokens.has(orphan)).toBe(false);
    expect(changed(relay)).toEqual([]);
    expect(relay.vaults.get('alice')!.authKey).toBe(before);
    for (const t of tokensBefore) expect(relay.tokens.has(t)).toBe(true);
    expect(found.value.copy.vaultKey.every((b) => b === 0)).toBe(true);
    // The old passphrase still works, the new one does not exist.
    const open = (passphrase: string) =>
      openServerCopy({ client: relay, kdf: fastKdf, handle: 'alice', passphrase });
    expect((await open(OLD)).kind).toBe('opened');
    expect((await open(NEW)).kind).toBe('failed');
    // A late confirm after cancelling does nothing.
    expect((await found.value.confirm()).kind).toBe('failed');
    expect(changed(relay)).toEqual([]);
  });

  it('confirming sets the new passphrase, signs the other devices out and keeps this session', async () => {
    const { relay, recoveryKey } = await vaultWithKey();
    const others = [...relay.tokens.keys()];
    const found = await recover(relay, recoveryKey);
    if (found.kind !== 'ok') throw new Error('recover');
    expect((await found.value.confirm()).kind).toBe('ok');
    expect(changed(relay)).toHaveLength(1);
    for (const t of others) expect(relay.tokens.has(t)).toBe(false);
    expect(relay.tokens.has(found.value.copy.token)).toBe(true);
    // A cancel after confirming must not sign the new session out.
    await found.value.abandon();
    expect(relay.tokens.has(found.value.copy.token)).toBe(true);
    expect(
      (await openServerCopy({ client: relay, kdf: fastKdf, handle: 'alice', passphrase: NEW }))
        .kind,
    ).toBe('opened');
  });

  it('a confirm the server refuses leaves the session and can be tried again', async () => {
    const { relay, recoveryKey } = await vaultWithKey();
    const found = await recover(relay, recoveryKey);
    if (found.kind !== 'ok') throw new Error('recover');
    relay.offline = true;
    expect(await found.value.confirm()).toMatchObject({ kind: 'failed', failure: 'offline' });
    relay.offline = false;
    expect(relay.tokens.has(found.value.copy.token)).toBe(true);
    expect((await found.value.confirm()).kind).toBe('ok');
  });
});
