// The first-run screen and the unlocked app with a relay on this server: "Restore from this
// server" (Case A) and "Start fresh from the server copy" (the erase that restores). Real store,
// real crypto (a fast stand-in for Argon2id), a fake relay that behaves like the real one.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { PrivacyPrefs } from '../catalog';
import { readConnection, createServerVault } from '../sync';
import { FakeRelay } from '../sync/relay/testing/fake-relay';
import { inertSync, offerOf, OPEN_CONFIG } from '../sync/relay/testing/ui';
import { fastKdf } from '../sync/vault/testing';
import { KV_KEYS } from '../storage';
import { forgetAcknowledgedBeforeStore } from './about-ack';
import { Gate } from './Gate';
import { at, memoryBundle, seedPlate, unlockedBundle } from './testing';
import type { StoreBundle } from '../storage';

afterEach(() => {
  forgetAcknowledgedBeforeStore();
  window.location.hash = '';
});

const VAULT_PASSPHRASE = 'a vault passphrase';
const today = () => screen.findByRole('heading', { level: 1, name: 'Today' });

async function dismissAbout(user: ReturnType<typeof userEvent.setup>) {
  expect(await screen.findByRole('heading', { name: 'About this app' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Got it' }));
}

/** A device with these plates and a vault on the relay under `alice`. */
async function vaultWith(relay: FakeRelay, ...names: string[]): Promise<StoreBundle> {
  const source = await unlockedBundle();
  await new PrivacyPrefs(source.kv).acknowledgeAbout();
  for (const [i, name] of names.entries())
    await seedPlate(source, at(8 + i, 0), [[name, 'protein']]);
  const made = await createServerVault({
    client: relay,
    kdf: fastKdf,
    vault: source.vault,
    kv: source.kv,
    handle: 'alice',
    passphrase: VAULT_PASSPHRASE,
    maxVaultBytes: 20 * 1024 * 1024,
  });
  if (made.kind !== 'created') throw new Error('create');
  return source;
}

const seams = (relay: FakeRelay, config: unknown | null = OPEN_CONFIG) => ({
  client: relay,
  kdf: fastKdf,
  offer: offerOf(config),
  ...inertSync(),
});

async function firstRun(relay: FakeRelay, config: unknown | null = OPEN_CONFIG) {
  const user = userEvent.setup();
  const bundle = memoryBundle();
  await bundle.controller.initialize();
  render(<Gate bundle={bundle} sync={seams(relay, config)} />);
  await dismissAbout(user);
  await screen.findByRole('heading', { name: 'Protect your history' });
  return { user, bundle };
}

async function findCopy(user: ReturnType<typeof userEvent.setup>, handle: string, pass: string) {
  await user.type(screen.getByLabelText('Handle'), handle);
  await user.type(screen.getByLabelText('Passphrase of the copy'), pass);
  await user.click(screen.getByRole('button', { name: 'Find my copy' }));
}

describe('first run: Restore from this server', () => {
  it('is not there when this server has no relay: the screen is what it was', async () => {
    await firstRun(new FakeRelay(), null);
    expect(screen.getByRole('button', { name: 'Restore from a backup' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Restore from this server' })).toBeNull();
  });

  it('finds the copy, shows what it holds, then creates the store and lands on Today with the plates', async () => {
    const relay = new FakeRelay();
    await vaultWith(relay, 'Porridge', 'Salmon');
    const { user, bundle } = await firstRun(relay);
    await user.click(await screen.findByRole('button', { name: 'Restore from this server' }));
    await findCopy(user, 'Alice', VAULT_PASSPHRASE);
    expect(
      await screen.findByText(/^Found your data: 2 plates, from \p{L}+ \d{4} to today\.$/u),
    ).toBeVisible();
    // Nothing exists locally yet.
    expect(bundle.controller.getSnapshot().status).toBe('needsPassphraseCreation');
    await user.click(screen.getByRole('button', { name: 'Restore and unlock' }));

    expect(await today()).toBeVisible();
    expect(await screen.findByText('Porridge')).toBeVisible();
    expect(await screen.findByText('Salmon')).toBeVisible();
    expect(await readConnection(bundle.kv)).toMatchObject({ handle: 'alice', lastSeenVersion: 1 });
    // The copy's passphrase is this device's now.
    await bundle.controller.lock();
    expect((await bundle.controller.unlock(VAULT_PASSPHRASE)).kind).toBe('unlocked');
    // Nothing was pushed by restoring.
    expect(relay.requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  it('one ambiguous line for a wrong passphrase or an unknown handle; no store is created', async () => {
    const relay = new FakeRelay();
    await vaultWith(relay, 'Porridge');
    const { user, bundle } = await firstRun(relay);
    await user.click(await screen.findByRole('button', { name: 'Restore from this server' }));
    const none = 'Nothing on this server matches this handle and passphrase.';
    await findCopy(user, 'alice', 'not the passphrase');
    expect(await screen.findByText(none)).toBeVisible();
    await user.clear(screen.getByLabelText('Handle'));
    await findCopy(user, 'nobody', VAULT_PASSPHRASE);
    expect(await screen.findByText(none)).toBeVisible();
    expect(bundle.controller.getSnapshot().status).toBe('needsPassphraseCreation');
    relay.rateLimited = true;
    await user.clear(screen.getByLabelText('Handle'));
    await findCopy(user, 'alice', VAULT_PASSPHRASE);
    expect(
      await screen.findByText('Too many tries. Wait a few minutes, then try again.'),
    ).toBeVisible();
  });

  it('a copy whose passphrase is too weak for a device is refused calmly, and no store is created', async () => {
    const relay = new FakeRelay();
    await vaultWith(relay, 'Porridge');
    const { user, bundle } = await firstRun(relay);
    await user.click(await screen.findByRole('button', { name: 'Restore from this server' }));
    await findCopy(user, 'alice', VAULT_PASSPHRASE);
    await screen.findByText(/^Found your data/);
    // Simulate a copy whose passphrase is below the floor by restoring with a short one.
    const { restoreServerCopyIntoNewStore, openServerCopy } = await import('../sync');
    const opened = await openServerCopy({
      client: relay,
      kdf: fastKdf,
      handle: 'alice',
      passphrase: VAULT_PASSPHRASE,
    });
    if (opened.kind !== 'opened') throw new Error('open');
    const refused = await restoreServerCopyIntoNewStore({
      copy: opened.copy,
      passphrase: 'short',
      createStore: (p) => bundle.controller.createStore(p),
      vault: bundle.vault,
      kv: bundle.kv,
      eraser: bundle.eraser,
      now: Date.now,
    });
    expect(refused.kind).toBe('passphraseRejected');
    expect(bundle.controller.getSnapshot().status).toBe('needsPassphraseCreation');
  });

  it('going back drops the copy, and creating a passphrase is still possible', async () => {
    const relay = new FakeRelay();
    await vaultWith(relay, 'Porridge');
    const { user, bundle } = await firstRun(relay);
    await user.click(await screen.findByRole('button', { name: 'Restore from this server' }));
    await findCopy(user, 'alice', VAULT_PASSPHRASE);
    await screen.findByText(/^Found your data/);
    await user.click(screen.getByRole('button', { name: 'Back to creating a passphrase' }));
    expect(await screen.findByRole('heading', { name: 'Protect your history' })).toBeVisible();
    expect(bundle.controller.getSnapshot().status).toBe('needsPassphraseCreation');
  });

  it('if the store cannot take the data, no store is left and the copy on the server is untouched', async () => {
    const relay = new FakeRelay();
    await vaultWith(relay, 'Porridge');
    const { user, bundle } = await firstRun(relay);
    const original = bundle.vault.applySnapshot.bind(bundle.vault);
    bundle.vault.applySnapshot = () =>
      Promise.resolve({ kind: 'vaultFailed', reason: 'storeOperation' });
    await user.click(await screen.findByRole('button', { name: 'Restore from this server' }));
    await findCopy(user, 'alice', VAULT_PASSPHRASE);
    await user.click(await screen.findByRole('button', { name: 'Restore and unlock' }));
    expect(await screen.findByText(/could not be added to this device just now/)).toBeVisible();
    await waitFor(() =>
      expect(bundle.controller.getSnapshot().status).toBe('needsPassphraseCreation'),
    );
    expect(relay.vaults.get('alice')?.version).toBe(1);
    bundle.vault.applySnapshot = original;
  });
});

describe('Your data: Start fresh from the server copy', () => {
  it('erases this device, restores the copy it had opened and lands on Today with the server’s plates only', async () => {
    const relay = new FakeRelay();
    await vaultWith(relay, 'Porridge');
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await new PrivacyPrefs(bundle.kv).acknowledgeAbout();
    await seedPlate(bundle, at(9, 0), [['Toast', 'starch']]);
    window.location.hash = '#/settings/data';
    render(<Gate bundle={bundle} sync={seams(relay)} />);
    await screen.findByRole('heading', { level: 1, name: 'Your data' });
    const join = (
      await screen.findByRole('heading', { level: 2, name: 'Connect to this server’s copy' })
    ).closest('section')!;
    await user.type(within(join).getByLabelText('Handle'), 'alice');
    await user.type(within(join).getByLabelText('Passphrase of the copy'), VAULT_PASSPHRASE);
    await user.click(within(join).getByRole('button', { name: 'Find my copy' }));
    await user.click(await screen.findByText('Other options'));
    expect(
      screen.getAllByText(
        'The 1 plate that is only on this device will be removed from this device.',
      ).length,
    ).toBeGreaterThan(0);
    await user.click(
      screen.getByRole('button', { name: 'Erase this device and restore from the server' }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Erase and restore',
      }),
    );

    // Back on a device that has the server's data, connected, unlocked with the copy's passphrase.
    await waitFor(
      async () => expect(await readConnection(bundle.kv)).toMatchObject({ handle: 'alice' }),
      { timeout: 5000 },
    );
    window.location.hash = '#/';
    expect(await today()).toBeVisible();
    expect(await screen.findByText('Porridge')).toBeVisible();
    expect(screen.queryByText('Toast')).toBeNull();
    // The copy on the server was not changed, and the device kept nothing of the old store.
    expect(relay.vaults.get('alice')?.version).toBe(1);
    expect(await bundle.kv.read(KV_KEYS.syncDirty)).toBeNull();
    await bundle.controller.lock();
    expect((await bundle.controller.unlock(VAULT_PASSPHRASE)).kind).toBe('unlocked');
  });
});
